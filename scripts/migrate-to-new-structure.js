#!/usr/bin/env node

/**
 * データ構造を新しい形式に移行するスクリプト
 *
 * 変換内容:
 * - Message から prevInLine, nextInLine, branchFromMessageId を削除
 * - Line から messageIds, startMessageId, endMessageId, branchFromMessageId を削除
 * - Line に parent_line_id を追加（BranchPoint から推定）
 * - BranchPoint コレクションを削除
 *
 * 使用方法:
 *   # ドライラン（実際には更新しない）
 *   node scripts/migrate-to-new-structure.js <conversationId> --dry-run
 *
 *   # 本番実行（バックアップ後に更新）
 *   node scripts/migrate-to-new-structure.js <conversationId>
 *
 *   # 新しい会話IDに移行（元データは保持）
 *   node scripts/migrate-to-new-structure.js <conversationId> --to <newConversationId>
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const {
  CONVERSATIONS_COLLECTION,
  MESSAGES_SUBCOLLECTION,
  LINES_SUBCOLLECTION,
  BRANCH_POINTS_SUBCOLLECTION,
  TAGS_SUBCOLLECTION,
  TAG_GROUPS_SUBCOLLECTION,
} = require('../lib/firestore-constants');

// Firebase Admin SDK 初期化
const serviceAccount = require('../firebase-service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// コマンドライン引数を解析
function parseArgs() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('使用方法: node scripts/migrate-to-new-structure.js <conversationId> [--dry-run] [--to <newConversationId>]');
    process.exit(1);
  }

  const conversationId = args[0];
  const dryRun = args.includes('--dry-run');

  const toIndex = args.indexOf('--to');
  const targetConversationId = toIndex !== -1 && args[toIndex + 1] ? args[toIndex + 1] : conversationId;

  return { conversationId, targetConversationId, dryRun };
}

// バックアップディレクトリを作成
function createBackupDir() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const backupDir = path.join(__dirname, '../output/backups', timestamp);
  fs.mkdirSync(backupDir, { recursive: true });
  return backupDir;
}

// サブコレクションをバックアップ
async function backupSubcollection(conversationRef, subcollectionName, backupDir) {
  console.log(`📥 ${subcollectionName} をバックアップ中...`);
  const snapshot = await conversationRef.collection(subcollectionName).get();

  const data = {};
  snapshot.forEach(doc => {
    data[doc.id] = doc.data();
  });

  const filePath = path.join(backupDir, `${subcollectionName}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');

  console.log(`   ✅ ${snapshot.size} 件をバックアップ: ${filePath}`);
  return data;
}

// Line の parent_line_id を構築
function buildParentLineIds(lines, branchPoints) {
  const parentLineIds = {};

  // 初期値: すべて null（ルートライン）
  Object.keys(lines).forEach(lineId => {
    parentLineIds[lineId] = null;
  });

  // BranchPoint から parent_line_id を推定
  Object.values(branchPoints).forEach(bp => {
    const { messageId, lines: branchLineIds } = bp;

    // このメッセージが属するラインを見つける
    // lines オブジェクトのキーがラインIDで、値がラインデータ
    let parentLineId = null;
    for (const [lineId, lineData] of Object.entries(lines)) {
      if (lineData.messageIds && lineData.messageIds.includes(messageId)) {
        parentLineId = lineId;
        break;
      }
    }

    if (parentLineId) {
      // 分岐したラインの parent_line_id を設定
      branchLineIds.forEach(branchLineId => {
        parentLineIds[branchLineId] = parentLineId;
      });
    }
  });

  return parentLineIds;
}

// Message を新しい構造に変換
function convertMessage(message) {
  const newMessage = { ...message };

  // 旧フィールドを削除
  delete newMessage.prevInLine;
  delete newMessage.nextInLine;
  delete newMessage.branchFromMessageId;

  return newMessage;
}

// Line を新しい構造に変換
function convertLine(line, parentLineId) {
  const newLine = { ...line };

  // 旧フィールドを削除
  delete newLine.messageIds;
  delete newLine.startMessageId;
  delete newLine.endMessageId;
  delete newLine.branchFromMessageId;

  // parent_line_id を追加
  newLine.parent_line_id = parentLineId;

  return newLine;
}

async function migrateData() {
  try {
    const { conversationId, targetConversationId, dryRun } = parseArgs();

    console.log('🚀 データ移行スクリプト開始\n');
    console.log(`   元の会話ID: ${conversationId}`);
    console.log(`   移行先の会話ID: ${targetConversationId}`);
    console.log(`   ドライラン: ${dryRun ? 'はい' : 'いいえ'}\n`);

    const conversationRef = db.collection(CONVERSATIONS_COLLECTION).doc(conversationId);
    const targetConversationRef = db.collection(CONVERSATIONS_COLLECTION).doc(targetConversationId);

    // バックアップディレクトリを作成
    const backupDir = createBackupDir();
    console.log(`📁 バックアップディレクトリ: ${backupDir}\n`);

    // 全サブコレクションをバックアップ
    console.log('=== バックアップ開始 ===\n');

    const [messages, lines, branchPoints, tags, tagGroups] = await Promise.all([
      backupSubcollection(conversationRef, MESSAGES_SUBCOLLECTION, backupDir),
      backupSubcollection(conversationRef, LINES_SUBCOLLECTION, backupDir),
      backupSubcollection(conversationRef, BRANCH_POINTS_SUBCOLLECTION, backupDir),
      backupSubcollection(conversationRef, TAGS_SUBCOLLECTION, backupDir),
      backupSubcollection(conversationRef, TAG_GROUPS_SUBCOLLECTION, backupDir),
    ]);

    console.log('\n✅ バックアップ完了\n');

    // データ変換
    console.log('=== データ変換開始 ===\n');

    // Line の parent_line_id を構築
    console.log('🔧 Line の parent_line_id を構築中...');
    const parentLineIds = buildParentLineIds(lines, branchPoints);
    console.log(`   ✅ ${Object.keys(parentLineIds).length} 件の Line を処理\n`);

    // Message を変換
    console.log('🔧 Message を変換中...');
    const convertedMessages = {};
    Object.entries(messages).forEach(([id, message]) => {
      convertedMessages[id] = convertMessage(message);
    });
    console.log(`   ✅ ${Object.keys(convertedMessages).length} 件の Message を変換\n`);

    // Line を変換
    console.log('🔧 Line を変換中...');
    const convertedLines = {};
    Object.entries(lines).forEach(([id, line]) => {
      const parentLineId = parentLineIds[id];
      convertedLines[id] = convertLine(line, parentLineId);
    });
    console.log(`   ✅ ${Object.keys(convertedLines).length} 件の Line を変換\n`);

    console.log('=== データ変換完了 ===\n');

    // 変換後のデータを保存
    const convertedDir = path.join(backupDir, 'converted');
    fs.mkdirSync(convertedDir, { recursive: true });

    fs.writeFileSync(
      path.join(convertedDir, 'messages.json'),
      JSON.stringify(convertedMessages, null, 2),
      'utf8'
    );
    fs.writeFileSync(
      path.join(convertedDir, 'lines.json'),
      JSON.stringify(convertedLines, null, 2),
      'utf8'
    );

    console.log(`📁 変換後のデータを保存: ${convertedDir}\n`);

    if (dryRun) {
      console.log('⚠️  ドライランモードのため、Firestoreへの書き込みはスキップします。\n');
      console.log('変換後のデータは以下で確認できます:');
      console.log(`  ${convertedDir}/messages.json`);
      console.log(`  ${convertedDir}/lines.json\n`);
      process.exit(0);
    }

    // Firestore に書き込み
    console.log('=== Firestore への書き込み開始 ===\n');

    const batch = db.batch();
    let operationCount = 0;

    // Message を書き込み
    console.log('📝 Message を書き込み中...');
    Object.entries(convertedMessages).forEach(([id, message]) => {
      const docRef = targetConversationRef.collection(MESSAGES_SUBCOLLECTION).doc(id);
      batch.set(docRef, message);
      operationCount++;

      // Firestore の batch 制限（500操作）を超えないように分割
      if (operationCount >= 450) {
        console.log('   バッチ実行中...');
        // この時点では batch.commit() せず、後でまとめて実行
      }
    });
    console.log(`   ✅ ${Object.keys(convertedMessages).length} 件を準備\n`);

    // Line を書き込み
    console.log('📝 Line を書き込み中...');
    Object.entries(convertedLines).forEach(([id, line]) => {
      const docRef = targetConversationRef.collection(LINES_SUBCOLLECTION).doc(id);
      batch.set(docRef, line);
      operationCount++;
    });
    console.log(`   ✅ ${Object.keys(convertedLines).length} 件を準備\n`);

    // Tags と TagGroups をコピー（変更なし）
    console.log('📝 Tags と TagGroups をコピー中...');
    Object.entries(tags).forEach(([id, tag]) => {
      const docRef = targetConversationRef.collection(TAGS_SUBCOLLECTION).doc(id);
      batch.set(docRef, tag);
      operationCount++;
    });
    Object.entries(tagGroups).forEach(([id, tagGroup]) => {
      const docRef = targetConversationRef.collection(TAG_GROUPS_SUBCOLLECTION).doc(id);
      batch.set(docRef, tagGroup);
      operationCount++;
    });
    console.log(`   ✅ Tags: ${Object.keys(tags).length} 件, TagGroups: ${Object.keys(tagGroups).length} 件を準備\n`);

    // BranchPoint は削除（書き込まない）
    console.log('🗑️  BranchPoint コレクションは移行しません（新構造では不要）\n');

    // バッチを実行
    console.log('💾 Firestore にコミット中...');

    if (operationCount > 500) {
      console.log(`   警告: 操作数が ${operationCount} 件です。Firestore の制限（500件）を超えているため、分割して実行します。`);

      // 手動で分割実行
      let currentBatch = db.batch();
      let currentCount = 0;
      let batchNumber = 1;

      // Message
      for (const [id, message] of Object.entries(convertedMessages)) {
        const docRef = targetConversationRef.collection(MESSAGES_SUBCOLLECTION).doc(id);
        currentBatch.set(docRef, message);
        currentCount++;

        if (currentCount >= 500) {
          console.log(`   バッチ ${batchNumber} を実行中... (${currentCount} 件)`);
          await currentBatch.commit();
          currentBatch = db.batch();
          currentCount = 0;
          batchNumber++;
        }
      }

      // Line
      for (const [id, line] of Object.entries(convertedLines)) {
        const docRef = targetConversationRef.collection(LINES_SUBCOLLECTION).doc(id);
        currentBatch.set(docRef, line);
        currentCount++;

        if (currentCount >= 500) {
          console.log(`   バッチ ${batchNumber} を実行中... (${currentCount} 件)`);
          await currentBatch.commit();
          currentBatch = db.batch();
          currentCount = 0;
          batchNumber++;
        }
      }

      // Tags
      for (const [id, tag] of Object.entries(tags)) {
        const docRef = targetConversationRef.collection(TAGS_SUBCOLLECTION).doc(id);
        currentBatch.set(docRef, tag);
        currentCount++;

        if (currentCount >= 500) {
          console.log(`   バッチ ${batchNumber} を実行中... (${currentCount} 件)`);
          await currentBatch.commit();
          currentBatch = db.batch();
          currentCount = 0;
          batchNumber++;
        }
      }

      // TagGroups
      for (const [id, tagGroup] of Object.entries(tagGroups)) {
        const docRef = targetConversationRef.collection(TAG_GROUPS_SUBCOLLECTION).doc(id);
        currentBatch.set(docRef, tagGroup);
        currentCount++;

        if (currentCount >= 500) {
          console.log(`   バッチ ${batchNumber} を実行中... (${currentCount} 件)`);
          await currentBatch.commit();
          currentBatch = db.batch();
          currentCount = 0;
          batchNumber++;
        }
      }

      // 最後のバッチを実行
      if (currentCount > 0) {
        console.log(`   バッチ ${batchNumber} を実行中... (${currentCount} 件)`);
        await currentBatch.commit();
      }

    } else {
      await batch.commit();
    }

    console.log('   ✅ コミット完了\n');

    console.log('=== Firestore への書き込み完了 ===\n');

    console.log('✨ 移行が完了しました！\n');

    console.log('📋 次のステップ:');
    console.log('  1. check-old-fields-in-firestore.js を実行して、旧フィールドが削除されていることを確認');
    console.log('  2. check-new-data-integrity.js を実行して、新しいデータ構造の整合性を確認');
    console.log(`  3. バックアップは ${backupDir} に保存されています\n`);

    if (conversationId !== targetConversationId) {
      console.log(`💡 元のデータ（${conversationId}）は保持されています。`);
      console.log(`   新しいデータ（${targetConversationId}）で問題がなければ、元のデータを削除できます。\n`);
    }

    process.exit(0);

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  }
}

migrateData();

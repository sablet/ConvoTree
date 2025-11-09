#!/usr/bin/env node

/**
 * バックアップからデータをリストアするスクリプト
 *
 * 使用方法:
 *   node scripts/restore-from-backup.js <backupDir> <conversationId>
 *
 * 例:
 *   node scripts/restore-from-backup.js output/backups/2025-11-09-07-46-32 chat-minimal-conversation-1
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

  if (args.length < 2) {
    console.error('使用方法: node scripts/restore-from-backup.js <backupDir> <conversationId>');
    console.error('例: node scripts/restore-from-backup.js output/backups/2025-11-09-07-46-32 chat-minimal-conversation-1');
    process.exit(1);
  }

  const backupDir = args[0];
  const conversationId = args[1];

  // バックアップディレクトリの存在確認
  if (!fs.existsSync(backupDir)) {
    console.error(`❌ バックアップディレクトリが見つかりません: ${backupDir}`);
    process.exit(1);
  }

  return { backupDir, conversationId };
}

// バックアップファイルを読み込み
function loadBackupFile(backupDir, filename) {
  const filePath = path.join(backupDir, filename);

  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  ${filename} が見つかりません（スキップします）`);
    return {};
  }

  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  console.log(`   ✅ ${filename} を読み込み: ${Object.keys(data).length} 件`);
  return data;
}

// サブコレクションをリストア
async function restoreSubcollection(conversationRef, subcollectionName, data) {
  if (Object.keys(data).length === 0) {
    console.log(`   ${subcollectionName}: データなし（スキップ）`);
    return;
  }

  console.log(`📝 ${subcollectionName} をリストア中...`);

  const batch = db.batch();
  let count = 0;

  Object.entries(data).forEach(([id, docData]) => {
    const docRef = conversationRef.collection(subcollectionName).doc(id);
    batch.set(docRef, docData);
    count++;
  });

  await batch.commit();
  console.log(`   ✅ ${count} 件をリストア`);
}

async function restoreData() {
  try {
    const { backupDir, conversationId } = parseArgs();

    console.log('🔄 バックアップからリストア開始\n');
    console.log(`   バックアップディレクトリ: ${backupDir}`);
    console.log(`   リストア先の会話ID: ${conversationId}\n`);

    // バックアップファイルを読み込み
    console.log('=== バックアップファイル読み込み ===\n');

    const messages = loadBackupFile(backupDir, `${MESSAGES_SUBCOLLECTION}.json`);
    const lines = loadBackupFile(backupDir, `${LINES_SUBCOLLECTION}.json`);
    const branchPoints = loadBackupFile(backupDir, `${BRANCH_POINTS_SUBCOLLECTION}.json`);
    const tags = loadBackupFile(backupDir, `${TAGS_SUBCOLLECTION}.json`);
    const tagGroups = loadBackupFile(backupDir, `${TAG_GROUPS_SUBCOLLECTION}.json`);

    console.log('\n✅ ファイル読み込み完了\n');

    // リストア前に確認
    console.log('⚠️  注意: 既存のデータは上書きされます。');
    console.log('   続行しますか？ (y/N): ');

    // 標準入力から確認を取得（シンプルな実装）
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question('', async (answer) => {
      if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
        console.log('\n❌ リストアをキャンセルしました。');
        rl.close();
        process.exit(0);
      }

      rl.close();

      const conversationRef = db.collection(CONVERSATIONS_COLLECTION).doc(conversationId);

      // サブコレクションをリストア
      console.log('\n=== サブコレクションをリストア ===\n');

      await restoreSubcollection(conversationRef, MESSAGES_SUBCOLLECTION, messages);
      await restoreSubcollection(conversationRef, LINES_SUBCOLLECTION, lines);
      await restoreSubcollection(conversationRef, BRANCH_POINTS_SUBCOLLECTION, branchPoints);
      await restoreSubcollection(conversationRef, TAGS_SUBCOLLECTION, tags);
      await restoreSubcollection(conversationRef, TAG_GROUPS_SUBCOLLECTION, tagGroups);

      console.log('\n=== リストア完了 ===\n');

      console.log('✨ すべてのデータがリストアされました！\n');

      process.exit(0);
    });

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  }
}

restoreData();

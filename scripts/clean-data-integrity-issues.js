#!/usr/bin/env node

/**
 * データ整合性問題をクリーニングするスクリプト
 *
 * 修正内容:
 * 1. 存在しないlineIdを参照しているMessageを 'main' ラインに移動
 * 2. 循環参照しているLineのparent_line_idをnullに設定（ルートライン化）
 *
 * 使用方法:
 *   # ドライラン（実際には更新しない）
 *   node scripts/clean-data-integrity-issues.js <conversationId> --dry-run
 *
 *   # 本番実行
 *   node scripts/clean-data-integrity-issues.js <conversationId>
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const {
  CONVERSATIONS_COLLECTION,
  MESSAGES_SUBCOLLECTION,
  LINES_SUBCOLLECTION,
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
    console.error('使用方法: node scripts/clean-data-integrity-issues.js <conversationId> [--dry-run]');
    process.exit(1);
  }

  const conversationId = args[0];
  const dryRun = args.includes('--dry-run');

  return { conversationId, dryRun };
}

// 循環参照を検出
function detectCircularReferences(lines) {
  const circularLines = [];

  Object.entries(lines).forEach(([lineId, lineData]) => {
    const visited = new Set();
    let currentId = lineId;

    while (currentId && lines[currentId]?.parent_line_id) {
      if (visited.has(currentId)) {
        circularLines.push(lineId);
        break;
      }

      visited.add(currentId);
      currentId = lines[currentId].parent_line_id;

      if (visited.size > 100) {
        circularLines.push(lineId);
        break;
      }
    }
  });

  return circularLines;
}

// 存在しないラインを参照しているメッセージを検出
function detectOrphanMessages(messages, lines) {
  const orphanMessages = [];

  Object.entries(messages).forEach(([messageId, messageData]) => {
    if (messageData.lineId && !lines[messageData.lineId]) {
      orphanMessages.push({
        messageId,
        invalidLineId: messageData.lineId
      });
    }
  });

  return orphanMessages;
}

async function cleanData() {
  try {
    const { conversationId, dryRun } = parseArgs();

    console.log('🧹 データクリーニングスクリプト開始\n');
    console.log(`   会話ID: ${conversationId}`);
    console.log(`   ドライラン: ${dryRun ? 'はい' : 'いいえ'}\n`);

    const conversationRef = db.collection(CONVERSATIONS_COLLECTION).doc(conversationId);

    // データ取得
    console.log('📥 データ取得中...');
    const [messagesSnapshot, linesSnapshot] = await Promise.all([
      conversationRef.collection(MESSAGES_SUBCOLLECTION).get(),
      conversationRef.collection(LINES_SUBCOLLECTION).get()
    ]);

    // データをマップに変換
    const messages = {};
    messagesSnapshot.forEach(doc => {
      messages[doc.id] = { id: doc.id, ...doc.data() };
    });

    const lines = {};
    linesSnapshot.forEach(doc => {
      lines[doc.id] = { id: doc.id, ...doc.data() };
    });

    console.log(`✅ データ取得完了`);
    console.log(`   メッセージ数: ${Object.keys(messages).length}`);
    console.log(`   ライン数: ${Object.keys(lines).length}\n`);

    // 問題の検出
    console.log('🔍 整合性問題を検出中...\n');

    // 1. 循環参照の検出
    const circularLines = detectCircularReferences(lines);
    if (circularLines.length > 0) {
      console.log(`⚠️  循環参照を持つライン: ${circularLines.length} 件`);
      circularLines.forEach(lineId => {
        console.log(`   - ${lineId} (${lines[lineId]?.name || 'unknown'})`);
      });
      console.log('');
    }

    // 2. 孤児メッセージの検出
    const orphanMessages = detectOrphanMessages(messages, lines);
    if (orphanMessages.length > 0) {
      console.log(`⚠️  存在しないラインを参照しているメッセージ: ${orphanMessages.length} 件`);

      // lineId ごとにグループ化
      const groupedByLineId = {};
      orphanMessages.forEach(({ messageId, invalidLineId }) => {
        if (!groupedByLineId[invalidLineId]) {
          groupedByLineId[invalidLineId] = [];
        }
        groupedByLineId[invalidLineId].push(messageId);
      });

      Object.entries(groupedByLineId).forEach(([invalidLineId, messageIds]) => {
        console.log(`   - 無効なlineId "${invalidLineId}": ${messageIds.length} 件のメッセージ`);
      });
      console.log('');
    }

    if (circularLines.length === 0 && orphanMessages.length === 0) {
      console.log('✅ 整合性問題は見つかりませんでした！');
      process.exit(0);
    }

    // 修正内容のプレビュー
    console.log('=== 修正内容 ===\n');

    if (circularLines.length > 0) {
      console.log(`📝 循環参照しているライン (${circularLines.length} 件):`);
      console.log('   → parent_line_id を null に設定（ルートライン化）\n');
    }

    if (orphanMessages.length > 0) {
      console.log(`📝 孤児メッセージ (${orphanMessages.length} 件):`);
      console.log('   → lineId を "main" に変更\n');
    }

    if (dryRun) {
      console.log('⚠️  ドライランモードのため、実際の修正はスキップします。\n');
      process.exit(0);
    }

    // 修正の実行
    console.log('=== 修正を実行 ===\n');

    const batch = db.batch();
    let updateCount = 0;

    // 1. 循環参照ラインの修正
    if (circularLines.length > 0) {
      console.log('🔧 循環参照ラインを修正中...');
      circularLines.forEach(lineId => {
        const docRef = conversationRef.collection(LINES_SUBCOLLECTION).doc(lineId);
        batch.update(docRef, { parent_line_id: null });
        updateCount++;
      });
      console.log(`   ✅ ${circularLines.length} 件のラインを修正\n`);
    }

    // 2. 孤児メッセージの修正
    if (orphanMessages.length > 0) {
      console.log('🔧 孤児メッセージを修正中...');
      orphanMessages.forEach(({ messageId }) => {
        const docRef = conversationRef.collection(MESSAGES_SUBCOLLECTION).doc(messageId);
        batch.update(docRef, { lineId: 'main' });
        updateCount++;
      });
      console.log(`   ✅ ${orphanMessages.length} 件のメッセージを "main" ラインに移動\n`);
    }

    // バッチをコミット
    if (updateCount <= 500) {
      console.log('💾 変更をコミット中...');
      await batch.commit();
      console.log('   ✅ コミット完了\n');
    } else {
      // 500件を超える場合は分割実行
      console.log(`💾 変更をコミット中（${updateCount} 件、分割実行）...`);

      let currentBatch = db.batch();
      let currentCount = 0;
      let batchNumber = 1;

      // 循環参照ラインの修正
      for (const lineId of circularLines) {
        const docRef = conversationRef.collection(LINES_SUBCOLLECTION).doc(lineId);
        currentBatch.update(docRef, { parent_line_id: null });
        currentCount++;

        if (currentCount >= 500) {
          console.log(`   バッチ ${batchNumber} を実行中... (${currentCount} 件)`);
          await currentBatch.commit();
          currentBatch = db.batch();
          currentCount = 0;
          batchNumber++;
        }
      }

      // 孤児メッセージの修正
      for (const { messageId } of orphanMessages) {
        const docRef = conversationRef.collection(MESSAGES_SUBCOLLECTION).doc(messageId);
        currentBatch.update(docRef, { lineId: 'main' });
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

      console.log('   ✅ コミット完了\n');
    }

    console.log('✨ クリーニングが完了しました！\n');

    console.log('📋 次のステップ:');
    console.log('  1. check-new-data-integrity.js を実行して、整合性が改善されたことを確認');
    console.log('  2. アプリケーションで動作確認\n');

    process.exit(0);

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  }
}

cleanData();

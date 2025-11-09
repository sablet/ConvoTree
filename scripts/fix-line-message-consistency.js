#!/usr/bin/env node

const admin = require('firebase-admin');
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

async function fixLineMessageConsistency() {
  try {
    const conversationId = process.argv[2] || 'sample-conversation-1';
    const dryRun = process.argv[3] === '--dry-run';

    const conversationRef = db.collection(CONVERSATIONS_COLLECTION).doc(conversationId);

    console.log('🔧 Line と Message の整合性を修正中...');
    if (dryRun) {
      console.log('📝 DRY RUN モード: 実際の変更は行いません\n');
    } else {
      console.log('⚠️  実際にデータを変更します\n');
    }

    // データ取得
    const [messagesSnapshot, linesSnapshot] = await Promise.all([
      conversationRef.collection(MESSAGES_SUBCOLLECTION).get(),
      conversationRef.collection(LINES_SUBCOLLECTION).get()
    ]);

    // データを変換
    const messages = {};
    messagesSnapshot.forEach(doc => {
      messages[doc.id] = { id: doc.id, ...doc.data() };
    });

    const lines = {};
    linesSnapshot.forEach(doc => {
      lines[doc.id] = { id: doc.id, ...doc.data() };
    });

    console.log(`📊 取得データ: メッセージ ${Object.keys(messages).length}件、ライン ${Object.keys(lines).length}件\n`);

    // message.lineId を信頼ソース (source of truth) として、line.messageIds を再構築
    console.log('🔨 message.lineId を基準に line.messageIds を再構築します...\n');

    // 各ラインの新しい messageIds を構築
    const newLineMessageIds = {};
    Object.keys(lines).forEach(lineId => {
      newLineMessageIds[lineId] = [];
    });

    // 削除されていないメッセージのみを対象に
    Object.values(messages).forEach(message => {
      if (message.deleted) {
        console.log(`  ⏭️  スキップ: メッセージ ${message.id} は削除済み`);
        return;
      }

      const lineId = message.lineId;

      // lineId が存在しないラインを参照している場合
      if (!lines[lineId]) {
        console.log(`  ⚠️  警告: メッセージ ${message.id} の lineId "${lineId}" は存在しないラインです`);
        return;
      }

      // このラインに追加
      newLineMessageIds[lineId].push(message.id);
    });

    // 各ラインの messageIds を更新
    const batch = db.batch();
    let updateCount = 0;

    Object.keys(lines).forEach(lineId => {
      const line = lines[lineId];
      const currentMessageIds = line.messageIds || [];
      const newMessageIds = newLineMessageIds[lineId];

      // 配列が異なる場合のみ更新
      const isDifferent =
        currentMessageIds.length !== newMessageIds.length ||
        !currentMessageIds.every((id, index) => id === newMessageIds[index]);

      if (isDifferent) {
        console.log(`  📝 ライン "${line.name}" (${lineId}):`);
        console.log(`     現在の messageIds 数: ${currentMessageIds.length}`);
        console.log(`     新しい messageIds 数: ${newMessageIds.length}`);

        // 削除されるメッセージID
        const removedIds = currentMessageIds.filter(id => !newMessageIds.includes(id));
        if (removedIds.length > 0) {
          console.log(`     削除: ${removedIds.join(', ')}`);
        }

        // 追加されるメッセージID
        const addedIds = newMessageIds.filter(id => !currentMessageIds.includes(id));
        if (addedIds.length > 0) {
          console.log(`     追加: ${addedIds.join(', ')}`);
        }

        if (!dryRun) {
          const lineRef = conversationRef.collection(LINES_SUBCOLLECTION).doc(lineId);
          batch.update(lineRef, {
            messageIds: newMessageIds,
            updated_at: new Date().toISOString()
          });
          updateCount++;
        }
      }
    });

    // バッチ実行
    if (!dryRun && updateCount > 0) {
      console.log(`\n✍️  ${updateCount} 件のラインを更新中...`);
      await batch.commit();
      console.log('✅ 更新完了！');
    } else if (dryRun && updateCount > 0) {
      console.log(`\n📝 DRY RUN: ${updateCount} 件のラインが更新対象です`);
      console.log('実際に更新するには --dry-run フラグを外して実行してください');
    } else {
      console.log('\n✅ 更新が必要なラインはありませんでした');
    }

    console.log('\n=== 完了 ===');
    console.log('整合性チェックを再実行して確認することを推奨します:');
    console.log(`  node scripts/check-line-message-consistency.js ${conversationId}`);

    process.exit(0);

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  }
}

fixLineMessageConsistency();

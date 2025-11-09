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

async function checkLineMessageConsistency() {
  try {
    const conversationId = process.argv[2] || 'sample-conversation-1';
    const conversationRef = db.collection(CONVERSATIONS_COLLECTION).doc(conversationId);

    console.log('🔍 Line と Message の整合性チェック中...\n');

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

    // 1. line.messageIds に存在するが message.lineId が一致しないメッセージ
    console.log('=== 1. line.messageIds に存在するが message.lineId が一致しないメッセージ ===');
    let inconsistentCount1 = 0;
    Object.values(lines).forEach(line => {
      if (!line.messageIds || !Array.isArray(line.messageIds)) return;

      line.messageIds.forEach(msgId => {
        const message = messages[msgId];
        if (!message) {
          console.log(`❌ ライン "${line.name}" (${line.id}) の messageIds に存在するが、メッセージが見つからない: ${msgId}`);
          inconsistentCount1++;
        } else if (message.lineId !== line.id) {
          console.log(`❌ ライン "${line.name}" (${line.id}) の messageIds に ${msgId} が含まれているが、メッセージの lineId は "${message.lineId}"`);
          inconsistentCount1++;
        }
      });
    });
    if (inconsistentCount1 === 0) {
      console.log('✅ 不整合なし');
    }
    console.log('');

    // 2. message.lineId が指すラインの messageIds にそのメッセージIDが含まれていない
    console.log('=== 2. message.lineId が指すラインの messageIds にメッセージIDが含まれていない ===');
    let inconsistentCount2 = 0;
    Object.values(messages).forEach(message => {
      if (message.deleted) return; // 削除済みメッセージはスキップ

      const lineId = message.lineId;
      const line = lines[lineId];

      if (!line) {
        console.log(`❌ メッセージ ${message.id} の lineId "${lineId}" が存在しません`);
        inconsistentCount2++;
      } else if (!line.messageIds || !line.messageIds.includes(message.id)) {
        console.log(`❌ メッセージ ${message.id} の lineId は "${lineId}" だが、ライン "${line.name}" の messageIds に含まれていない`);
        console.log(`   メッセージ内容: "${message.content?.substring(0, 50)}..."`);
        console.log(`   ライン "${line.name}" の messageIds: [${line.messageIds?.slice(0, 5).join(', ')}${line.messageIds?.length > 5 ? '...' : ''}]`);
        inconsistentCount2++;
      }
    });
    if (inconsistentCount2 === 0) {
      console.log('✅ 不整合なし');
    }
    console.log('');

    // 3. 削除済みメッセージが line.messageIds に残っている
    console.log('=== 3. 削除済みメッセージが line.messageIds に残っている ===');
    let inconsistentCount3 = 0;
    Object.values(lines).forEach(line => {
      if (!line.messageIds || !Array.isArray(line.messageIds)) return;

      line.messageIds.forEach(msgId => {
        const message = messages[msgId];
        if (message && message.deleted) {
          console.log(`❌ ライン "${line.name}" (${line.id}) の messageIds に削除済みメッセージ ${msgId} が含まれている`);
          inconsistentCount3++;
        }
      });
    });
    if (inconsistentCount3 === 0) {
      console.log('✅ 不整合なし');
    }
    console.log('');

    // サマリー
    console.log('=== サマリー ===');
    const totalInconsistencies = inconsistentCount1 + inconsistentCount2 + inconsistentCount3;
    if (totalInconsistencies > 0) {
      console.log(`❌ 合計 ${totalInconsistencies} 件の不整合が見つかりました`);
      console.log(`   - line.messageIds に存在するが lineId が不一致: ${inconsistentCount1}件`);
      console.log(`   - lineId が指すラインの messageIds に未登録: ${inconsistentCount2}件`);
      console.log(`   - 削除済みメッセージが messageIds に残存: ${inconsistentCount3}件`);
      console.log('\n📝 修正スクリプトの実行を推奨します');
    } else {
      console.log('✅ Line と Message の整合性に問題はありません');
    }

    process.exit(0);

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  }
}

checkLineMessageConsistency();

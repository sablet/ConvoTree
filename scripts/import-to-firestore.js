#!/usr/bin/env node

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Firebase Admin SDK 初期化
const serviceAccount = require('../firebase-service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function importChatData() {
  try {
    // chat-sample.json を読み込み
    const dataPath = path.join(__dirname, '../public/data/chat-sample.json');
    const rawData = fs.readFileSync(dataPath, 'utf8');
    const chatData = JSON.parse(rawData);

    console.log('🚀 Firestore へのデータインポートを開始...');

    // 会話ID（固定値またはランダム生成）
    const conversationId = 'sample-conversation-1';
    const conversationRef = db.collection('conversations').doc(conversationId);

    // 1. Messages サブコレクションにインポート
    console.log('📝 Messages をインポート中...');
    const messagesCollection = conversationRef.collection('messages');

    for (const [messageId, messageData] of Object.entries(chatData.messages)) {
      await messagesCollection.doc(messageId).set({
        ...messageData,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    // 2. Lines サブコレクションにインポート
    console.log('📋 Lines をインポート中...');
    const linesCollection = conversationRef.collection('lines');

    for (const line of chatData.lines) {
      await linesCollection.doc(line.id).set({
        ...line,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    // 3. Branch Points サブコレクションにインポート
    console.log('🌿 Branch Points をインポート中...');
    const branchPointsCollection = conversationRef.collection('branchPoints');

    for (const [branchPointId, branchPointData] of Object.entries(chatData.branchPoints)) {
      await branchPointsCollection.doc(branchPointId).set({
        id: branchPointId,
        ...branchPointData,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    // 4. Tags サブコレクションにインポート
    console.log('🏷️ Tags をインポート中...');
    const tagsCollection = conversationRef.collection('tags');

    for (const [tagId, tagData] of Object.entries(chatData.tags)) {
      await tagsCollection.doc(tagId).set({
        ...tagData,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    // 5. Tag Groups サブコレクションにインポート
    console.log('📚 Tag Groups をインポート中...');
    const tagGroupsCollection = conversationRef.collection('tagGroups');

    for (const [tagGroupId, tagGroupData] of Object.entries(chatData.tagGroups)) {
      await tagGroupsCollection.doc(tagGroupId).set({
        ...tagGroupData,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    // 6. 会話メタデータを保存
    console.log('💬 Conversation メタデータを保存中...');
    await conversationRef.set({
      title: 'チャットアプリ開発プロジェクト議論',
      description: 'プロジェクトキックオフから技術検討まで',
      messagesCount: Object.keys(chatData.messages).length,
      linesCount: chatData.lines.length,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log('✅ データインポート完了！');
    console.log(`   会話ID: ${conversationId}`);
    console.log(`   メッセージ数: ${Object.keys(chatData.messages).length}`);
    console.log(`   ライン数: ${chatData.lines.length}`);

    process.exit(0);

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  }
}

importChatData();
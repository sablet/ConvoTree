#!/usr/bin/env node

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const {
  CONVERSATIONS_COLLECTION,
  MESSAGES_SUBCOLLECTION,
  LINES_SUBCOLLECTION,
  BRANCH_POINTS_SUBCOLLECTION,
  TAGS_SUBCOLLECTION,
} = require('../lib/firestore-constants');

// Firebase Admin SDK 初期化
const serviceAccount = require('../firebase-service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function importChatData() {
  try {
    // コマンドライン引数から使用するデータファイルを決定
    const dataFile = process.argv[2] || 'chat-sample.json';
    const dataPath = path.join(__dirname, '../public/data/', dataFile);
    const rawData = fs.readFileSync(dataPath, 'utf8');
    const chatData = JSON.parse(rawData);

    console.log(`🚀 Firestore へのデータインポートを開始... (データファイル: ${dataFile})`);

    // 会話ID（データファイルに基づいて生成）
    const conversationId = dataFile.replace('.json', '') + '-conversation-1';
    const conversationRef = db.collection(CONVERSATIONS_COLLECTION).doc(conversationId);

    // 1. Messages サブコレクションにインポート
    console.log('📝 Messages をインポート中...');
    const messagesCollection = conversationRef.collection(MESSAGES_SUBCOLLECTION);

    for (const [messageId, messageData] of Object.entries(chatData.messages)) {
      await messagesCollection.doc(messageId).set({
        ...messageData,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    // 2. Lines サブコレクションにインポート
    console.log('📋 Lines をインポート中...');
    const linesCollection = conversationRef.collection(LINES_SUBCOLLECTION);

    for (const line of chatData.lines) {
      await linesCollection.doc(line.id).set({
        ...line,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    // 3. Branch Points サブコレクションにインポート
    console.log('🌿 Branch Points をインポート中...');
    const branchPointsCollection = conversationRef.collection(BRANCH_POINTS_SUBCOLLECTION);

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
    const tagsCollection = conversationRef.collection(TAGS_SUBCOLLECTION);

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
    const conversationTitle = dataFile === 'chat-minimal.json' ? 'ミニマル会話テスト' : 'チャットアプリ開発プロジェクト議論';
    const conversationDescription = dataFile === 'chat-minimal.json' ? '最小構成のテストデータ' : 'プロジェクトキックオフから技術検討まで';

    await conversationRef.set({
      title: conversationTitle,
      description: conversationDescription,
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
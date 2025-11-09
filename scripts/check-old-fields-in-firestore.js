#!/usr/bin/env node

/**
 * Firestoreに旧フィールドが残っていないことを確認するスクリプト
 *
 * チェック項目:
 * - Message: prevInLine, nextInLine, branchFromMessageId
 * - Line: messageIds, startMessageId, endMessageId, branchFromMessageId
 * - BranchPoint: コレクション自体の存在
 */

const admin = require('firebase-admin');
const {
  CONVERSATIONS_COLLECTION,
  MESSAGES_SUBCOLLECTION,
  LINES_SUBCOLLECTION,
  BRANCH_POINTS_SUBCOLLECTION,
} = require('../lib/firestore-constants');

// Firebase Admin SDK 初期化
const serviceAccount = require('../firebase-service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkOldFieldsInFirestore() {
  try {
    // コマンドライン引数から会話IDを取得
    const conversationId = process.argv[2] || 'chat-minimal-conversation-1';
    const conversationRef = db.collection(CONVERSATIONS_COLLECTION).doc(conversationId);

    console.log('🔍 Firestore 旧フィールドチェック開始...');
    console.log(`   会話ID: ${conversationId}\n`);

    const warnings = [];

    // 1. Message の旧フィールドチェック
    console.log('📥 Messages チェック中...');
    const messagesSnapshot = await conversationRef.collection(MESSAGES_SUBCOLLECTION).get();

    const messageOldFields = {
      prevInLine: [],
      nextInLine: [],
      branchFromMessageId: []
    };

    messagesSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.prevInLine !== undefined) {
        messageOldFields.prevInLine.push(doc.id);
      }
      if (data.nextInLine !== undefined) {
        messageOldFields.nextInLine.push(doc.id);
      }
      if (data.branchFromMessageId !== undefined) {
        messageOldFields.branchFromMessageId.push(doc.id);
      }
    });

    // 2. Line の旧フィールドチェック
    console.log('📥 Lines チェック中...');
    const linesSnapshot = await conversationRef.collection(LINES_SUBCOLLECTION).get();

    const lineOldFields = {
      messageIds: [],
      startMessageId: [],
      endMessageId: [],
      branchFromMessageId: []
    };

    linesSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.messageIds !== undefined) {
        lineOldFields.messageIds.push(doc.id);
      }
      if (data.startMessageId !== undefined) {
        lineOldFields.startMessageId.push(doc.id);
      }
      if (data.endMessageId !== undefined) {
        lineOldFields.endMessageId.push(doc.id);
      }
      if (data.branchFromMessageId !== undefined) {
        lineOldFields.branchFromMessageId.push(doc.id);
      }
    });

    // 3. BranchPoint コレクションの存在チェック
    console.log('📥 BranchPoints チェック中...');
    const branchPointsSnapshot = await conversationRef.collection(BRANCH_POINTS_SUBCOLLECTION).get();
    const hasBranchPoints = !branchPointsSnapshot.empty;

    // 結果レポート
    console.log('\n=== チェック結果 ===\n');

    let hasOldFields = false;

    // Message の結果
    if (Object.values(messageOldFields).some(arr => arr.length > 0)) {
      hasOldFields = true;
      console.log('⚠️  Message に旧フィールドが見つかりました:\n');

      if (messageOldFields.prevInLine.length > 0) {
        console.log(`   prevInLine: ${messageOldFields.prevInLine.length} 件`);
        console.log(`     例: ${messageOldFields.prevInLine.slice(0, 5).join(', ')}`);
      }
      if (messageOldFields.nextInLine.length > 0) {
        console.log(`   nextInLine: ${messageOldFields.nextInLine.length} 件`);
        console.log(`     例: ${messageOldFields.nextInLine.slice(0, 5).join(', ')}`);
      }
      if (messageOldFields.branchFromMessageId.length > 0) {
        console.log(`   branchFromMessageId: ${messageOldFields.branchFromMessageId.length} 件`);
        console.log(`     例: ${messageOldFields.branchFromMessageId.slice(0, 5).join(', ')}`);
      }
      console.log('');
    }

    // Line の結果
    if (Object.values(lineOldFields).some(arr => arr.length > 0)) {
      hasOldFields = true;
      console.log('⚠️  Line に旧フィールドが見つかりました:\n');

      if (lineOldFields.messageIds.length > 0) {
        console.log(`   messageIds: ${lineOldFields.messageIds.length} 件`);
        console.log(`     例: ${lineOldFields.messageIds.slice(0, 5).join(', ')}`);
      }
      if (lineOldFields.startMessageId.length > 0) {
        console.log(`   startMessageId: ${lineOldFields.startMessageId.length} 件`);
        console.log(`     例: ${lineOldFields.startMessageId.slice(0, 5).join(', ')}`);
      }
      if (lineOldFields.endMessageId.length > 0) {
        console.log(`   endMessageId: ${lineOldFields.endMessageId.length} 件`);
        console.log(`     例: ${lineOldFields.endMessageId.slice(0, 5).join(', ')}`);
      }
      if (lineOldFields.branchFromMessageId.length > 0) {
        console.log(`   branchFromMessageId: ${lineOldFields.branchFromMessageId.length} 件`);
        console.log(`     例: ${lineOldFields.branchFromMessageId.slice(0, 5).join(', ')}`);
      }
      console.log('');
    }

    // BranchPoint の結果
    if (hasBranchPoints) {
      hasOldFields = true;
      console.log('⚠️  BranchPoint コレクションが存在します:\n');
      console.log(`   ドキュメント数: ${branchPointsSnapshot.size} 件\n`);
    }

    if (!hasOldFields) {
      console.log('✅ 旧フィールドは見つかりませんでした！\n');
    } else {
      console.log('💡 旧フィールドを削除するには、migrate-to-new-structure.js を実行してください。\n');
    }

    process.exit(hasOldFields ? 1 : 0);

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  }
}

checkOldFieldsInFirestore();

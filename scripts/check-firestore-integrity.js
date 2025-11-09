#!/usr/bin/env node

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
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

async function checkFirestoreIntegrity() {
  try {
    // コマンドライン引数から会話IDを取得
    const conversationId = process.argv[2] || 'chat-minimal-conversation-1';
    const conversationRef = db.collection(CONVERSATIONS_COLLECTION).doc(conversationId);

    console.log('🔍 Firestore データ整合性チェック開始...');
    console.log(`   会話ID: ${conversationId}\n`);

    // データ取得
    console.log('📥 データ取得中...');
    const [messagesSnapshot, linesSnapshot, branchPointsSnapshot] = await Promise.all([
      conversationRef.collection(MESSAGES_SUBCOLLECTION).get(),
      conversationRef.collection(LINES_SUBCOLLECTION).get(),
      conversationRef.collection(BRANCH_POINTS_SUBCOLLECTION).get()
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

    const branchPoints = {};
    branchPointsSnapshot.forEach(doc => {
      branchPoints[doc.id] = { messageId: doc.id, ...doc.data() };
    });

    console.log(`✅ データ取得完了`);
    console.log(`   メッセージ数: ${Object.keys(messages).length}`);
    console.log(`   ライン数: ${Object.keys(lines).length}`);
    console.log(`   分岐点数: ${Object.keys(branchPoints).length}\n`);

    // 整合性チェック
    const errors = [];
    const warnings = [];

    console.log('🔍 整合性チェック実行中...\n');

    // 1. Line のチェック
    console.log('--- Line チェック ---');
    Object.values(lines).forEach(line => {
      // messageIds が存在するか
      if (!line.messageIds || !Array.isArray(line.messageIds)) {
        errors.push(`Line ${line.id}: messageIds が存在しないか、配列ではありません`);
        return;
      }

      // messageIds に含まれるメッセージが実際に存在するか
      line.messageIds.forEach(msgId => {
        if (!messages[msgId]) {
          errors.push(`Line ${line.id}: メッセージ ${msgId} が存在しません`);
        }
      });

      // startMessageId が messageIds の最初と一致するか
      if (line.messageIds.length > 0) {
        if (line.startMessageId !== line.messageIds[0]) {
          errors.push(`Line ${line.id}: startMessageId (${line.startMessageId}) が messageIds の最初 (${line.messageIds[0]}) と一致しません`);
        }

        // endMessageId が messageIds の最後と一致するか
        const lastMsgId = line.messageIds[line.messageIds.length - 1];
        if (line.endMessageId && line.endMessageId !== lastMsgId) {
          errors.push(`Line ${line.id}: endMessageId (${line.endMessageId}) が messageIds の最後 (${lastMsgId}) と一致しません`);
        }
      }

      // branchFromMessageId が実際に存在するか
      if (line.branchFromMessageId && !messages[line.branchFromMessageId]) {
        errors.push(`Line ${line.id}: branchFromMessageId (${line.branchFromMessageId}) が存在しません`);
      }
    });

    // 2. Message のチェック
    console.log('--- Message チェック ---');
    Object.values(messages).forEach(msg => {
      // lineId が実際に存在するか
      if (msg.lineId && !lines[msg.lineId]) {
        errors.push(`Message ${msg.id}: lineId (${msg.lineId}) が存在しません`);
      }

      // Line.messageIds に含まれているか
      if (msg.lineId && lines[msg.lineId]) {
        if (!lines[msg.lineId].messageIds.includes(msg.id)) {
          errors.push(`Message ${msg.id}: Line ${msg.lineId} の messageIds に含まれていません`);
        }
      }

      // prevInLine が実際に存在するか
      if (msg.prevInLine && !messages[msg.prevInLine]) {
        errors.push(`Message ${msg.id}: prevInLine (${msg.prevInLine}) が存在しません`);
      }

      // nextInLine が実際に存在するか
      if (msg.nextInLine && !messages[msg.nextInLine]) {
        errors.push(`Message ${msg.id}: nextInLine (${msg.nextInLine}) が存在しません`);
      }

      // branchFromMessageId が実際に存在するか
      if (msg.branchFromMessageId && !messages[msg.branchFromMessageId]) {
        errors.push(`Message ${msg.id}: branchFromMessageId (${msg.branchFromMessageId}) が存在しません`);
      }

      // prevInLine/nextInLine のリンクの一貫性チェック
      if (msg.prevInLine && messages[msg.prevInLine]) {
        if (messages[msg.prevInLine].nextInLine !== msg.id) {
          errors.push(`Message ${msg.id}: prevInLine (${msg.prevInLine}) の nextInLine が ${msg.id} ではありません (実際: ${messages[msg.prevInLine].nextInLine})`);
        }
      }

      if (msg.nextInLine && messages[msg.nextInLine]) {
        if (messages[msg.nextInLine].prevInLine !== msg.id) {
          errors.push(`Message ${msg.id}: nextInLine (${msg.nextInLine}) の prevInLine が ${msg.id} ではありません (実際: ${messages[msg.nextInLine].prevInLine})`);
        }
      }
    });

    // 3. BranchPoint のチェック
    console.log('--- BranchPoint チェック ---');
    Object.values(branchPoints).forEach(bp => {
      // messageId が実際に存在するか
      if (!messages[bp.messageId]) {
        errors.push(`BranchPoint ${bp.messageId}: メッセージが存在しません`);
      }

      // lines が存在するか
      if (!bp.lines || !Array.isArray(bp.lines)) {
        errors.push(`BranchPoint ${bp.messageId}: lines が存在しないか、配列ではありません`);
        return;
      }

      // lines に含まれるラインが実際に存在するか
      bp.lines.forEach(lineId => {
        if (!lines[lineId]) {
          errors.push(`BranchPoint ${bp.messageId}: ライン ${lineId} が存在しません`);
        } else {
          // そのラインが実際にこのメッセージから分岐しているか確認
          if (lines[lineId].branchFromMessageId !== bp.messageId) {
            errors.push(`BranchPoint ${bp.messageId}: ライン ${lineId} の branchFromMessageId が ${bp.messageId} ではありません (実際: ${lines[lineId].branchFromMessageId})`);
          }
        }
      });
    });

    // 4. 孤児メッセージのチェック（どのラインにも属していないメッセージ）
    console.log('--- 孤児メッセージチェック ---');
    Object.values(messages).forEach(msg => {
      if (!msg.lineId) {
        warnings.push(`Message ${msg.id}: lineId が設定されていません（孤児メッセージ）`);
      }
    });

    // 5. Line.messageIds の順序チェック（prevInLine/nextInLine との整合性）
    console.log('--- Line メッセージ順序チェック ---');
    Object.values(lines).forEach(line => {
      if (!line.messageIds || line.messageIds.length === 0) return;

      for (let i = 0; i < line.messageIds.length; i++) {
        const msgId = line.messageIds[i];
        const msg = messages[msgId];
        if (!msg) continue;

        // 最初のメッセージは prevInLine がないはず
        if (i === 0) {
          if (msg.prevInLine) {
            errors.push(`Line ${line.id}: 最初のメッセージ ${msgId} に prevInLine (${msg.prevInLine}) が設定されています`);
          }
        } else {
          // 最初以外は prevInLine が前のメッセージを指しているはず
          const expectedPrev = line.messageIds[i - 1];
          if (msg.prevInLine !== expectedPrev) {
            errors.push(`Line ${line.id}: メッセージ ${msgId} の prevInLine (${msg.prevInLine}) が期待値 (${expectedPrev}) と一致しません`);
          }
        }

        // 最後のメッセージは nextInLine がないはず
        if (i === line.messageIds.length - 1) {
          if (msg.nextInLine) {
            errors.push(`Line ${line.id}: 最後のメッセージ ${msgId} に nextInLine (${msg.nextInLine}) が設定されています`);
          }
        } else {
          // 最後以外は nextInLine が次のメッセージを指しているはず
          const expectedNext = line.messageIds[i + 1];
          if (msg.nextInLine !== expectedNext) {
            errors.push(`Line ${line.id}: メッセージ ${msgId} の nextInLine (${msg.nextInLine}) が期待値 (${expectedNext}) と一致しません`);
          }
        }
      }
    });

    // 結果レポート
    console.log('\n=== チェック結果 ===\n');

    if (errors.length === 0 && warnings.length === 0) {
      console.log('✅ エラー・警告なし！データは正常です。\n');
    } else {
      if (errors.length > 0) {
        console.log(`❌ エラー: ${errors.length} 件\n`);
        errors.forEach((err, idx) => {
          console.log(`  ${idx + 1}. ${err}`);
        });
        console.log('');
      }

      if (warnings.length > 0) {
        console.log(`⚠️  警告: ${warnings.length} 件\n`);
        warnings.forEach((warn, idx) => {
          console.log(`  ${idx + 1}. ${warn}`);
        });
        console.log('');
      }
    }

    // データをJSON形式で出力（Firestore import可能な形式）
    const outputDir = path.join(__dirname, '../output/data');
    fs.mkdirSync(outputDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

    // Messages
    const messagesOutput = path.join(outputDir, `messages-${timestamp}.json`);
    fs.writeFileSync(messagesOutput, JSON.stringify(messages, null, 2), 'utf8');

    // Lines
    const linesOutput = path.join(outputDir, `lines-${timestamp}.json`);
    fs.writeFileSync(linesOutput, JSON.stringify(lines, null, 2), 'utf8');

    // BranchPoints
    const branchPointsOutput = path.join(outputDir, `branchpoints-${timestamp}.json`);
    fs.writeFileSync(branchPointsOutput, JSON.stringify(branchPoints, null, 2), 'utf8');

    console.log('📁 データをエクスポートしました:');
    console.log(`   Messages: ${messagesOutput}`);
    console.log(`   Lines: ${linesOutput}`);
    console.log(`   BranchPoints: ${branchPointsOutput}\n`);

    process.exit(errors.length > 0 ? 1 : 0);

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  }
}

checkFirestoreIntegrity();

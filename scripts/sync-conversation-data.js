#!/usr/bin/env node

const admin = require('firebase-admin');
const serviceAccount = require('../firebase-service-account.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function syncData(sourceId, targetId, dryRun = false) {
  console.log(`🔄 会話データ同期: ${sourceId} → ${targetId}`);
  console.log(`   ドライラン: ${dryRun ? 'はい' : 'いいえ'}\n`);

  // データ取得
  const sourceMessages = await db.collection('conversations').doc(sourceId).collection('messages').get();
  const sourceLines = await db.collection('conversations').doc(sourceId).collection('lines').get();
  const targetMessages = await db.collection('conversations').doc(targetId).collection('messages').get();
  const targetLines = await db.collection('conversations').doc(targetId).collection('lines').get();

  const sourceMsgIds = new Set();
  const sourceMessagesMap = {};
  sourceMessages.forEach(doc => {
    sourceMsgIds.add(doc.id);
    sourceMessagesMap[doc.id] = doc.data();
  });

  const sourceLineIds = new Set();
  const sourceLinesMap = {};
  sourceLines.forEach(doc => {
    sourceLineIds.add(doc.id);
    sourceLinesMap[doc.id] = doc.data();
  });

  const targetMsgIds = new Set();
  targetMessages.forEach(doc => targetMsgIds.add(doc.id));

  const targetLineIds = new Set();
  targetLines.forEach(doc => targetLineIds.add(doc.id));

  // 差分の特定
  const newMessages = [...sourceMsgIds].filter(id => !targetMsgIds.has(id));
  const newLines = [...sourceLineIds].filter(id => !targetLineIds.has(id));

  console.log('📊 データサマリー:');
  console.log(`   ${sourceId}: ${sourceMsgIds.size} メッセージ, ${sourceLineIds.size} ライン`);
  console.log(`   ${targetId}: ${targetMsgIds.size} メッセージ, ${targetLineIds.size} ライン`);
  console.log('');
  console.log('📝 コピー対象:');
  console.log(`   新規メッセージ: ${newMessages.length} 件`);
  console.log(`   新規ライン: ${newLines.length} 件`);

  if (newMessages.length === 0 && newLines.length === 0) {
    console.log('\n✅ 差分データなし。同期不要です。');
    process.exit(0);
  }

  console.log('');

  if (dryRun) {
    console.log('⚠️  ドライランモード - 実際のコピーはスキップします\n');

    if (newLines.length > 0) {
      console.log('--- 新規ライン ---');
      newLines.forEach(lineId => {
        const line = sourceLinesMap[lineId];
        console.log(`  ${lineId}: ${line.name}`);
      });
      console.log('');
    }

    if (newMessages.length > 0) {
      console.log('--- 新規メッセージ (最初の10件) ---');
      newMessages.slice(0, 10).forEach(msgId => {
        const msg = sourceMessagesMap[msgId];
        const timestamp = msg.timestamp ? new Date(msg.timestamp).toISOString() : 'no timestamp';
        const content = msg.content ? msg.content.substring(0, 50) : '(no content)';
        console.log(`  ${msgId}:`);
        console.log(`    lineId: ${msg.lineId}`);
        console.log(`    timestamp: ${timestamp}`);
        console.log(`    content: ${content}...`);
      });
      if (newMessages.length > 10) {
        console.log(`  ... 他 ${newMessages.length - 10} 件`);
      }
    }

    process.exit(0);
  }

  // 実際のコピー処理
  console.log('🚀 データコピー開始...\n');

  // ラインのコピー
  if (newLines.length > 0) {
    console.log(`📂 ライン ${newLines.length} 件をコピー中...`);
    const batch = db.batch();
    let count = 0;

    for (const lineId of newLines) {
      const lineData = sourceLinesMap[lineId];
      const targetRef = db.collection('conversations').doc(targetId).collection('lines').doc(lineId);
      batch.set(targetRef, lineData);
      count++;

      // バッチは500件まで
      if (count >= 500) {
        await batch.commit();
        count = 0;
      }
    }

    if (count > 0) {
      await batch.commit();
    }
    console.log('   ✅ ライン コピー完了');
  }

  // メッセージのコピー
  if (newMessages.length > 0) {
    console.log(`💬 メッセージ ${newMessages.length} 件をコピー中...`);
    const batches = [];
    let currentBatch = db.batch();
    let count = 0;

    for (const msgId of newMessages) {
      const msgData = sourceMessagesMap[msgId];
      const targetRef = db.collection('conversations').doc(targetId).collection('messages').doc(msgId);
      currentBatch.set(targetRef, msgData);
      count++;

      if (count >= 500) {
        batches.push(currentBatch);
        currentBatch = db.batch();
        count = 0;
      }
    }

    if (count > 0) {
      batches.push(currentBatch);
    }

    for (let i = 0; i < batches.length; i++) {
      await batches[i].commit();
      console.log(`   バッチ ${i + 1}/${batches.length} 完了`);
    }
    console.log('   ✅ メッセージ コピー完了');
  }

  console.log('\n✅ 同期完了！');
  console.log(`\n📊 最終結果:`);
  console.log(`   ${targetId}: ${targetMsgIds.size + newMessages.length} メッセージ, ${targetLineIds.size + newLines.length} ライン`);

  process.exit(0);
}

// コマンドライン引数の解析
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const sourceId = args.find(arg => arg.startsWith('--source='))?.split('=')[1] || 'chat-minimal-conversation-1';
const targetId = args.find(arg => arg.startsWith('--target='))?.split('=')[1] || 'chat-minimal-conversation-2';

syncData(sourceId, targetId, dryRun);

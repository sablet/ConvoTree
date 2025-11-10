#!/usr/bin/env node

const admin = require('firebase-admin');
const serviceAccount = require('../firebase-service-account.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function compareBoth() {
  console.log('=== データ比較: conversation-1 vs conversation-2 ===\n');

  // conversation-1 のデータ取得
  const conv1Messages = await db.collection('conversations').doc('chat-minimal-conversation-1').collection('messages').get();
  const conv1Lines = await db.collection('conversations').doc('chat-minimal-conversation-1').collection('lines').get();

  const conv1MsgIds = new Set();
  const conv1MessagesMap = {};
  conv1Messages.forEach(doc => {
    conv1MsgIds.add(doc.id);
    conv1MessagesMap[doc.id] = doc.data();
  });

  const conv1LineIds = new Set();
  const conv1LinesMap = {};
  conv1Lines.forEach(doc => {
    conv1LineIds.add(doc.id);
    conv1LinesMap[doc.id] = doc.data();
  });

  // conversation-2 のデータ取得
  const conv2Messages = await db.collection('conversations').doc('chat-minimal-conversation-2').collection('messages').get();
  const conv2Lines = await db.collection('conversations').doc('chat-minimal-conversation-2').collection('lines').get();

  const conv2MsgIds = new Set();
  conv2Messages.forEach(doc => conv2MsgIds.add(doc.id));

  const conv2LineIds = new Set();
  conv2Lines.forEach(doc => conv2LineIds.add(doc.id));

  console.log('conversation-1:', conv1MsgIds.size, 'メッセージ,', conv1LineIds.size, 'ライン');
  console.log('conversation-2:', conv2MsgIds.size, 'メッセージ,', conv2LineIds.size, 'ライン');
  console.log('');

  // conversation-1にのみ存在するメッセージ
  const onlyInConv1Msgs = [...conv1MsgIds].filter(id => !conv2MsgIds.has(id));
  console.log('=== conversation-1 にのみ存在するメッセージ (' + onlyInConv1Msgs.length + '件) ===');
  for (const msgId of onlyInConv1Msgs.slice(0, 20)) {
    const data = conv1MessagesMap[msgId];
    const timestamp = data.timestamp ? new Date(data.timestamp).toISOString() : 'no timestamp';
    const content = data.content ? data.content.substring(0, 60) : '(no content)';
    console.log(`  ${msgId}:`);
    console.log(`    lineId: ${data.lineId}`);
    console.log(`    timestamp: ${timestamp}`);
    console.log(`    content: ${content}...`);
  }

  if (onlyInConv1Msgs.length > 20) {
    console.log(`  ... 他 ${onlyInConv1Msgs.length - 20} 件`);
  }

  console.log('');

  // conversation-1にのみ存在するライン
  const onlyInConv1Lines = [...conv1LineIds].filter(id => !conv2LineIds.has(id));
  console.log('=== conversation-1 にのみ存在するライン (' + onlyInConv1Lines.length + '件) ===');
  for (const lineId of onlyInConv1Lines) {
    const lineData = conv1LinesMap[lineId];
    console.log(`  ${lineId}: ${lineData.name}`);
  }

  // conversation-2にのみ存在するメッセージ
  const onlyInConv2Msgs = [...conv2MsgIds].filter(id => !conv1MsgIds.has(id));
  console.log('\n=== conversation-2 にのみ存在するメッセージ (' + onlyInConv2Msgs.length + '件) ===');
  if (onlyInConv2Msgs.length > 0) {
    console.log('  メッセージID:', onlyInConv2Msgs.slice(0, 10).join(', '));
  }

  // conversation-2にのみ存在するライン
  const onlyInConv2Lines = [...conv2LineIds].filter(id => !conv1LineIds.has(id));
  console.log('\n=== conversation-2 にのみ存在するライン (' + onlyInConv2Lines.length + '件) ===');
  if (onlyInConv2Lines.length > 0) {
    console.log('  ラインID:', onlyInConv2Lines.join(', '));
  }

  process.exit(0);
}

compareBoth();

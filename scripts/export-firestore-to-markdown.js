#!/usr/bin/env node

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

async function exportFirestoreToMarkdown() {
  try {
    // コマンドライン引数から会話IDを取得（デフォルトは chat-minimal-conversation-1）
    const conversationId = process.argv[2] || 'chat-minimal-conversation-1';
    const conversationRef = db.collection(CONVERSATIONS_COLLECTION).doc(conversationId);

    console.log('🚀 Firestore からデータを取得中...');

    // データ取得
    const [messagesSnapshot, linesSnapshot] = await Promise.all([
      conversationRef.collection(MESSAGES_SUBCOLLECTION).get(),
      conversationRef.collection(LINES_SUBCOLLECTION).get()
    ]);

    // データを変換
    const messages = {};
    messagesSnapshot.forEach(doc => {
      messages[doc.id] = doc.data();
    });

    const lines = [];
    linesSnapshot.forEach(doc => {
      lines.push({ id: doc.id, ...doc.data() });
    });

    console.log('📝 Markdown ノートを生成中...');

    // ラインIDから名前を取得するマップ
    const lineMap = {};
    lines.forEach(line => {
      lineMap[line.id] = line;
    });

    // ラインの祖先チェーンを取得（UIと同じロジック）
    function getLineAncestry(lineId, visited = new Set()) {
      // 循環参照チェック
      if (visited.has(lineId)) {
        return [];
      }
      visited.add(lineId);

      const line = lineMap[lineId];
      if (!line) {
        return [];
      }

      let ancestry = [];

      // 分岐元がある場合は親ラインの祖先を取得
      if (line.branchFromMessageId) {
        const branchFromMessage = messages[line.branchFromMessageId];
        if (branchFromMessage) {
          const parentLineId = branchFromMessage.lineId;
          const parentAncestry = getLineAncestry(parentLineId, visited);
          ancestry = [...parentAncestry, parentLineId];
        }
      }

      return ancestry;
    }

    // パンくずリストを生成
    function generateBreadcrumbs(lineId) {
      const ancestry = getLineAncestry(lineId);
      const fullLineChain = [...ancestry, lineId];

      return fullLineChain
        .map(id => lineMap[id]?.name)
        .filter(Boolean)
        .join(' > ');
    }

    // Markdown生成
    let markdown = `# 会話エクスポート\n\n`;
    markdown += `**会話ID:** ${conversationId}\n\n`;
    markdown += `**エクスポート日時:** ${new Date().toLocaleString('ja-JP')}\n\n`;

    // ライン名一覧（パンくず構造付き）
    markdown += `## ライン名一覧\n\n`;
    const linePaths = lines.map(line => generateBreadcrumbs(line.id));
    markdown += `${linePaths.join(', ')}\n\n`;
    markdown += `---\n\n`;

    // 各ラインごとにメッセージを出力
    lines.forEach(line => {
      const breadcrumbs = generateBreadcrumbs(line.id);

      markdown += `## ${breadcrumbs}\n\n`;

      // このラインに属するメッセージを取得
      const lineMessages = line.messageIds
        .map(msgId => ({ id: msgId, ...messages[msgId] }))
        .filter(msg => msg.content); // content が存在するもののみ

      if (lineMessages.length === 0) {
        markdown += `_（メッセージなし）_\n\n`;
      } else {
        lineMessages.forEach(msg => {
          // タイムスタンプをフォーマット (YYYY-MM-DD HH:MM:SS)
          let timestamp = '';
          if (msg.timestamp) {
            const date = new Date(msg.timestamp);
            timestamp = date.toISOString().replace('T', ' ').substring(0, 19);
          } else if (msg.createdAt && msg.createdAt.toDate) {
            const date = msg.createdAt.toDate();
            timestamp = date.toISOString().replace('T', ' ').substring(0, 19);
          }

          markdown += `* ${timestamp}, ${msg.content}\n`;
        });
      }

      markdown += `\n`;
    });

    // ファイルに保存
    const outputDir = path.join(__dirname, '../output/reports');
    fs.mkdirSync(outputDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const outputPath = path.join(outputDir, `conversation-export-${timestamp}.md`);

    fs.writeFileSync(outputPath, markdown, 'utf8');

    console.log('✅ Markdown ノート生成完了！');
    console.log(`   出力先: ${outputPath}`);
    console.log(`   ライン数: ${lines.length}`);
    console.log(`   メッセージ数: ${Object.keys(messages).length}`);

    process.exit(0);

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  }
}

exportFirestoreToMarkdown();

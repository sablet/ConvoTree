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

    // ラインの祖先チェーンを取得（新データ構造: parent_line_id ベース）
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

      // 親ラインがある場合は祖先を再帰的に取得
      if (line.parent_line_id) {
        const parentAncestry = getLineAncestry(line.parent_line_id, visited);
        ancestry = [...parentAncestry, line.parent_line_id];
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

    // ライン名一覧（パンくず構造付き、名前順でソート）
    markdown += `## ライン名一覧\n\n`;
    
    // Sort lines by breadcrumbs for consistent ordering
    const linesWithBreadcrumbs = lines.map(line => ({
      line,
      breadcrumbs: generateBreadcrumbs(line.id)
    }));
    linesWithBreadcrumbs.sort((a, b) => a.breadcrumbs.localeCompare(b.breadcrumbs));
    
    linesWithBreadcrumbs.forEach(({ breadcrumbs }) => {
      markdown += `* ${breadcrumbs}\n`;
    });
    markdown += `\n---\n\n`;

    // 各ラインごとにメッセージを出力（ソート済みの順序で）
    linesWithBreadcrumbs.forEach(({ line, breadcrumbs }) => {

      markdown += `## ${breadcrumbs}\n\n`;

      // このラインに属するメッセージを取得（新データ構造: lineId でフィルタリング）
      const lineMessages = Object.entries(messages)
        .filter(([_, msg]) => msg.lineId === line.id && msg.content)
        .map(([id, msg]) => ({ id, ...msg }))
        .sort((a, b) => {
          // タイムスタンプでソート
          const timeA = a.timestamp ? new Date(a.timestamp).getTime() :
                       (a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0);
          const timeB = b.timestamp ? new Date(b.timestamp).getTime() :
                       (b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0);
          return timeA - timeB;
        });

      if (lineMessages.length === 0) {
        markdown += `_（メッセージなし）_\n\n`;
      } else {
        lineMessages.forEach(msg => {
          // Format timestamp (YYYY-MM-DD HH:MM:SS)
          let timestamp = '';
          if (msg.timestamp) {
            const date = new Date(msg.timestamp);
            timestamp = date.toISOString().replace('T', ' ').substring(0, 19);
          } else if (msg.createdAt && msg.createdAt.toDate) {
            const date = msg.createdAt.toDate();
            timestamp = date.toISOString().replace('T', ' ').substring(0, 19);
          }

          // Get type
          const type = msg.type || 'text';

          // Process content: replace newlines and truncate if needed
          let content = msg.content.replace(/\n/g, '\\n');
          if (content.length > 200) {
            content = content.substring(0, 100) + '...';
          }
          // Escape double quotes for CSV compatibility
          content = content.replace(/"/g, '""');

          // Filter metadata to only include relevant properties
          let filteredMetadata = {};
          if (msg.metadata) {
            // Task properties
            if (msg.metadata.priority !== undefined) filteredMetadata.priority = msg.metadata.priority;
            if (msg.metadata.completed !== undefined) filteredMetadata.completed = msg.metadata.completed;
            if (msg.metadata.completedAt !== undefined) filteredMetadata.completedAt = msg.metadata.completedAt;

            // Session properties
            if (msg.metadata.checkedInAt !== undefined) filteredMetadata.checkedInAt = msg.metadata.checkedInAt;
            if (msg.metadata.checkedOutAt !== undefined) filteredMetadata.checkedOutAt = msg.metadata.checkedOutAt;
            if (msg.metadata.timeSpent !== undefined) filteredMetadata.timeSpent = msg.metadata.timeSpent;
          }

          // Serialize metadata as JSON string (no escaping inside, just wrap in quotes)
          let metadataStr = '';
          if (Object.keys(filteredMetadata).length > 0) {
            metadataStr = JSON.stringify(filteredMetadata);
          }

          // Build output line: timestamp, content, type, metadata
          // Note: metadata contains JSON with quotes, so we escape it for CSV
          const escapedMetadata = metadataStr.replace(/"/g, '""');
          markdown += `* ${timestamp}, "${content}", ${type}, "${escapedMetadata}"\n`;
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

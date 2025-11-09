#!/usr/bin/env node

/**
 * 新しいデータ構造の整合性を確認するスクリプト
 *
 * チェック項目:
 * 1. Message.lineId が存在する Line を参照しているか
 * 2. Line.parent_line_id が存在する Line を参照しているか（null を除く）
 * 3. 循環参照がないか（Line 階層）
 * 4. 孤児データがないか
 */

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

async function checkNewDataIntegrity() {
  try {
    // コマンドライン引数から会話IDを取得
    const conversationId = process.argv[2] || 'chat-minimal-conversation-1';
    const conversationRef = db.collection(CONVERSATIONS_COLLECTION).doc(conversationId);

    console.log('🔍 新データ構造 整合性チェック開始...');
    console.log(`   会話ID: ${conversationId}\n`);

    // データ取得
    console.log('📥 データ取得中...');
    const [messagesSnapshot, linesSnapshot] = await Promise.all([
      conversationRef.collection(MESSAGES_SUBCOLLECTION).get(),
      conversationRef.collection(LINES_SUBCOLLECTION).get()
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

    console.log(`✅ データ取得完了`);
    console.log(`   メッセージ数: ${Object.keys(messages).length}`);
    console.log(`   ライン数: ${Object.keys(lines).length}\n`);

    const errors = [];
    const warnings = [];

    // 1. Message.lineId が存在する Line を参照しているか
    console.log('--- Message.lineId チェック ---');
    Object.values(messages).forEach(msg => {
      if (!msg.lineId) {
        warnings.push(`Message ${msg.id}: lineId が設定されていません（孤児メッセージ）`);
      } else if (!lines[msg.lineId]) {
        errors.push(`Message ${msg.id}: lineId (${msg.lineId}) が存在しません`);
      }
    });

    // 2. Line.parent_line_id が存在する Line を参照しているか（null を除く）
    console.log('--- Line.parent_line_id チェック ---');
    Object.values(lines).forEach(line => {
      if (line.parent_line_id !== null && line.parent_line_id !== undefined) {
        if (!lines[line.parent_line_id]) {
          errors.push(`Line ${line.id}: parent_line_id (${line.parent_line_id}) が存在しません`);
        }
      }
    });

    // 3. 循環参照チェック（Line 階層）
    console.log('--- Line 循環参照チェック ---');
    Object.entries(lines).forEach(([lineId, lineData]) => {
      const visited = new Set();
      let currentId = lineId;

      while (currentId && lines[currentId]?.parent_line_id) {
        if (visited.has(currentId)) {
          errors.push(`Line ${lineId}: 循環参照が検出されました（${Array.from(visited).join(' -> ')} -> ${currentId}）`);
          break;
        }

        visited.add(currentId);
        currentId = lines[currentId].parent_line_id;

        // 最大深度チェック（無限ループ防止）
        if (visited.size > 100) {
          errors.push(`Line ${lineId}: 階層が深すぎます（100階層以上）`);
          break;
        }
      }
    });

    // 4. 孤児データチェック
    console.log('--- 孤児データチェック ---');

    // 孤児メッセージ（どのラインにも属していない）
    const orphanMessages = Object.values(messages).filter(msg => !msg.lineId);
    if (orphanMessages.length > 0) {
      warnings.push(`孤児メッセージが ${orphanMessages.length} 件あります`);
    }

    // 使用されていないライン（メッセージが1つもない、かつ子ラインもない）
    const usedLines = new Set();
    Object.values(messages).forEach(msg => {
      if (msg.lineId) {
        usedLines.add(msg.lineId);
      }
    });
    Object.values(lines).forEach(line => {
      if (line.parent_line_id) {
        usedLines.add(line.parent_line_id);
      }
    });

    const unusedLines = Object.values(lines).filter(line => !usedLines.has(line.id));
    if (unusedLines.length > 0) {
      warnings.push(`使用されていないラインが ${unusedLines.length} 件あります: ${unusedLines.map(l => l.id).join(', ')}`);
    }

    // 5. Line 階層の深さチェック
    console.log('--- Line 階層深さチェック ---');
    const lineDepths = {};

    function getLineDepth(lineId, visiting = new Set()) {
      if (lineDepths[lineId] !== undefined) {
        return lineDepths[lineId];
      }

      // 循環参照検出（念のため）
      if (visiting.has(lineId)) {
        console.log(`   ⚠️  循環参照を検出: ${lineId}`);
        return 0;
      }

      const line = lines[lineId];
      if (!line) return 0;

      if (!line.parent_line_id) {
        lineDepths[lineId] = 0;
        return 0;
      }

      visiting.add(lineId);
      const depth = 1 + getLineDepth(line.parent_line_id, visiting);
      visiting.delete(lineId);

      lineDepths[lineId] = depth;
      return depth;
    }

    Object.keys(lines).forEach(lineId => {
      const depth = getLineDepth(lineId);
      if (depth > 10) {
        warnings.push(`Line ${lineId}: 階層が深すぎます（深さ ${depth}）`);
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

    // 統計情報
    console.log('=== 統計情報 ===\n');

    // ルートライン数
    const rootLines = Object.values(lines).filter(line => !line.parent_line_id);
    console.log(`ルートライン数: ${rootLines.length}`);

    // 最大階層深度
    const maxDepth = Math.max(...Object.values(lineDepths));
    console.log(`最大階層深度: ${maxDepth}`);

    // メッセージ分布
    const messageCountsByLine = {};
    Object.values(messages).forEach(msg => {
      if (msg.lineId) {
        messageCountsByLine[msg.lineId] = (messageCountsByLine[msg.lineId] || 0) + 1;
      }
    });

    const linesWithMessages = Object.keys(messageCountsByLine).length;
    console.log(`メッセージを持つライン数: ${linesWithMessages} / ${Object.keys(lines).length}`);

    const avgMessagesPerLine = Object.keys(messages).length / linesWithMessages || 0;
    console.log(`ライン当たり平均メッセージ数: ${avgMessagesPerLine.toFixed(2)}`);

    console.log('');

    process.exit(errors.length > 0 ? 1 : 0);

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  }
}

checkNewDataIntegrity();

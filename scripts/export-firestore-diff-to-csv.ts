#!/usr/bin/env node

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import admin from 'firebase-admin';

// .env.localを読み込む
dotenv.config({ path: path.join(__dirname, '../.env.local') });

import { db as neonDb } from '../lib/db/client-node';
import { messages } from '../lib/db/schema';

const OUTPUT_DIR = path.join(__dirname, '../output/db-exports');

// Firebase Admin の初期化
const serviceAccount = require('../firebase-service-account.json');
if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}
const firestore = admin.firestore();

function escapeCSVValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  // JSON型のカラムはJSON文字列に変換
  if (typeof value === 'object' && !(value instanceof Date)) {
    const jsonStr = JSON.stringify(value);
    return `"${jsonStr.replace(/"/g, '""')}"`;
  }

  // 日付型
  if (value instanceof Date) {
    return value.toISOString();
  }

  const str = String(value);

  // カンマ、改行、ダブルクォートが含まれている場合はエスケープ
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

function convertToCSV(data: Record<string, unknown>[], columns: string[]): string {
  const header = columns.join(',');
  const rows = data.map(row =>
    columns.map(col => escapeCSVValue(row[col])).join(',')
  );
  return [header, ...rows].join('\n');
}

async function exportDiff(conversationId: string) {
  console.log('🔍 Firestore と Neon の差分データエクスポート開始\n');
  console.log(`📋 Conversation ID: ${conversationId}\n`);

  // 1. Neonからメッセージのcontentを取得
  console.log('📥 Neon DBからメッセージを取得中...');
  const neonMessages = await neonDb.select().from(messages);
  const neonContents = new Set(neonMessages.map(m => m.content));
  console.log(`  ✅ ${neonMessages.length} 件のメッセージを取得\n`);

  // 2. Firestoreからメッセージを取得
  console.log('📥 Firestoreからメッセージを取得中...');
  const messagesRef = firestore.collection(`conversations/${conversationId}/messages`);
  const snapshot = await messagesRef.get();

  console.log(`  ✅ ${snapshot.size} 件のメッセージを取得\n`);

  // 3. 差分を抽出
  console.log('🔍 差分を抽出中...');
  const diffMessages: Record<string, unknown>[] = [];

  snapshot.forEach(doc => {
    const data = doc.data();
    const content = data.content || '';

    // Neonに存在しないcontentのメッセージを抽出
    if (!neonContents.has(content)) {
      // Timestamp型かDateか文字列かを判定
      const parseTimestamp = (value: any) => {
        if (!value) return new Date();
        if (value.toDate) return value.toDate();
        if (value instanceof Date) return value;
        return new Date(value);
      };

      diffMessages.push({
        id: doc.id,
        content: content,
        timestamp: parseTimestamp(data.timestamp),
        updated_at: data.updatedAt ? parseTimestamp(data.updatedAt) : null,
        line_id: data.lineId || '',
        tags: data.tags || null,
        has_bookmark: data.hasBookmark ?? false,
        author: data.author || null,
        type: data.type || null,
        metadata: data.metadata || null,
        deleted: data.deleted ?? false,
        deleted_at: data.deletedAt ? parseTimestamp(data.deletedAt) : null,
      });
    }
  });

  console.log(`  ✅ ${diffMessages.length} 件の差分メッセージを検出\n`);

  if (diffMessages.length === 0) {
    console.log('✅ 差分データはありません。Firestoreの全データがNeonに存在します。');
    return;
  }

  // 4. CSVにエクスポート
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const exportDir = path.join(OUTPUT_DIR, `firestore-diff-${timestamp}`);
  fs.mkdirSync(exportDir, { recursive: true });
  console.log(`📁 出力先: ${exportDir}\n`);

  const messagesCSV = convertToCSV(
    diffMessages,
    [
      'id',
      'content',
      'timestamp',
      'updated_at',
      'line_id',
      'tags',
      'has_bookmark',
      'author',
      'type',
      'metadata',
      'deleted',
      'deleted_at',
    ]
  );
  fs.writeFileSync(path.join(exportDir, 'messages.csv'), messagesCSV, 'utf8');
  console.log(`📤 ${diffMessages.length} 件の差分メッセージをエクスポート完了\n`);

  // サマリーファイルの作成
  const summary = {
    export_timestamp: new Date().toISOString(),
    source: 'firestore-diff',
    conversation_id: conversationId,
    neon_messages: neonMessages.length,
    firestore_messages: snapshot.size,
    diff_messages: diffMessages.length,
  };
  fs.writeFileSync(
    path.join(exportDir, 'export-summary.json'),
    JSON.stringify(summary, null, 2),
    'utf8'
  );

  console.log('✅ エクスポート完了！');
  console.log(`\n📊 サマリー:`);
  console.log(`  - Neonのメッセージ数: ${summary.neon_messages} 件`);
  console.log(`  - Firestoreのメッセージ数: ${summary.firestore_messages} 件`);
  console.log(`  - 差分メッセージ数: ${summary.diff_messages} 件`);
  console.log(`\n📁 エクスポート先: ${exportDir}`);
  console.log(`\n💡 インポート方法:`);
  console.log(`   npm run import:neon ${exportDir}`);
}

// コマンドライン引数の処理
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('使用方法: npm run export:firestore:diff <conversation-id>');
  console.error('例: npm run export:firestore:diff chat-minimal-conversation-2');
  console.error('');
  console.error('このスクリプトは、Firestoreに存在しNeonに存在しないメッセージを');
  console.error('contentフィールドで比較して抽出します。');
  console.error('主に移行作業中の差分確認に使用します。');
  process.exit(1);
}

const conversationId = args[0];

exportDiff(conversationId).catch(console.error);

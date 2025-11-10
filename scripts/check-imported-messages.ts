#!/usr/bin/env node

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.join(__dirname, '../.env.local') });

import { db } from '../lib/db/client-node';
import { messages } from '../lib/db/schema';
import { eq, inArray } from 'drizzle-orm';

async function checkImportedMessages() {
  // 差分CSVからIDを読み取る
  const csvPath = path.join(__dirname, '../output/db-exports/firestore-diff-2025-11-10T09-05-15/messages.csv');
  const csvContent = fs.readFileSync(csvPath, 'utf8');
  const lines = csvContent.split('\n');

  const importedIds: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const match = lines[i].match(/^([^,]+),/);
    if (match) {
      importedIds.push(match[1]);
    }
  }

  console.log(`📋 差分CSVに含まれるメッセージID (${importedIds.length}件):\n`);

  // DBから該当メッセージを取得
  const importedMessages = await db.select()
    .from(messages)
    .where(inArray(messages.id, importedIds));

  console.log(`✅ DBに存在するメッセージ: ${importedMessages.length} 件\n`);

  // deleted状態を確認
  const deletedCount = importedMessages.filter(m => m.deleted).length;
  const notDeletedCount = importedMessages.filter(m => !m.deleted).length;

  console.log(`📊 deleted状態の内訳:`);
  console.log(`  - deleted=false: ${notDeletedCount} 件`);
  console.log(`  - deleted=true: ${deletedCount} 件\n`);

  // 各メッセージの詳細
  console.log(`📝 メッセージ詳細:\n`);
  importedMessages.forEach(msg => {
    console.log(`ID: ${msg.id}`);
    console.log(`  line_id: ${msg.line_id}`);
    console.log(`  deleted: ${msg.deleted}`);
    console.log(`  content: ${msg.content.substring(0, 50)}...`);
    console.log(``);
  });

  // 欠けているIDを確認
  const foundIds = new Set(importedMessages.map(m => m.id));
  const missingIds = importedIds.filter(id => !foundIds.has(id));
  if (missingIds.length > 0) {
    console.log(`❌ DBに存在しないメッセージID (${missingIds.length}件):`);
    missingIds.forEach(id => console.log(`  - ${id}`));
  }
}

checkImportedMessages().catch(console.error).finally(() => process.exit(0));

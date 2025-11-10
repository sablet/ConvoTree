#!/usr/bin/env node

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env.local') });

import { db } from '../lib/db/client-node';
import { lines, messages } from '../lib/db/schema';
import { sql } from 'drizzle-orm';

async function checkLines() {
  // 全ラインIDを取得
  const allLines = await db.select({ id: lines.id, name: lines.name }).from(lines);
  console.log('📋 Neon DB の全ライン:');
  allLines.forEach(line => console.log(`  - ${line.id}: ${line.name}`));

  console.log('\n🔍 差分データで使われているline_id:');
  const diffLineIds = ['main', 'fV5SdrAnDTk21k7DLTgZ'];
  for (const lineId of diffLineIds) {
    const lineExists = allLines.some(l => l.id === lineId);
    console.log(`  - ${lineId}: ${lineExists ? '✅ 存在' : '❌ 存在しない'}`);
  }

  // メッセージ数を確認
  const messageCount = await db.select({ count: sql<number>`count(*)` }).from(messages);
  console.log(`\n📊 総メッセージ数: ${messageCount[0].count}`);

  // line_id別のメッセージ数
  const messagesByLine = await db.select({
    line_id: messages.line_id,
    count: sql<number>`count(*)`
  }).from(messages).groupBy(messages.line_id);

  console.log('\n📊 line_id別メッセージ数:');
  messagesByLine.forEach(row => console.log(`  - ${row.line_id}: ${row.count} 件`));
}

checkLines().catch(console.error).finally(() => process.exit(0));

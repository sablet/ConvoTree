#!/usr/bin/env node

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// .env.localを読み込む
dotenv.config({ path: path.join(__dirname, '../.env.local') });

import { db } from '../lib/db/client-node';
import { messages, lines, tags, tagGroups } from '../lib/db/schema';

const OUTPUT_DIR = path.join(__dirname, '../output/db-exports');

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

async function exportData() {
  console.log('🚀 Neon DB エクスポート開始\n');

  // 出力ディレクトリの作成
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const exportDir = path.join(OUTPUT_DIR, timestamp);
  fs.mkdirSync(exportDir, { recursive: true });
  console.log(`📁 出力先: ${exportDir}\n`);

  // 1. TagGroups のエクスポート
  console.log('📤 tag_groups をエクスポート中...');
  const tagGroupsData = await db.select().from(tagGroups);
  const tagGroupsCSV = convertToCSV(
    tagGroupsData as unknown as Record<string, unknown>[],
    ['id', 'name', 'color', 'order']
  );
  fs.writeFileSync(path.join(exportDir, 'tag_groups.csv'), tagGroupsCSV, 'utf8');
  console.log(`  ✅ ${tagGroupsData.length} 件エクスポート完了\n`);

  // 2. Tags のエクスポート
  console.log('📤 tags をエクスポート中...');
  const tagsData = await db.select().from(tags);
  const tagsCSV = convertToCSV(
    tagsData as unknown as Record<string, unknown>[],
    ['id', 'name', 'color', 'group_id']
  );
  fs.writeFileSync(path.join(exportDir, 'tags.csv'), tagsCSV, 'utf8');
  console.log(`  ✅ ${tagsData.length} 件エクスポート完了\n`);

  // 3. Lines のエクスポート
  console.log('📤 lines をエクスポート中...');
  const linesData = await db.select().from(lines);
  const linesCSV = convertToCSV(
    linesData as unknown as Record<string, unknown>[],
    ['id', 'name', 'parent_line_id', 'tag_ids', 'created_at', 'updated_at']
  );
  fs.writeFileSync(path.join(exportDir, 'lines.csv'), linesCSV, 'utf8');
  console.log(`  ✅ ${linesData.length} 件エクスポート完了\n`);

  // 4. Messages のエクスポート (画像データは除外)
  console.log('📤 messages をエクスポート中...');
  const messagesData = await db.select().from(messages);

  // CSVには画像以外のデータをエクスポート
  const messagesCSV = convertToCSV(
    messagesData.map(m => ({ ...m, images: null })) as unknown as Record<string, unknown>[],
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
  console.log(`  ✅ ${messagesData.length} 件エクスポート完了（画像データは除外）\n`);

  // サマリーファイルの作成
  const summary = {
    export_timestamp: new Date().toISOString(),
    tables: {
      tag_groups: tagGroupsData.length,
      tags: tagsData.length,
      lines: linesData.length,
      messages: messagesData.length,
    },
    total_records: tagGroupsData.length + tagsData.length + linesData.length + messagesData.length,
  };
  fs.writeFileSync(
    path.join(exportDir, 'export-summary.json'),
    JSON.stringify(summary, null, 2),
    'utf8'
  );

  console.log('✅ エクスポート完了！');
  console.log(`\n📊 サマリー:`);
  console.log(`  - tag_groups: ${summary.tables.tag_groups} 件`);
  console.log(`  - tags: ${summary.tables.tags} 件`);
  console.log(`  - lines: ${summary.tables.lines} 件`);
  console.log(`  - messages: ${summary.tables.messages} 件`);
  console.log(`  - 合計: ${summary.total_records} 件`);
  console.log(`\n📁 エクスポート先: ${exportDir}`);
}

exportData().catch(console.error);

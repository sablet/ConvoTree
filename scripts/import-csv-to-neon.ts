#!/usr/bin/env node

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

// .env.localを読み込む
dotenv.config({ path: path.join(__dirname, '../.env.local') });

import { db, closeDb } from '../lib/db/client-node';
import { messages, lines, tags, tagGroups } from '../lib/db/schema';

// UUID v4 を生成する関数
function generateUUID(): string {
  return crypto.randomUUID();
}

function parseCSV(csvContent: string): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  let currentLine = '';
  let insideQuotes = false;

  // 改行を含むフィールドを考慮してCSVを行に分割
  const lines: string[] = [];
  for (let i = 0; i < csvContent.length; i++) {
    const char = csvContent[i];
    const nextChar = csvContent[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentLine += '""';
        i++; // 次の文字をスキップ
      } else {
        insideQuotes = !insideQuotes;
        currentLine += char;
      }
    } else if (char === '\n' && !insideQuotes) {
      if (currentLine.trim()) {
        lines.push(currentLine);
      }
      currentLine = '';
    } else {
      currentLine += char;
    }
  }
  if (currentLine.trim()) {
    lines.push(currentLine);
  }

  if (lines.length === 0) return [];

  const headers = parseCSVLine(lines[0]);

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === headers.length) {
      const row: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        row[header] = parseValue(values[index]);
      });
      rows.push(row);
    }
  }

  return rows;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        // エスケープされたダブルクォート
        current += '"';
        i++; // 次の文字をスキップ
      } else {
        // クォートの開始または終了
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      // フィールドの区切り
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  // 最後のフィールドを追加
  result.push(current);

  return result;
}

function parseValue(value: string): unknown {
  // 空文字列はnull
  if (value === '') return null;

  // 真偽値
  if (value === 'true') return true;
  if (value === 'false') return false;

  // 数値
  if (/^-?\d+$/.test(value)) return parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);

  // ISO日付形式
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
    return new Date(value);
  }

  // JSON形式（配列やオブジェクト）
  if ((value.startsWith('{') && value.endsWith('}')) ||
      (value.startsWith('[') && value.endsWith(']'))) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  return value;
}

async function importData(importDir: string, clearExisting: boolean = false) {
  console.log('🚀 Neon DB インポート開始\n');
  console.log(`📁 インポート元: ${importDir}\n`);

  // どのCSVファイルが存在するかチェック
  const csvFiles = {
    tag_groups: fs.existsSync(path.join(importDir, 'tag_groups.csv')),
    tags: fs.existsSync(path.join(importDir, 'tags.csv')),
    lines: fs.existsSync(path.join(importDir, 'lines.csv')),
    messages: fs.existsSync(path.join(importDir, 'messages.csv')),
  };

  // サマリーファイルの確認
  const summaryPath = path.join(importDir, 'export-summary.json');
  if (fs.existsSync(summaryPath)) {
    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
    console.log('📊 インポート予定:');
    if (summary.tables) {
      // 通常のエクスポート形式
      if (csvFiles.tag_groups) console.log(`  - tag_groups: ${summary.tables.tag_groups} 件`);
      if (csvFiles.tags) console.log(`  - tags: ${summary.tables.tags} 件`);
      if (csvFiles.lines) console.log(`  - lines: ${summary.tables.lines} 件`);
      if (csvFiles.messages) console.log(`  - messages: ${summary.tables.messages} 件`);
      console.log(`  - 合計: ${summary.total_records} 件\n`);
    } else if (summary.diff_messages !== undefined) {
      // 差分エクスポート形式
      console.log(`  - 差分メッセージ: ${summary.diff_messages} 件\n`);
    }
  }

  // 既存データのクリア
  if (clearExisting) {
    console.log('🗑️  既存データをクリア中...');
    await db.execute('TRUNCATE TABLE messages, lines, tags, tag_groups CASCADE' as unknown as string);
    console.log('  ✅ クリア完了\n');
  }

  // 1. TagGroups のインポート（存在する場合のみ）
  if (csvFiles.tag_groups) {
    console.log('📥 tag_groups をインポート中...');
    const tagGroupsCSV = fs.readFileSync(path.join(importDir, 'tag_groups.csv'), 'utf8');
    const tagGroupsData = parseCSV(tagGroupsCSV);

    for (const row of tagGroupsData) {
      await db.insert(tagGroups).values({
        id: (row.id as string) || generateUUID(),
        name: row.name as string,
        color: row.color as string,
        order: row.order as number,
      }).onConflictDoNothing();
    }
    console.log(`  ✅ ${tagGroupsData.length} 件インポート完了\n`);
  }

  // 2. Tags のインポート（存在する場合のみ）
  if (csvFiles.tags) {
    console.log('📥 tags をインポート中...');
    const tagsCSV = fs.readFileSync(path.join(importDir, 'tags.csv'), 'utf8');
    const tagsData = parseCSV(tagsCSV);

    for (const row of tagsData) {
      await db.insert(tags).values({
        id: (row.id as string) || generateUUID(),
        name: row.name as string,
        color: (row.color as string) || null,
        group_id: (row.group_id as string) || null,
      }).onConflictDoNothing();
    }
    console.log(`  ✅ ${tagsData.length} 件インポート完了\n`);
  }

  // 3. Lines のインポート（存在する場合のみ）
  if (csvFiles.lines) {
    console.log('📥 lines をインポート中...');
    const linesCSV = fs.readFileSync(path.join(importDir, 'lines.csv'), 'utf8');
    const linesData = parseCSV(linesCSV);

    for (const row of linesData) {
      await db.insert(lines).values({
        id: (row.id as string) || generateUUID(),
        name: row.name as string,
        parent_line_id: (row.parent_line_id as string) || null,
        tag_ids: (row.tag_ids as string[]) || null,
        created_at: row.created_at as Date,
        updated_at: row.updated_at as Date,
      }).onConflictDoNothing();
    }
    console.log(`  ✅ ${linesData.length} 件インポート完了\n`);
  }

  // 4. Messages のインポート（存在する場合のみ、画像データは既存データを保持）
  if (csvFiles.messages) {
    console.log('📥 messages をインポート中...');
    const messagesCSV = fs.readFileSync(path.join(importDir, 'messages.csv'), 'utf8');
    const messagesData = parseCSV(messagesCSV);

    let importedCount = 0;
    for (const row of messagesData) {
      const messageId = (row.id as string) || generateUUID();
      await db.insert(messages).values({
        id: messageId,
        content: (row.content as string) || '',  // NOT NULL制約のため空文字列に変換
        timestamp: row.timestamp as Date,
        updated_at: (row.updated_at as Date) || null,
        line_id: row.line_id as string,
        tags: (row.tags as string[]) || null,
        has_bookmark: (row.has_bookmark as boolean) ?? false,
        author: (row.author as string) || null,
        images: null,  // 画像データは保持（重複時はスキップされるため既存データが残る）
        type: (row.type as string) || null,
        metadata: (row.metadata as Record<string, unknown>) || null,
        deleted: (row.deleted as boolean) ?? false,
        deleted_at: (row.deleted_at as Date) || null,
      }).onConflictDoNothing();
      importedCount++;
      if (importedCount % 100 === 0) {
        console.log(`  進捗: ${importedCount} / ${messagesData.length} 件`);
      }
    }
    console.log(`  ✅ ${messagesData.length} 件インポート完了（画像データは既存を保持）\n`);
  }

  console.log('✅ インポート完了！');
}

// コマンドライン引数の処理
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('使用方法: npm run import:neon <インポート元ディレクトリ> [--clear]');
  console.error('例: npm run import:neon output/db-exports/2025-01-01T00-00-00');
  console.error('    npm run import:neon output/db-exports/2025-01-01T00-00-00 --clear');
  console.error('');
  console.error('デフォルトでは既存データをスキップ（重複はインポートしない）');
  console.error('--clear オプションを付けると既存データを全削除してからインポート');
  process.exit(1);
}

const importDir = path.isAbsolute(args[0])
  ? args[0]
  : path.join(__dirname, '..', args[0]);
const clearExisting = args.includes('--clear');

if (!fs.existsSync(importDir)) {
  console.error(`エラー: ディレクトリが存在しません: ${importDir}`);
  process.exit(1);
}

importData(importDir, clearExisting)
  .catch(console.error)
  .finally(async () => {
    await closeDb();
  });

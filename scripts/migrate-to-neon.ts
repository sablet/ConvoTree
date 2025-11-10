#!/usr/bin/env node

import * as dotenv from 'dotenv';
import * as path from 'path';

// .env.localを読み込む
dotenv.config({ path: path.join(__dirname, '../.env.local') });

import * as fs from 'fs';
import { db } from '../lib/db/client';
import { messages, lines, tags, tagGroups } from '../lib/db/schema';

const BACKUP_DIR = path.join(__dirname, '../output/backups/2025-11-09T08-24-43/converted');

function convertFirestoreTimestamp(fsTimestamp: { _seconds: number; _nanoseconds: number }): Date {
  const date = new Date(fsTimestamp._seconds * 1000 + fsTimestamp._nanoseconds / 1000000);
  return isValidDate(date) ? date : new Date();
}

function isValidDate(date: Date): boolean {
  return date instanceof Date && !isNaN(date.getTime());
}

function safeDate(value: string | Date | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return isValidDate(date) ? date : null;
}

async function migrate() {
  console.log('🚀 PostgreSQL データ移行開始\n');

  // 0. 既存データをクリア
  console.log('🗑️  既存データをクリア中...');
  await db.execute('TRUNCATE TABLE messages, lines, tags, tag_groups CASCADE' as any);
  console.log('  ✅ クリア完了\n');

  // 1. JSONファイル読み込み
  console.log('📥 バックアップデータ読み込み中...');
  const messagesData = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, 'messages.json'), 'utf8'));
  const linesData = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, 'lines.json'), 'utf8'));
  const tagsData = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, '../tags.json'), 'utf8'));
  const tagGroupsData = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, '../tagGroups.json'), 'utf8'));

  console.log(`  - Messages: ${Object.keys(messagesData).length} 件`);
  console.log(`  - Lines: ${Object.keys(linesData).length} 件`);
  console.log(`  - Tags: ${Object.keys(tagsData).length} 件`);
  console.log(`  - TagGroups: ${Object.keys(tagGroupsData).length} 件\n`);

  // 2. TagGroups 挿入（外部キー制約のため先に挿入）
  console.log('📝 TagGroups を挿入中...');
  for (const [id, tg] of Object.entries(tagGroupsData) as Array<[string, {
    name: string;
    color: string;
    order: number;
  }]>) {
    await db.insert(tagGroups).values({
      id,
      name: tg.name,
      color: tg.color,
      order: tg.order,
    });
  }
  console.log(`  ✅ ${Object.keys(tagGroupsData).length} 件挿入完了\n`);

  // 3. Tags 挿入
  console.log('📝 Tags を挿入中...');
  for (const [id, tag] of Object.entries(tagsData) as Array<[string, {
    name: string;
    color?: string;
    groupId?: string;
  }]>) {
    await db.insert(tags).values({
      id,
      name: tag.name,
      color: tag.color ?? null,
      group_id: tag.groupId ?? null,
    });
  }
  console.log(`  ✅ ${Object.keys(tagsData).length} 件挿入完了\n`);

  // 4. Lines 挿入
  console.log('📝 Lines を挿入中...');
  for (const [id, line] of Object.entries(linesData) as Array<[string, {
    name: string;
    parent_line_id: string | null;
    tagIds?: string[];
    createdAt?: { _seconds: number; _nanoseconds: number };
    updatedAt?: { _seconds: number; _nanoseconds: number };
    created_at?: string;
    updated_at?: string;
  }]>) {
    await db.insert(lines).values({
      id,
      name: line.name,
      parent_line_id: line.parent_line_id,
      tag_ids: line.tagIds ?? null,
      created_at: line.createdAt ? convertFirestoreTimestamp(line.createdAt) : new Date(line.created_at!),
      updated_at: line.updatedAt ? convertFirestoreTimestamp(line.updatedAt) : new Date(line.updated_at!),
    });
  }
  console.log(`  ✅ ${Object.keys(linesData).length} 件挿入完了\n`);

  // 4.5. 欠落しているline IDを確認して作成
  console.log('🔍 欠落しているline IDをチェック中...');
  const msgLineIds = new Set(Object.values(messagesData).map((m: { lineId: string }) => m.lineId));
  const existingLineIds = new Set(Object.keys(linesData));
  const missingLineIds = [...msgLineIds].filter(id => !existingLineIds.has(id));

  if (missingLineIds.length > 0) {
    console.log(`  ⚠️  ${missingLineIds.length} 件の欠落したline IDを発見: ${missingLineIds.join(', ')}`);
    console.log('  📝 欠落したlineを作成中...');
    const now = new Date();
    for (const id of missingLineIds) {
      await db.insert(lines).values({
        id,
        name: `[復元] ${id}`,
        parent_line_id: null,
        tag_ids: null,
        created_at: now,
        updated_at: now,
      });
    }
    console.log(`  ✅ ${missingLineIds.length} 件の欠落したlineを作成完了\n`);
  } else {
    console.log('  ✅ 欠落しているline IDなし\n');
  }

  // 5. Messages 挿入
  console.log('📝 Messages を挿入中...');
  let insertedCount = 0;
  for (const [id, msg] of Object.entries(messagesData) as Array<[string, {
    content: string;
    lineId: string;
    createdAt?: { _seconds: number; _nanoseconds: number };
    updatedAt?: { _seconds: number; _nanoseconds: number };
    timestamp?: string | Date;
    tags?: string[];
    hasBookmark?: boolean;
    author?: string;
    images?: string[];
    type?: string;
    metadata?: Record<string, unknown>;
    deleted?: boolean;
    deletedAt?: string | Date;
  }]>) {
    const timestamp = msg.createdAt
      ? convertFirestoreTimestamp(msg.createdAt)
      : (msg.timestamp ? safeDate(msg.timestamp) : new Date());
    const updatedAt = msg.updatedAt
      ? convertFirestoreTimestamp(msg.updatedAt)
      : null;
    const deletedAt = msg.deletedAt ? safeDate(msg.deletedAt) : null;

    await db.insert(messages).values({
      id,
      content: msg.content,
      timestamp: timestamp || new Date(),
      updated_at: updatedAt,
      line_id: msg.lineId,
      tags: msg.tags ?? null,
      has_bookmark: msg.hasBookmark ?? false,
      author: msg.author ?? null,
      images: msg.images ?? null,
      type: msg.type ?? null,
      metadata: msg.metadata ?? null,
      deleted: msg.deleted ?? false,
      deleted_at: deletedAt,
    });
    insertedCount++;
    if (insertedCount % 100 === 0) {
      console.log(`  進捗: ${insertedCount} / ${Object.keys(messagesData).length} 件`);
    }
  }
  console.log(`  ✅ ${Object.keys(messagesData).length} 件挿入完了\n`);

  console.log('✅ データ移行完了！');
}

migrate().catch(console.error);

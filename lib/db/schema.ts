import { pgTable, text, timestamp, jsonb, integer, boolean } from 'drizzle-orm/pg-core';

// tag_groups テーブル
export const tagGroups = pgTable('tag_groups', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color').notNull(),
  order: integer('order').notNull(),
});

// lines テーブル
export const lines = pgTable('lines', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  parent_line_id: text('parent_line_id'),
  tag_ids: jsonb('tag_ids').$type<string[]>(),
  // アプリケーション側で明示的に値を設定（デフォルト値なし）
  created_at: timestamp('created_at', { withTimezone: true }).notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull(),
});

// tags テーブル
export const tags = pgTable('tags', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color'),
  group_id: text('group_id').references(() => tagGroups.id),
});

// messages テーブル
export const messages = pgTable('messages', {
  id: text('id').primaryKey(),
  content: text('content').notNull(),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
  // アプリケーション側で明示的に値を設定（デフォルト値なし）
  updated_at: timestamp('updated_at', { withTimezone: true }),
  line_id: text('line_id').notNull().references(() => lines.id),
  tags: jsonb('tags').$type<string[]>(),
  has_bookmark: boolean('has_bookmark').default(false),
  author: text('author'),
  images: jsonb('images').$type<string[]>(),
  type: text('type'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  deleted: boolean('deleted').default(false),
  deleted_at: timestamp('deleted_at', { withTimezone: true }),
});

// 型のエクスポート
export type DbMessage = typeof messages.$inferSelect;
export type DbLine = typeof lines.$inferSelect;
export type DbTag = typeof tags.$inferSelect;
export type DbTagGroup = typeof tagGroups.$inferSelect;

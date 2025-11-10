# PostgreSQL (Neon) 移行計画書

## 概要

Firestoreからバックアップしたデータを、Neon (PostgreSQL) に移行する計画です。
**既存のリポジトリパターンを維持**し、`IDataSource` インターフェースを実装した `PostgresDataSource` を追加することで、Firestore依存のないアーキテクチャを実現します。

### 移行の目的

1. **データベースの選択肢を増やす**: Firestore以外のデータベースでも動作するようにする
2. **リポジトリパターンの完全活用**: データソース切り替えが環境変数で可能に
3. **ローカルデータの活用**: 既存のFirestoreバックアップデータを使って移行

## 作業フロー

```
1. Neonセットアップ → セクション4.1
   └─ neonctl でプロジェクト作成、DATABASE_URL取得

2. パッケージインストール → セクション4.1
   └─ drizzle-orm, @neondatabase/serverless 等

3. 実装 → セクション4.2, 4.3
   ├─ lib/db/schema.ts (スキーマ定義)
   ├─ lib/db/client.ts (DB接続)
   ├─ lib/data-source/postgres.ts (PostgresDataSource)
   ├─ scripts/migrate-to-neon.ts (移行スクリプト)
   └─ 完了条件: npm run build が警告・エラーなしで通ること

4. データ移行 → セクション5
   ├─ npx drizzle-kit push (スキーマ作成)
   └─ npx tsx scripts/migrate-to-neon.ts (データ移行)

5. 動作確認 → セクション6, 7
   ├─ .env.local でデータソース切り替え
   └─ npm run dev で起動・確認
```

## アーキテクチャ設計

### 既存のリポジトリパターンとの統合

```
┌─────────────────────────────────────┐
│   Application Layer                 │
│   (components, hooks, pages)        │
│   ✅ chatRepository経由のアクセスのみ  │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│   Repository Layer                  │
│   lib/repositories/                 │
│   - キャッシュ管理                    │
│   - フォールバック処理                │
│   - エラーハンドリング                │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│   Data Source Layer                 │
│   lib/data-source/                  │
│   ├─ FirestoreDataSource            │
│   ├─ SampleDataSource               │
│   └─ PostgresDataSource  🆕         │
│   ❌ アプリ層からの直接アクセス禁止     │
└─────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│   Database Layer                    │
│   ├─ Firestore                      │
│   └─ PostgreSQL (Neon)  🆕          │
└─────────────────────────────────────┘
```

### PostgresDataSource の位置づけ

- **役割**: `IDataSource` インターフェースの PostgreSQL 実装
- **責務**: PostgreSQLへのCRUD操作を実装（Drizzle ORM使用）
- **特徴**: conversationId を持たない設計（単一会話として扱う）

## データベーススキーマ設計

### 既存TypeScript型との対応

| TypeScript型 (lib/types/index.ts) | PostgreSQLテーブル | 備考 |
|----------------------------------|-------------------|------|
| `Message` | `messages` | metadata は JSONB型 |
| `Line` | `lines` | parent_line_id を含む |
| `Tag` | `tags` | - |
| `TagGroup` | `tag_groups` | - |

### Drizzle ORMスキーマ定義

**ファイル**: `lib/db/schema.ts`

```typescript
import { pgTable, text, timestamp, jsonb, integer, boolean } from 'drizzle-orm/pg-core';

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

// lines テーブル
export const lines = pgTable('lines', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  parent_line_id: text('parent_line_id').references(() => lines.id),
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

// tag_groups テーブル
export const tagGroups = pgTable('tag_groups', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color').notNull(),
  order: integer('order').notNull(),
});

// 型のエクスポート
export type DbMessage = typeof messages.$inferSelect;
export type DbLine = typeof lines.$inferSelect;
export type DbTag = typeof tags.$inferSelect;
export type DbTagGroup = typeof tagGroups.$inferSelect;
```

### タイムスタンプ変換戦略

Firestoreのタイムスタンプ（`{_seconds, _nanoseconds}`）を PostgreSQL の TIMESTAMPTZ型に変換：

```typescript
function convertFirestoreTimestamp(fsTimestamp: { _seconds: number; _nanoseconds: number }): Date {
  return new Date(fsTimestamp._seconds * 1000 + fsTimestamp._nanoseconds / 1000000);
}
```

**統一方針**:
- `timestamp` フィールド: メッセージ作成日時
- `created_at` / `updated_at`: Firestoreの `createdAt` / `updatedAt` を優先
- 既存の `timestamp` フィールドと `created_at` が両方ある場合は `created_at` を採用

**タイムスタンプの制御方針**:
- **アプリケーション側で完全に制御**: データベースのデフォルト値は使わない
- **通常運用時**: アプリケーションで `new Date()` を明示的に設定
- **マイグレーション時**: バックアップの元の値を設定

```typescript
// 通常運用時（アプリケーションで現在時刻を設定）
await db.insert(messages).values({
  id: 'msg1',
  content: 'Hello',
  timestamp: new Date(),
  updated_at: new Date(), // アプリケーション側で明示的に設定
});

// マイグレーション時（バックアップの元の値を設定）
await db.insert(messages).values({
  id: 'msg1',
  content: 'Hello',
  timestamp: convertFirestoreTimestamp(msg.createdAt),
  updated_at: convertFirestoreTimestamp(msg.updatedAt), // 元の値を使う
});
```

**利点**:
- 動作が明確で予測可能
- テストがしやすい
- タイムゾーンの扱いを統一できる

### conversation_id 不要の理由

現在の設計では、`conversationId` は `FirestoreDataSource` の初期化パラメータとして使われていますが、PostgreSQL実装では以下の理由で不要です：

1. **単一会話として扱う**: PostgreSQLデータベース全体を1つの会話として扱う
2. **マルチテナント対応は将来課題**: 必要になった時点でテーブルにカラム追加で対応可能
3. **シンプルさ優先**: 現時点では複数会話の管理は不要

## 実装計画

### 4.1 環境セットアップ

#### neonctl のインストールと初期設定

**前提条件**: `neonctl auth` が完了していること

**1. プロジェクトを作成**

```bash
# プロジェクト作成（リージョンを指定）
neonctl projects create --name chat-line --region aws-ap-northeast-1

# プロジェクト一覧を確認
neonctl projects list

# プロジェクトIDをメモ（後で使う）
# 例: proud-waterfall-12345678
```

**2. 接続文字列を取得して .env.local に保存**

```bash
# デフォルトブランチ（main）の接続文字列を取得して .env.local に追記
echo "DATABASE_URL=$(neonctl connection-string main)" >> .env.local

# 確認
cat .env.local
```

**注意**: `.env.local` は gitignore 対象なので、機密情報（接続文字列）を安全に保存できます。

**3. （オプション）開発用ブランチを作成**

Neonのブランチ機能を使うと、本番データに影響を与えずに開発できます：

```bash
# 開発用ブランチを作成（mainブランチから分岐）
neonctl branches create --name dev --parent main

# 開発用の接続文字列を取得
neonctl connection-string dev

# 開発環境用の .env.local に保存
echo "DATABASE_URL=$(neonctl connection-string dev)" > .env.local
```

#### 必要なパッケージ

```bash
npm install drizzle-orm @neondatabase/serverless
npm install -D drizzle-kit dotenv tsx
```

#### .env設定

**既存の環境変数ファイル構成**:
- `.env.development` - 開発環境用の公開変数（Git管理）
- `.env.production` - 本番環境用の公開変数（Git管理）
- `.env.local` - ローカル固有の機密情報（gitignore対象）

**DATABASE_URL の配置**:

`.env.local` ファイル（ローカル開発用 - gitignore対象）：

```bash
# Firebase Configuration (既存)
NEXT_PUBLIC_FIREBASE_API_KEY=...
# ... (既存の設定)

# Neon PostgreSQL接続情報（追加）
DATABASE_URL=postgresql://username:password@host/neondb?sslmode=require

# データソースをPostgreSQLに切り替え（開発時のみ）
NEXT_PUBLIC_DEFAULT_DATA_SOURCE=postgres
```

**本番環境**: 環境変数として直接設定（Vercel/Netlifyなどのダッシュボードから）

### 4.2 ファイル構成

#### 新規作成ファイル

```
lib/
├── db/
│   ├── schema.ts              # 🆕 Drizzleスキーマ定義
│   └── client.ts              # 🆕 PostgreSQL接続クライアント
├── data-source/
│   └── postgres.ts            # 🆕 PostgresDataSource実装
scripts/
└── migrate-to-neon.ts         # 🆕 データ移行スクリプト
drizzle.config.ts              # 🆕 Drizzle設定
```

#### 既存ファイル修正箇所

```
lib/
├── data-source/
│   ├── base.ts                # ✏️ DataSource型に'postgres'追加
│   └── factory.ts             # ✏️ 'postgres'ケース追加
└── config.ts                  # ✏️ 型定義に'postgres'追加
```

### 4.3 実装手順

#### ステップ1: DB接続クライアント作成

**ファイル**: `lib/db/client.ts`

```typescript
import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool } from '@neondatabase/serverless';
import * as schema from './schema';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not defined');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });
```

#### ステップ2: Drizzle設定

**ファイル**: `drizzle.config.ts`

```typescript
import type { Config } from 'drizzle-kit';
import * as dotenv from 'dotenv';

dotenv.config();

export default {
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
```

#### ステップ3: PostgresDataSource実装

**ファイル**: `lib/data-source/postgres.ts`

```typescript
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { messages, lines, tags, tagGroups } from '@/lib/db/schema';
import type { Message, Line, Tag, TagGroup } from '@/lib/types';
import type { IDataSource, ChatData, MessageInput } from './base';

export class PostgresDataSource implements IDataSource {
  async loadChatData(): Promise<ChatData> {
    console.log('📊 [PostgresDataSource] Loading data from PostgreSQL...');
    const [messagesData, linesData, tagsData, tagGroupsData] = await Promise.all([
      db.select().from(messages),
      db.select().from(lines),
      db.select().from(tags),
      db.select().from(tagGroups),
    ]);

    // DB型からアプリケーション型に変換
    const messagesRecord: Record<string, Message> = {};
    messagesData.forEach((msg) => {
      messagesRecord[msg.id] = {
        id: msg.id,
        content: msg.content,
        timestamp: msg.timestamp,
        updatedAt: msg.updated_at ?? undefined,
        lineId: msg.line_id,
        tags: msg.tags ?? undefined,
        hasBookmark: msg.has_bookmark ?? undefined,
        author: msg.author ?? undefined,
        images: msg.images ?? undefined,
        type: msg.type as any,
        metadata: msg.metadata ?? undefined,
        deleted: msg.deleted ?? undefined,
        deletedAt: msg.deleted_at ?? undefined,
      };
    });

    const linesArray: Line[] = linesData.map((line) => ({
      id: line.id,
      name: line.name,
      parent_line_id: line.parent_line_id,
      tagIds: line.tag_ids ?? undefined,
      created_at: line.created_at.toISOString(),
      updated_at: line.updated_at.toISOString(),
    }));

    const tagsRecord: Record<string, Tag> = {};
    tagsData.forEach((tag) => {
      tagsRecord[tag.id] = {
        id: tag.id,
        name: tag.name,
        color: tag.color ?? undefined,
        groupId: tag.group_id ?? undefined,
      };
    });

    const tagGroupsRecord: Record<string, TagGroup> = {};
    tagGroupsData.forEach((tg) => {
      tagGroupsRecord[tg.id] = {
        id: tg.id,
        name: tg.name,
        color: tg.color,
        order: tg.order,
      };
    });

    return {
      messages: messagesRecord,
      lines: linesArray,
      tags: tagsRecord,
      tagGroups: tagGroupsRecord,
    };
  }

  async createMessage(message: MessageInput): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date();

    await db.insert(messages).values({
      id,
      content: message.content,
      timestamp: new Date(message.timestamp),
      updated_at: now, // アプリケーション側で明示的に設定
      line_id: message.lineId,
      tags: message.tags,
      has_bookmark: message.hasBookmark,
      author: message.author,
      images: message.images,
      type: message.type,
      metadata: message.metadata,
    });
    return id;
  }

  async updateMessage(id: string, updates: Partial<Omit<Message, 'timestamp'>> & { timestamp?: string | Date }): Promise<void> {
    const now = new Date();

    await db.update(messages).set({
      ...updates,
      updated_at: now, // 更新時に必ず現在時刻を設定
      timestamp: updates.timestamp ? new Date(updates.timestamp) : undefined,
    }).where(eq(messages.id, id));
  }

  async deleteMessage(id: string): Promise<void> {
    await db.delete(messages).where(eq(messages.id, id));
  }

  async createLine(line: Omit<Line, 'id'>): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date();

    await db.insert(lines).values({
      id,
      name: line.name,
      parent_line_id: line.parent_line_id,
      tag_ids: line.tagIds,
      created_at: now, // アプリケーション側で明示的に設定
      updated_at: now,
    });
    return id;
  }

  async updateLine(id: string, updates: Partial<Line>): Promise<void> {
    const now = new Date();

    await db.update(lines).set({
      ...updates,
      updated_at: now, // 更新時に必ず現在時刻を設定
    }).where(eq(lines.id, id));
  }

  // 他のIDataSourceメソッドも同様に実装...
}
```

**実装完了確認**:

```bash
# ビルド・lint確認（警告・エラーなしで通ること）
npm run build
```

#### ステップ4: Factory拡張

**ファイル**: `lib/data-source/base.ts`

```typescript
// DataSource型に'postgres'を追加
export type DataSource = 'firestore' | 'sample' | 'cache' | 'postgres';
```

**ファイル**: `lib/data-source/factory.ts`

```typescript
import { PostgresDataSource } from './postgres';

export class DataSourceFactory {
  static create(type: DataSource, conversationId: string): IDataSource {
    switch (type) {
      case 'firestore':
        return new FirestoreDataSource(conversationId);
      case 'sample':
        return new SampleDataSource();
      case 'postgres':
        return new PostgresDataSource(); // conversationId不要
      default:
        throw new Error(`Unknown data source type: ${type}`);
    }
  }
}
```

**ファイル**: `lib/config.ts`

```typescript
export const config = {
  conversationId: process.env.NEXT_PUBLIC_CONVERSATION_ID || "",
  defaultDataSource: (process.env.NEXT_PUBLIC_DEFAULT_DATA_SOURCE as 'firestore' | 'sample' | 'cache' | 'postgres') || 'firestore',
} as const;
```

#### ステップ5: データ移行スクリプト

**ファイル**: `scripts/migrate-to-neon.ts`

```typescript
#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { db } from '../lib/db/client';
import { messages, lines, tags, tagGroups } from '../lib/db/schema';

const BACKUP_DIR = path.join(__dirname, '../output/backups/2025-11-09T08-24-43/converted');

function convertFirestoreTimestamp(fsTimestamp: { _seconds: number; _nanoseconds: number }): Date {
  return new Date(fsTimestamp._seconds * 1000 + fsTimestamp._nanoseconds / 1000000);
}

async function migrate() {
  console.log('🚀 PostgreSQL データ移行開始\n');

  // 1. JSONファイル読み込み
  console.log('📥 バックアップデータ読み込み中...');
  const messagesData = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, 'messages.json'), 'utf8'));
  const linesData = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, 'lines.json'), 'utf8'));
  const tagsData = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, '../tags.json'), 'utf8'));
  const tagGroupsData = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, '../tagGroups.json'), 'utf8'));

  // 2. TagGroups 挿入（外部キー制約のため先に挿入）
  console.log('📝 TagGroups を挿入中...');
  for (const [id, tg] of Object.entries(tagGroupsData)) {
    await db.insert(tagGroups).values({
      id,
      name: tg.name,
      color: tg.color,
      order: tg.order,
    });
  }

  // 3. Tags 挿入
  console.log('📝 Tags を挿入中...');
  for (const [id, tag] of Object.entries(tagsData)) {
    await db.insert(tags).values({
      id,
      name: tag.name,
      color: tag.color,
      group_id: tag.groupId,
    });
  }

  // 4. Lines 挿入
  console.log('📝 Lines を挿入中...');
  for (const [id, line] of Object.entries(linesData)) {
    await db.insert(lines).values({
      id,
      name: line.name,
      parent_line_id: line.parent_line_id,
      tag_ids: line.tagIds,
      created_at: line.createdAt ? convertFirestoreTimestamp(line.createdAt) : new Date(line.created_at),
      updated_at: line.updatedAt ? convertFirestoreTimestamp(line.updatedAt) : new Date(line.updated_at),
    });
  }

  // 5. Messages 挿入
  console.log('📝 Messages を挿入中...');
  for (const [id, msg] of Object.entries(messagesData)) {
    await db.insert(messages).values({
      id,
      content: msg.content,
      timestamp: msg.createdAt ? convertFirestoreTimestamp(msg.createdAt) : new Date(msg.timestamp),
      updated_at: msg.updatedAt ? convertFirestoreTimestamp(msg.updatedAt) : undefined,
      line_id: msg.lineId,
      tags: msg.tags,
      has_bookmark: msg.hasBookmark,
      author: msg.author,
      images: msg.images,
      type: msg.type,
      metadata: msg.metadata,
      deleted: msg.deleted,
      deleted_at: msg.deletedAt ? new Date(msg.deletedAt) : undefined,
    });
  }

  console.log('\n✅ データ移行完了！');
}

migrate().catch(console.error);
```

## データ移行実行

**前提**: セクション4の実装完了後

**バックアップデータ**: `output/backups/2025-11-09T08-24-43/converted/`

**手順**:

```bash
# 1. スキーマ作成
npx drizzle-kit push

# 2. データ移行
npx tsx scripts/migrate-to-neon.ts

# 3. 確認
neonctl sql "SELECT COUNT(*) FROM messages;" --branch main
neonctl sql "SELECT COUNT(*) FROM lines;" --branch main
```

**整合性検証**:

```bash
# 外部キー確認（結果が0であること）
neonctl sql "SELECT COUNT(*) FROM messages m LEFT JOIN lines l ON m.line_id = l.id WHERE l.id IS NULL;" --branch main
neonctl sql "SELECT COUNT(*) FROM lines WHERE parent_line_id IS NOT NULL AND parent_line_id NOT IN (SELECT id FROM lines);" --branch main
```

## 動作確認

**1. データソース切り替え**

`.env.local`:
```bash
NEXT_PUBLIC_DEFAULT_DATA_SOURCE=postgres
```

**2. アプリ起動**

```bash
npm run dev
```

**3. PostgreSQL接続の確認（厳密）**

以下の**すべて**を確認し、PostgreSQLが実際に使われていることを保証する：

**① 事前準備: キャッシュとフォールバックを無効化**
```typescript
// IndexedDB キャッシュをクリア
// ブラウザ DevTools > Application > IndexedDB > すべて削除

// または、ブラウザコンソールで実行:
indexedDB.deleteDatabase('chat-data-cache');
indexedDB.deleteDatabase('last-fetch-timestamps');
```

**② サーバー完全再起動**
```bash
# Next.jsサーバーを停止（Ctrl+C）
# .env.local 確認
cat .env.local | grep NEXT_PUBLIC_DEFAULT_DATA_SOURCE
# → postgres であること

# サーバー再起動
npm run dev
```

**③ ブラウザで厳密確認（新しいシークレットウィンドウ）**
```
1. シークレットウィンドウで開く（キャッシュなし）
2. DevTools > Console で以下を確認:
   - 🚀 DataSource initialized: postgres
   - 📊 [PostgresDataSource] Loading data from PostgreSQL...
   - ❌ [ChatRepository] Restored cached data from IndexedDB が出ないこと
   - ❌ fallback source が使われていないこと
```

**④ ネットワークタブで確認**
```
- Chrome DevTools > Network タブ
- Firestoreへのリクエスト（firestore.googleapis.com）がゼロであること
- WebSocket接続もFirestoreに向いていないこと
```

**⑤ 書き込み操作の確認（最重要）**
```bash
# 1. 新規メッセージを作成（アプリ上で）
# 2. PostgreSQLに直接確認
neonctl sql "SELECT id, content, timestamp FROM messages ORDER BY timestamp DESC LIMIT 1;" --branch main
# → 今作成したメッセージが表示されること

# 3. メッセージIDをメモして、再読み込み後も表示されることを確認
```

**⑥ データベース側のアクティビティ確認**
```bash
# リアルタイムでクエリを監視
neonctl sql "SELECT query, state FROM pg_stat_activity WHERE datname='neondb' AND state='active';" --branch main
# → SELECT/INSERT クエリが表示されること
```

**⚠️ 重要**:
- キャッシュクリア前のテストは無効
- fallbackUsed: true が出ている場合、PostgreSQL接続失敗
- 読み込みだけでなく**書き込みテスト必須**

**4. 機能確認** → セクション8（チェックリスト）参照

## 使用方法

**✅ 正しい使い方（リポジトリ経由）**:
```typescript
import { chatRepository } from '@/lib/repositories/chat-repository';
const result = await chatRepository.loadChatData({ source: 'postgres' });
```

**❌ 直接アクセス禁止**: `PostgresDataSource` を直接インスタンス化しない
→ 理由: キャッシュ管理・エラーハンドリング・フォールバックが機能しない

## チェックリスト

### 実装フェーズ

- [ ] パッケージインストール（drizzle-orm, @neondatabase/serverless, drizzle-kit, tsx）
- [ ] `lib/db/schema.ts` 作成（Drizzleスキーマ定義）
- [ ] `lib/db/client.ts` 作成（DB接続クライアント）
- [ ] `drizzle.config.ts` 作成（Drizzle設定）
- [ ] `lib/data-source/postgres.ts` 作成（PostgresDataSource実装）
- [ ] `lib/data-source/base.ts` 修正（'postgres'型追加）
- [ ] `lib/data-source/factory.ts` 修正（'postgres'ケース追加）
- [ ] `lib/config.ts` 修正（'postgres'型追加）
- [ ] `scripts/migrate-to-neon.ts` 作成（データ移行スクリプト）
- [ ] **ビルド確認（`npm run build` が警告・エラーなしで通ること）**

### Neonセットアップフェーズ（認証済み前提）

- [ ] プロジェクト作成（`neonctl projects create --name chat-line`）
- [ ] 接続文字列を `.env.local` に追記（`echo "DATABASE_URL=$(neonctl connection-string main)" >> .env.local`）
- [ ] （オプション）開発ブランチ作成（`neonctl branches create --name dev`）

### 移行フェーズ

- [ ] スキーマ作成（`npx drizzle-kit push`）
- [ ] テーブル作成確認（`neonctl sql "\dt"`）
- [ ] データ移行実行（`npx tsx scripts/migrate-to-neon.ts`）
- [ ] レコード数確認（`neonctl sql "SELECT COUNT(*) FROM ..."`）
- [ ] 外部キー整合性検証
- [ ] `.env.local` に NEXT_PUBLIC_DEFAULT_DATA_SOURCE=postgres 設定

### 動作確認フェーズ

- [ ] データソース切り替え（`.env.local` で `NEXT_PUBLIC_DEFAULT_DATA_SOURCE=postgres`）
- [ ] **ビルド確認（`npm run build` が警告・エラーなしで通ること）**
- [ ] アプリケーション起動（`npm run dev`）
- [ ] **PostgreSQL接続確認（以下すべて必須）**
  - [ ] **事前準備**: IndexedDBキャッシュをすべて削除（DevTools > Application > IndexedDB）
  - [ ] **事前準備**: サーバー完全再起動（`.env.local`確認後に `npm run dev`）
  - [ ] **シークレットウィンドウ**で開く（キャッシュなしで確認）
  - [ ] ブラウザコンソールに `🚀 DataSource initialized: postgres` が表示される
  - [ ] ブラウザコンソールに `📊 [PostgresDataSource] Loading data from PostgreSQL...` が表示される
  - [ ] ブラウザコンソールに `Restored cached data` や `fallback source` が**出ない**こと
  - [ ] Network タブで Firestore へのリクエストがゼロ
  - [ ] **書き込みテスト**: 新規メッセージ作成 → Neonで直接確認（`neonctl sql`）
  - [ ] Neon のクエリログに INSERT/SELECT クエリが記録されている
- [ ] データ読み込み確認（メッセージ一覧表示）
- [ ] メッセージ作成確認
- [ ] メッセージ編集確認
- [ ] メッセージ削除確認
- [ ] ライン作成確認
- [ ] タグ操作確認
- [ ] Firestoreへのロールバック確認（`NEXT_PUBLIC_DEFAULT_DATA_SOURCE=firestore` に戻す）

## トラブルシューティング

| 問題 | 原因 | 解決策 |
|------|------|--------|
| `connect ECONNREFUSED` | DATABASE_URL未設定 | `.env.local` の DATABASE_URL を確認 |
| `foreign key constraint` | line_id が存在しない | 挿入順序確認（移行スクリプトで対応済み） |
| `invalid input syntax for type timestamp` | タイムスタンプ形式不正 | `convertFirestoreTimestamp()` 使用 |
| Firestoreが呼ばれている | データソース切り替え失敗 | ①`.env.local`確認 ②サーバー再起動 ③ブラウザキャッシュクリア |
| PostgreSQLログが出ない | PostgresDataSource未使用 | dataSourceManager.getCurrentSource() が 'postgres' であることを確認 |
| `Restored cached data` が表示 | IndexedDBキャッシュから読込 | IndexedDBをすべて削除してから再テスト |
| `fallback source` が表示 | PostgreSQL接続失敗 | DATABASE_URL確認、Neon接続確認、エラーログ確認 |
| データ表示されるが書き込み失敗 | 読み込みはキャッシュ、書き込み未実装 | 新規メッセージ作成 → Neonで直接確認必須 |

## 参考

- [Drizzle ORM](https://orm.drizzle.team/)
- [Neon Docs](https://neon.tech/docs)
- プロジェクト内: `doc/repository-pattern-guide.md`, `doc/data-structure-migration.md`

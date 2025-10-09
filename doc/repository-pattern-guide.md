# リポジトリパターン開発ガイド

## 概要

このプロジェクトでは、データアクセスにリポジトリパターンを採用しています。
**アプリケーション層からdata-source層への直接アクセスは禁止**され、必ずrepository層を経由する必要があります。

## 正しい使い方 ✅

### データの読み込み

```typescript
import { chatRepository } from '@/lib/repositories/chat-repository';
import { dataSourceManager } from '@/lib/data-source';

// ✅ 基本的な読み込み（現在のデータソースから）
const result = await chatRepository.loadChatData({
  source: dataSourceManager.getCurrentSource()
});

console.log(result.data);        // ChatData
console.log(result.source);      // 'firestore' | 'sample' | 'cache'
console.log(result.fromCache);   // boolean
```

### オフライン対応

```typescript
// ✅ オフライン時はキャッシュ優先
const isOffline = !navigator.onLine;

const result = await chatRepository.loadChatData({
  source: 'firestore',
  preferCache: isOffline,        // オフライン時はキャッシュ優先
  allowCacheFallback: true       // エラー時もキャッシュにフォールバック
});
```

### キャッシュの操作

```typescript
// ✅ キャッシュのみを読み込む
const cached = await chatRepository.loadCacheOnly();

if (cached) {
  console.log('キャッシュ取得成功:', cached.cacheTimestamp);
} else {
  console.log('キャッシュなし');
}

// ✅ キャッシュをクリア
await chatRepository.clearCache();

// ✅ キャッシュの状態確認
const hasCache = chatRepository.hasCache();
const timestamp = chatRepository.getCacheTimestamp();
```

### エラーハンドリング

```typescript
// ✅ フォールバック付きでロバストに取得
try {
  const result = await chatRepository.loadChatData({
    source: 'firestore',
    fallbackSources: ['cache', 'sample'], // Firestoreが失敗したらcache→sampleの順で試す
    allowCacheFallback: true
  });

  console.log(`データ取得成功: ${result.source}から`);
} catch (error) {
  console.error('全てのデータソースが失敗しました', error);
}
```

## 間違った使い方 ❌

### 直接data-sourceにアクセス（禁止）

```typescript
// ❌ ESLintエラー: cache層への直接import
import { localStorageCache } from '@/lib/data-source/cache';

const cached = await localStorageCache.load();  // 禁止！

// ❌ ESLintエラー: Firestore層への直接import
import { FirestoreDataSource } from '@/lib/data-source/firestore';

const ds = new FirestoreDataSource('conv-1');
const data = await ds.loadChatData();  // 禁止！
```

### dataSourceManagerの直接呼び出し（非推奨）

```typescript
import { dataSourceManager } from '@/lib/data-source';

// ⚠️ 非推奨: キャッシュ管理やフォールバックがない
const data = await dataSourceManager.loadChatData();
```

**理由**: `dataSourceManager.loadChatData()`は以下の機能がありません:
- キャッシュへの自動保存
- エラー時のキャッシュフォールバック
- 複数データソースのフォールバック
- 統一的なエラーハンドリング

→ 必ず `chatRepository.loadChatData()` を使用してください

## アーキテクチャ

```
┌─────────────────────────────────────┐
│   Application Layer                 │
│   components/, hooks/, app/         │
│                                     │
│   ✅ chatRepository.loadChatData()  │
│   ❌ dataSourceManager.loadChatData()│
│   ❌ localStorageCache.load()       │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│   Repository Layer                  │
│   lib/repositories/                 │
│   - ChatRepository                  │
│   - キャッシュ管理統合               │
│   - フォールバック処理               │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│   Data Source Layer                 │
│   lib/data-source/                  │
│   - FirestoreDataSource             │
│   - SampleDataSource                │
│   - CacheDataSource                 │
└─────────────────────────────────────┘
```

## 静的解析による強制

### ESLintルール

プロジェクトでは`no-restricted-imports`ルールにより、以下のimportが**エラー**になります:

```typescript
// ❌ コンパイルエラー
import { localStorageCache } from '@/lib/data-source/cache';
import { FirestoreDataSource } from '@/lib/data-source/firestore';
```

### 例外

以下のディレクトリでは、data-source層への直接アクセスが許可されます:
- `lib/repositories/` - repository層の実装自体
- `lib/data-source/` - data-source層の内部実装

### 違反の確認方法

```bash
# ESLintチェック
npx eslint .

# Next.jsビルド（ESLint含む）
npx next build
```

## よくある質問

### Q1. オフライン対応はどうすればいい？

A1. `preferCache`オプションを使用してください:

```typescript
const result = await chatRepository.loadChatData({
  source: 'firestore',
  preferCache: !navigator.onLine
});
```

### Q2. キャッシュを無効化したい

A2. `preferCache: false` にして、エラー時もキャッシュを使わない:

```typescript
const result = await chatRepository.loadChatData({
  source: 'firestore',
  preferCache: false,
  allowCacheFallback: false  // エラー時もキャッシュを使わない
});
```

### Q3. 既存のコードでdataSourceManagerを使っている

A3. 以下のパターンで書き換えてください:

**Before:**
```typescript
const data = await dataSourceManager.loadChatData();
```

**After:**
```typescript
const { data } = await chatRepository.loadChatData({
  source: dataSourceManager.getCurrentSource()
});
```

### Q4. repository層を拡張したい

A4. `ChatRepository`クラスに新しいメソッドを追加してください:

```typescript
// lib/repositories/chat-repository.ts
export class ChatRepository {
  // 既存のメソッド...

  // 新しいメソッド
  async loadMessagesOnly(): Promise<Record<string, Message>> {
    const { data } = await this.loadChatData();
    return data.messages;
  }
}
```

## トラブルシューティング

### ESLintエラーが出る

```
Error: '@/lib/data-source/cache' import is restricted from being used.
Direct import from cache layer is not allowed. Use chatRepository instead.
```

**解決方法**: `chatRepository`を使用してください:

```typescript
// ❌ Before
import { localStorageCache } from '@/lib/data-source/cache';
const cached = await localStorageCache.load();

// ✅ After
import { chatRepository } from '@/lib/repositories/chat-repository';
const cached = await chatRepository.loadCacheOnly();
```

### データソースを切り替えたい

開発中に異なるデータソース間を切り替える場合:

```typescript
// Firestoreから取得
const firestoreData = await chatRepository.loadChatData({
  source: 'firestore'
});

// サンプルデータから取得
const sampleData = await chatRepository.loadChatData({
  source: 'sample'
});

// キャッシュから取得
const cacheData = await chatRepository.loadCacheOnly();
```

## 参考資料

- [アーキテクチャ強制の詳細](./architecture-enforcement.md)
- [Repository Pattern (Martin Fowler)](https://martinfowler.com/eaaCatalog/repository.html)

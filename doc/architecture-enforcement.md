# リポジトリパターンの静的解析による強制

## 概要

このプロジェクトでは、データアクセスにリポジトリパターンを採用しています。
アプリケーション層からdata-source層やcache層への直接アクセスを防ぐため、以下の静的解析手法を実装しています。

## アーキテクチャ図

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
│   - Firestore, Sample, Cache        │
│   ❌ アプリ層からの直接アクセス禁止     │
└─────────────────────────────────────┘
```

## 静的解析手法の比較

### 1. **ESLint `no-restricted-imports` ルール（現在採用）**

**メリット:**
- 追加パッケージ不要
- 設定がシンプル
- import文を制限できる

**デメリット:**
- メソッド呼び出しの検出は不可
- エラーメッセージのカスタマイズが限定的

**設定例:**
\`\`\`json
{
  "rules": {
    "no-restricted-imports": ["error", {
      "patterns": [{
        "group": ["**/lib/data-source/cache"],
        "message": "Use chatRepository instead."
      }]
    }]
  }
}
\`\`\`

**検出できる違反:**
- ❌ `import { localStorageCache } from '@/lib/data-source/cache'`
- ❌ `import * from '@/lib/data-source/firestore'`

**検出できない違反:**
- ❌ `dataSourceManager.loadChatData()` の直接呼び出し
- ❌ `localStorageCache.load()` の直接呼び出し

---

### 2. **ESLint カスタムルール（高度な検出）**

**メリット:**
- メソッド呼び出しも検出可能
- 細かい制御が可能
- カスタムエラーメッセージ

**デメリット:**
- 実装コストが高い
- メンテナンスが必要

**実装場所:**
- `eslint-rules/no-direct-data-source.js`（作成済み）
- `eslint-rules/index.js`（プラグイン登録）

**検出できる違反:**
- ❌ `import { localStorageCache } from '@/lib/data-source/cache'`
- ❌ `dataSourceManager.loadChatData()`
- ❌ `localStorageCache.load()`
- ❌ `localStorageCache.save()`

**使用方法:**

1. `.eslintrc.json` を修正:
\`\`\`json
{
  "plugins": ["local-rules"],
  "rules": {
    "local-rules/no-direct-data-source": "error"
  }
}
\`\`\`

2. eslint-plugin-local-rules をインストール（済み）:
\`\`\`bash
npm install --save-dev eslint-plugin-local-rules
\`\`\`

---

### 3. **TypeScript Import Restrictions (tsconfig paths)**

**メリット:**
- 型レベルでimportを制限
- ビルド時にエラー検出

**デメリット:**
- importのみ、呼び出しは検出不可
- 設定が複雑

**設定例:**
\`\`\`json
// tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@/lib/repositories/*": ["lib/repositories/*"],
      "@/lib/data-source": ["lib/data-source/index.ts"],
      "@/lib/data-source/*": null  // 直接importを禁止
    }
  }
}
\`\`\`

---

### 4. **Architecture Decision Records (ADR) + Code Review**

**メリット:**
- 柔軟性が高い
- チームでの合意形成

**デメリット:**
- 自動化されていない
- 人的ミスが発生しうる

---

## 推奨アプローチ

### 段階的な導入

#### Phase 1: 基本的な制限（現在）
- `no-restricted-imports` でimportを制限
- シンプルで低コスト

#### Phase 2: より厳格な制限（必要に応じて）
- カスタムESLintルールを有効化
- メソッド呼び出しレベルで検出

#### Phase 3: 包括的な強制
- TypeScript pathsで型レベル制限
- ADRでアーキテクチャを文書化

---

## 違反の検出方法

### コマンドライン
\`\`\`bash
# ESLintチェック
npx eslint . --ext .ts,.tsx

# Next.jsビルド（ESLint含む）
npx next build
\`\`\`

### エディタ統合
- VSCode: ESLint拡張機能が自動検出
- 保存時に警告・エラー表示

---

## テストケース

### 正しいパターン ✅
\`\`\`typescript
// ✅ リポジトリ経由のアクセス
import { chatRepository } from '@/lib/repositories/chat-repository';

const data = await chatRepository.loadChatData({
  source: 'firestore'
});
\`\`\`

### 違反パターン ❌
\`\`\`typescript
// ❌ data-source層への直接import（Phase 1で検出）
import { localStorageCache } from '@/lib/data-source/cache';

// ❌ dataSourceManagerの直接呼び出し（Phase 2で検出）
const data = await dataSourceManager.loadChatData();

// ❌ cacheの直接操作（Phase 2で検出）
await localStorageCache.save(data);
\`\`\`

---

## 例外の扱い

### 許可される場所
以下のディレクトリでは、data-source層への直接アクセスが許可されます:

- `lib/data-source/` - data-source層の実装自体
- `lib/repositories/` - repository層がdata-sourceを使用

### 例外を追加する場合
\`\`\`json
{
  "overrides": [
    {
      "files": ["lib/specific-file.ts"],
      "rules": {
        "no-restricted-imports": "off"
      }
    }
  ]
}
\`\`\`

---

## まとめ

| 手法 | 導入コスト | 検出力 | メンテナンス | 推奨度 |
|------|-----------|--------|-------------|--------|
| no-restricted-imports | 低 | 中 | 低 | ⭐⭐⭐⭐⭐ |
| カスタムESLintルール | 高 | 高 | 中 | ⭐⭐⭐⭐ |
| TypeScript paths | 中 | 低 | 中 | ⭐⭐⭐ |
| ADR + Code Review | 低 | 低 | 低 | ⭐⭐ |

**現状の推奨**: `no-restricted-imports` から始めて、必要に応じてカスタムルールを追加

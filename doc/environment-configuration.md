# 環境設定ガイド

## 概要

このドキュメントでは、開発環境と本番環境で異なる設定を管理する方法について説明します。

## Conversation ID の環境別設定

### 設定方法

アプリケーションでは `NEXT_PUBLIC_CONVERSATION_ID` 環境変数を使用して、Firestoreの会話データを切り替えています。

```typescript
// lib/data-source.ts
private conversationId = process.env.NEXT_PUBLIC_CONVERSATION_ID || 'sample-conversation-1';
```

### 環境別設定ファイル

#### 開発環境 (`.env.local`)
```bash
# 開発環境用設定
NEXT_PUBLIC_CONVERSATION_ID=sample-conversation-1
```

#### 本番環境 (`.env.production`)
```bash
# 本番環境用設定
NEXT_PUBLIC_CONVERSATION_ID=chat-minimal-conversation-1
```

### データファイルの対応

各環境で使用するサンプルデータファイル：

- 開発環境: `public/data/chat-sample.json` (複雑なサンプルデータ)
- 本番環境: `public/data/chat-minimal.json` (シンプルなサンプルデータ)

## デプロイ手順

### 1. Firestoreデータの準備

本番環境にデプロイする前に、対応するデータをFirestoreに登録してください。

```bash
# 開発用データの登録
node scripts/import-to-firestore.js chat-sample.json

# 本番用データの登録
node scripts/import-to-firestore.js chat-minimal.json
```

### 2. 開発環境での実行

```bash
# 開発サーバー起動
npm run dev

# 使用される Conversation ID: sample-conversation-1
```

### 3. 本番環境へのデプロイ

```bash
# 1. 本番用ビルド（環境変数を明示的に設定）
npm run build:production

# 2. Firebase Hostingにデプロイ
firebase deploy --only hosting

# 使用される Conversation ID: chat-minimal-conversation-1
```

## package.json スクリプト

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "build:production": "NEXT_PUBLIC_CONVERSATION_ID=chat-minimal-conversation-1 next build",
    "start": "next start",
    "lint": "next lint"
  }
}
```

## 重要な注意事項

### 静的サイト生成での環境変数

Next.jsの `output: 'export'` (静的サイト生成) を使用しているため：

- 環境変数はビルド時に埋め込まれます
- Firebase Hostingの動的な環境変数設定は効きません
- 本番用ビルド時に明示的に環境変数を設定する必要があります

### Conversation ID の変更

新しいConversation IDを追加する場合：

1. 対応するJSONデータファイルを作成
2. Firestoreにデータを登録
3. 環境変数を適切に設定
4. 再ビルド・デプロイ

## トラブルシューティング

### 本番環境で間違ったConversation IDが使用される

**症状**: 本番環境でも `sample-conversation-1` が使用されている

**原因**: ビルド時に環境変数が正しく設定されていない

**解決方法**:
```bash
# 正しい本番用ビルドコマンドを使用
npm run build:production

# または明示的に環境変数を設定
NEXT_PUBLIC_CONVERSATION_ID=chat-minimal-conversation-1 npx next build
```

### データが見つからないエラー

**症状**: `Conversation not found in Firestore` エラー

**原因**: 指定されたConversation IDのデータがFirestoreに存在しない

**解決方法**:
```bash
# 対応するデータをFirestoreに登録
node scripts/import-to-firestore.js [対応するJSONファイル名]
```

## 関連ファイル

- `lib/data-source.ts` - Conversation ID の設定箇所
- `.env.local` - 開発環境の環境変数
- `.env.production` - 本番環境の環境変数
- `scripts/import-to-firestore.js` - Firestoreデータインポートスクリプト
- `public/data/` - サンプルデータファイル
- `package.json` - ビルドスクリプトの定義
# プロジェクト構造 - Chat Line

Firebase Firestore 統合後のプロジェクト構造とファイル説明です。

## 📁 ディレクトリ構造

```
chat-line/
├── doc/                           # 📚 ドキュメント
│   ├── firebase-setup-guide.md   # Firebase セットアップ手順
│   ├── firestore-test-component.md # テストコンポーネント仕様
│   └── project-structure.md      # このファイル
├── app/                           # 🎯 Next.js App Router
│   ├── page.tsx                   # ホームページ（Firestore テスト含む）
│   ├── chat/[line_name]/page.tsx  # 動的チャットページ
│   ├── branch_list/page.tsx       # ブランチ一覧ページ
│   └── management/page.tsx        # 管理ページ
├── components/                    # 🧩 React コンポーネント
│   ├── branching-chat-ui.tsx      # メインチャットUI
│   ├── firestore-test.tsx         # Firestore 接続テスト
│   ├── footer-navigation.tsx      # フッターナビ
│   └── ui/                        # 基本UIコンポーネント
├── lib/                           # 🔧 ライブラリ・ユーティリティ
│   ├── firebase.ts               # Firebase SDK設定
│   └── utils.ts                   # 汎用ユーティリティ
├── public/                        # 📁 静的ファイル
│   └── data/
│       └── chat-sample.json       # サンプルチャットデータ
├── scripts/                       # 🤖 スクリプト
│   └── import-to-firestore.js     # Firestore データインポート
├── firebase.json                  # 🔥 Firebase 設定
├── firestore.rules               # 🛡️ Firestore セキュリティルール
├── firestore.indexes.json        # 📊 Firestore インデックス
├── .firebaserc                   # 🎯 Firebase プロジェクト設定
├── firebase-service-account.json # 🔑 サービスアカウントキー（git無視）
├── .env.local                    # 🔐 環境変数（git無視）
├── package.json                  # 📦 npm 設定
└── CLAUDE.md                     # 📝 プロジェクト固有設定
```

## 📂 主要ファイル詳細

### 🔥 Firebase 関連ファイル

#### `firebase.json`
```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "hosting": {
    "public": "out",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{"source": "**", "destination": "/index.html"}]
  }
}
```

#### `.firebaserc`
```json
{
  "projects": {
    "default": "your-project-id"
  }
}
```

#### `firestore.rules`
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /conversations/{conversationId} {
      allow read, write: if true; // 開発中は全許可

      match /messages/{messageId} { allow read, write: if true; }
      match /lines/{lineId} { allow read, write: if true; }
      match /branchPoints/{branchPointId} { allow read, write: if true; }
      match /tags/{tagId} { allow read, write: if true; }
      match /tagGroups/{tagGroupId} { allow read, write: if true; }
    }
  }
}
```

### ⚙️ 設定ファイル

#### `.env.local`
```bash
# Firebase 設定（firebase apps:sdkconfig web の出力値を使用）
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key_here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project-id.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id_here

# Firebase Admin SDK 用
FIREBASE_SERVICE_ACCOUNT_KEY=./firebase-service-account.json
```

#### `lib/firebase.ts`
```typescript
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const db = getFirestore(app);
export default app;
```

### 🤖 スクリプト

#### `scripts/import-to-firestore.js`
- **目的**: `public/data/chat-sample.json` を Firestore にインポート
- **実行**: `node scripts/import-to-firestore.js`
- **データ構造**: conversations/{conversationId}/ 配下にサブコレクション作成

### 🧩 コンポーネント

#### `components/firestore-test.tsx`
- **目的**: Firestore 接続テスト・データ取得確認
- **表示**: 接続状況・取得メッセージ一覧（最大5件）
- **状態**: ロード中・成功・エラー

#### `components/branching-chat-ui.tsx`
- **目的**: メインチャットUI（分岐型会話表示）
- **機能**: ライン切り替え・メッセージ表示・ブランチ操作

## 🗄️ Firestore データ構造

### コレクション階層
```
conversations/
  sample-conversation-1/                    # 会話ドキュメント
    messages/                              # メッセージサブコレクション
      msg1: { id, content, timestamp, lineId, ... }
      msg2: { id, content, timestamp, lineId, ... }
      ...
    lines/                                 # ラインサブコレクション
      main: { id, name, messageIds, startMessageId, ... }
      design: { id, name, messageIds, branchFromMessageId, ... }
      ...
    branchPoints/                          # 分岐点サブコレクション
      msg2: { messageId, lines: [...] }
      msg3: { messageId, lines: [...] }
      ...
    tags/                                  # タグサブコレクション
      tag_kickoff: { id, name, color, groupId }
      tag_requirements: { id, name, color, groupId }
      ...
    tagGroups/                             # タググループサブコレクション
      development: { id, name, color, order }
      design_ux: { id, name, color, order }
      ...
```

### ドキュメント例
```javascript
// conversations/sample-conversation-1/messages/msg1
{
  id: "msg1",
  content: "プロジェクトキックオフ！\n新しいチャットアプリの仕様について話し合いましょう。",
  timestamp: "2024-01-15T09:00:00.000Z",
  lineId: "main",
  nextInLine: "msg2",
  createdAt: Timestamp,
  updatedAt: Timestamp
}

// conversations/sample-conversation-1/lines/main
{
  id: "main",
  name: "メインの流れ",
  parentLineId: null,
  messageIds: ["msg1", "msg2", "msg3", "msg6", "msg11", "msg19"],
  startMessageId: "msg1",
  endMessageId: "msg19",
  tagIds: ["tag_kickoff", "tag_requirements", "tag_tech_stack"],
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

## 🛡️ セキュリティ・gitignore

### `.gitignore` 追加項目
```gitignore
# Firebase 機密情報
firebase-service-account.json
.env.local

# Next.js
.next/
out/

# Firebase
.firebase/
firebase-debug.log
```

### 機密ファイル管理
- `firebase-service-account.json`: Firebase Admin SDK認証用（**絶対にコミットしない**）
- `.env.local`: 環境変数（**絶対にコミットしない**）
- Firebase プロジェクトIDなどの設定情報は公開OK

## 🚀 開発・デプロイコマンド

### 開発
```bash
# 開発サーバー起動
npx next dev

# Firestore データインポート
node scripts/import-to-firestore.js

# Firebase エミュレータ（オプション）
firebase emulators:start
```

### ビルド・デプロイ
```bash
# Next.js ビルド
npx next build

# Firebase セキュリティルール適用
firebase deploy --only firestore:rules

# Firebase Hosting デプロイ
firebase deploy --only hosting

# 全体デプロイ
firebase deploy
```

## 📊 パフォーマンス考慮事項

### データ取得最適化
- **ページネーション**: 大量メッセージ用
- **リアルタイムリスナー**: メッセージ更新監視
- **インデックス**: 複合クエリ用

### ビルドサイズ
- Firebase SDK: 約50KB追加
- Next.js最適化: Tree shaking有効

### セキュリティルール最適化
- 開発: テストモード（全許可）
- 本番: 認証ベースの詳細ルール実装必要

---

この構造により、Firebase Firestore を使用した完全な永続化システムが実現されています。
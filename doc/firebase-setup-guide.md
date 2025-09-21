# Firebase Firestore セットアップガイド

Chat Line プロジェクトで Firebase Firestore を使用してデータを永続化するための完全セットアップ手順です。

## 📋 前提条件

- Node.js がインストール済み
- Next.js プロジェクトが作成済み
- Google アカウントが利用可能

## 🚀 1. Firebase CLI のインストール・ログイン

```bash
# Firebase CLI をグローバルインストール
npm install -g firebase-tools

# Firebase にログイン
firebase login
```

## 🔧 2. Firebase プロジェクト作成・初期化

### 2.1 プロジェクト初期化
```bash
# プロジェクトルートで実行
firebase init
```

### 2.2 初期化時の選択項目
```
? Which Firebase features do you want to set up for this directory?
✓ Firestore: Configure security rules and indexes files for Firestore
✓ Hosting: Configure files for Firebase Hosting and (optionally) set up

? Please select an option:
> Create a new project

? Please specify a unique project id: your-unique-project-id
? What would you like to call your project? your-project-name
```

### 2.3 Firestore データベース作成
エラーが出る場合、Firebase Console で手動作成：

1. ブラウザで Firebase Console を開く
2. 「Firestore Database」→「データベースの作成」
3. **セキュリティルール**: 「テストモードで開始」
4. **ロケーション**: `asia-northeast1 (Tokyo)`

### 2.4 初期化の続行
```bash
# データベース作成後、再度初期化
firebase init

? Please select an option:
> Use an existing project
> your-project-name

# Firestore 設定
? What file should be used for Firestore Rules? firestore.rules
? What file should be used for Firestore indexes? firestore.indexes.json

# Hosting 設定
? What do you want to use as your public directory? out
? Configure as a single-page app (rewrite all urls to /index.html)? No
? Set up automatic builds and deploys with GitHub? No
```

## 📦 3. Firebase SDK インストール

```bash
# Firebase SDK をインストール（依存関係競合回避）
npm install firebase firebase-admin --legacy-peer-deps
```

## 🌐 4. Firebase Web アプリ作成・設定取得

```bash
# Web アプリケーションを作成
firebase apps:create web "Chat Line App"

# 設定情報を取得
firebase apps:sdkconfig web
```

出力例：
```json
{
  "projectId": "your-project-id",
  "appId": "1:123456789:web:abcdefghijklmnop",
  "storageBucket": "your-project-id.firebasestorage.app",
  "apiKey": "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "authDomain": "your-project-id.firebaseapp.com",
  "messagingSenderId": "123456789"
}
```

## ⚙️ 5. 環境変数設定

`.env.local` ファイルを作成・更新：

```bash
# Firebase 設定（firebase apps:sdkconfig web の出力値を使用）
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key_here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project-id.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id_here

# Firebase Admin SDK 用（サーバーサイド）
FIREBASE_SERVICE_ACCOUNT_KEY=./firebase-service-account.json
```

## 🔑 6. サービスアカウントキー作成

### 6.1 Firebase Console でキー生成
1. Firebase Console → プロジェクト設定（⚙️）
2. 「サービスアカウント」タブ
3. 「新しい秘密鍵の生成」をクリック
4. JSON ファイルをダウンロード

### 6.2 キーファイル配置
```bash
# ダウンロードファイルをプロジェクトルートに配置
# ファイル名: firebase-service-account.json

# gitignore に追加（既に追加済みの場合はスキップ）
echo "firebase-service-account.json" >> .gitignore
```

## 🗂️ 7. ファイル設定

### 7.1 firebase.json（Next.js 用に修正）
```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "hosting": {
    "public": "out",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
```

### 7.2 lib/firebase.ts（Firebase SDK 設定）
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

// Firebase アプリの初期化（重複を避ける）
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Firestore インスタンス
export const db = getFirestore(app);

export default app;
```

## 📊 8. データインポートスクリプト作成

### 8.1 scripts/import-to-firestore.js
```javascript
#!/usr/bin/env node

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Firebase Admin SDK 初期化
const serviceAccount = require('../firebase-service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function importChatData() {
  try {
    // chat-sample.json を読み込み
    const dataPath = path.join(__dirname, '../public/data/chat-sample.json');
    const rawData = fs.readFileSync(dataPath, 'utf8');
    const chatData = JSON.parse(rawData);

    console.log('🚀 Firestore へのデータインポートを開始...');

    // 会話ID（固定値またはランダム生成）
    const conversationId = 'sample-conversation-1';
    const conversationRef = db.collection('conversations').doc(conversationId);

    // 1. Messages サブコレクションにインポート
    console.log('📝 Messages をインポート中...');
    const messagesCollection = conversationRef.collection('messages');

    for (const [messageId, messageData] of Object.entries(chatData.messages)) {
      await messagesCollection.doc(messageId).set({
        ...messageData,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    // 2. Lines サブコレクションにインポート
    console.log('📋 Lines をインポート中...');
    const linesCollection = conversationRef.collection('lines');

    for (const line of chatData.lines) {
      await linesCollection.doc(line.id).set({
        ...line,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    // 3. Branch Points サブコレクションにインポート
    console.log('🌿 Branch Points をインポート中...');
    const branchPointsCollection = conversationRef.collection('branchPoints');

    for (const [branchPointId, branchPointData] of Object.entries(chatData.branchPoints)) {
      await branchPointsCollection.doc(branchPointId).set({
        id: branchPointId,
        ...branchPointData,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    // 4. Tags サブコレクションにインポート
    console.log('🏷️ Tags をインポート中...');
    const tagsCollection = conversationRef.collection('tags');

    for (const [tagId, tagData] of Object.entries(chatData.tags)) {
      await tagsCollection.doc(tagId).set({
        ...tagData,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    // 5. Tag Groups サブコレクションにインポート
    console.log('📚 Tag Groups をインポート中...');
    const tagGroupsCollection = conversationRef.collection('tagGroups');

    for (const [tagGroupId, tagGroupData] of Object.entries(chatData.tagGroups)) {
      await tagGroupsCollection.doc(tagGroupId).set({
        ...tagGroupData,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    // 6. 会話メタデータを保存
    console.log('💬 Conversation メタデータを保存中...');
    await conversationRef.set({
      title: 'チャットアプリ開発プロジェクト議論',
      description: 'プロジェクトキックオフから技術検討まで',
      messagesCount: Object.keys(chatData.messages).length,
      linesCount: chatData.lines.length,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log('✅ データインポート完了！');
    console.log(`   会話ID: ${conversationId}`);
    console.log(`   メッセージ数: ${Object.keys(chatData.messages).length}`);
    console.log(`   ライン数: ${chatData.lines.length}`);

    process.exit(0);

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  }
}

importChatData();
```

### 8.2 スクリプト実行
```bash
# 実行権限を付与
chmod +x scripts/import-to-firestore.js

# データインポート実行
node scripts/import-to-firestore.js
```

## 🧪 9. Firestore 連携テスト

### 9.1 テストコンポーネント作成
`components/firestore-test.tsx` を作成（詳細は別ファイル参照）

### 9.2 メインページに追加
`app/page.tsx` にテストコンポーネントをインポート・表示

## ✅ 10. 動作確認

### 10.1 ビルドテスト
```bash
# Next.js ビルドエラーがないことを確認
npx next build
```

### 10.2 開発サーバーで確認
```bash
# 開発サーバー起動
npx next dev

# ブラウザで http://localhost:3000 を開く
# Firestore 接続テストコンポーネントで成功を確認
```

### 10.3 Firebase Console で確認
```bash
# Firebase Console を開く
open "https://console.firebase.google.com/project/your-project-id/firestore"

# conversations/sample-conversation-1/ 配下にデータが存在することを確認
```

## 🚀 11. デプロイ（オプション）

```bash
# Firebase Hosting にデプロイ
firebase deploy

# アクセス URL: https://your-project-id.web.app
```

## 📋 Firestore データ構造

```
conversations/
  {conversationId}/
    messages/ (subcollection)
      {messageId} → message データ
    lines/ (subcollection)
      {lineId} → line データ
    branchPoints/ (subcollection)
      {branchPointId} → branchPoint データ
    tags/ (subcollection)
      {tagId} → tag データ
    tagGroups/ (subcollection)
      {tagGroupId} → tagGroup データ
```

## ⚠️ セキュリティ注意事項

- `firebase-service-account.json` は必ず `.gitignore` に追加
- テストモードは開発用のみ、本番では適切なセキュリティルールを設定
- 環境変数に機密情報が含まれる場合は適切に管理

## 🔍 トラブルシューティング

### プロジェクトID競合エラー
```bash
Error: Failed to create project because there is already a project with ID xxx
```
→ 別のユニークなプロジェクトIDを使用

### React バージョン競合エラー
```bash
npm error ERESOLVE could not resolve
```
→ `--legacy-peer-deps` フラグを使用してインストール

### Firestore データベース未作成エラー
```bash
Error: It looks like you haven't used Cloud Firestore in this project before
```
→ Firebase Console で手動でFirestoreデータベースを作成

---

このガイドに従って、Firebase Firestore による完全な永続化環境が構築できます。
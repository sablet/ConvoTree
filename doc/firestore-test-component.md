# Firestore 接続テストコンポーネント

Firebase Firestore への接続をテストするためのReactコンポーネントです。

## 📁 ファイル: components/firestore-test.tsx

```typescript
'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface Message {
  id: string;
  content: string;
  timestamp: string;
  lineId: string;
}

export default function FirestoreTest() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchMessages() {
      try {
        console.log('🔍 Firestore からデータを取得中...');

        // conversations/sample-conversation-1/messages コレクションからデータ取得
        const messagesRef = collection(db, 'conversations', 'sample-conversation-1', 'messages');
        const querySnapshot = await getDocs(messagesRef);

        const fetchedMessages: Message[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          fetchedMessages.push({
            id: doc.id,
            content: data.content || '',
            timestamp: data.timestamp || '',
            lineId: data.lineId || ''
          });
        });

        console.log(`✅ ${fetchedMessages.length} 件のメッセージを取得しました`);
        setMessages(fetchedMessages);
        setError(null);
      } catch (err) {
        console.error('❌ Firestore エラー:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchMessages();
  }, []);

  if (loading) {
    return (
      <div className="p-4 border rounded-lg">
        <h2 className="text-lg font-semibold mb-2">🔄 Firestore 接続テスト</h2>
        <p>データを読み込み中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 border rounded-lg bg-red-50 border-red-200">
        <h2 className="text-lg font-semibold mb-2 text-red-700">❌ Firestore 接続エラー</h2>
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="p-4 border rounded-lg bg-green-50 border-green-200">
      <h2 className="text-lg font-semibold mb-2 text-green-700">✅ Firestore 接続成功</h2>
      <p className="text-green-600 mb-4">
        {messages.length} 件のメッセージを取得しました
      </p>

      <div className="max-h-96 overflow-y-auto space-y-2">
        {messages.slice(0, 5).map((message) => (
          <div key={message.id} className="p-2 bg-white border rounded text-sm">
            <div className="font-medium text-gray-700">ID: {message.id}</div>
            <div className="text-gray-600 truncate">
              {message.content.substring(0, 100)}...
            </div>
            <div className="text-xs text-gray-400">Line: {message.lineId}</div>
          </div>
        ))}

        {messages.length > 5 && (
          <div className="text-sm text-gray-500 text-center">
            他 {messages.length - 5} 件のメッセージ
          </div>
        )}
      </div>
    </div>
  );
}
```

## 🔧 使用方法

### 1. app/page.tsx への追加

```typescript
// インポート追加
import FirestoreTest from "@/components/firestore-test"

// JSX内に追加
return (
  <div className="min-h-screen bg-white pb-16">
    {/* Firestore 接続テスト */}
    <div className="p-4">
      <FirestoreTest />
    </div>

    {/* 既存のコンポーネント */}
    <BranchingChatUI ... />
  </div>
)
```

### 2. 表示状態

#### ロード中
```
🔄 Firestore 接続テスト
データを読み込み中...
```

#### 成功時
```
✅ Firestore 接続成功
22 件のメッセージを取得しました

ID: msg1
プロジェクトキックオフ！新しいチャットアプリの仕様について話し合いましょう。まず基本的な機能要件から整理していきたいと思います。...
Line: main

ID: msg2
ありがとうございます！基本機能として考えているのは：1. リアルタイムメッセージング2. ファイル共有3. 通知機能4. ユーザー管理あと、今回は分岐型の会話ができるのが特徴ですよね。...
Line: main

他 17 件のメッセージ
```

#### エラー時
```
❌ Firestore 接続エラー
Permission denied (missing or insufficient permissions)
```

## 🎯 テスト目的

1. **Firebase SDK 設定確認**: 環境変数とSDK設定が正しいか
2. **Firestore 接続確認**: データベースへの接続が成功するか
3. **データ取得確認**: インポートしたデータが取得できるか
4. **エラーハンドリング**: 接続エラー時の適切な表示

## 🔍 デバッグ情報

### ブラウザ開発者ツール コンソール出力

成功時:
```
🔍 Firestore からデータを取得中...
✅ 22 件のメッセージを取得しました
```

エラー時:
```
🔍 Firestore からデータを取得中...
❌ Firestore エラー: [エラー詳細]
```

### よくあるエラーと対処法

1. **Permission denied**
   - Firestore セキュリティルールを確認
   - テストモードが有効か確認

2. **Missing or insufficient permissions**
   - `.env.local` の環境変数を確認
   - Firebase プロジェクト設定を確認

3. **Module not found: Can't resolve '@/lib/firebase'**
   - `lib/firebase.ts` ファイルが存在するか確認
   - インポートパスが正しいか確認

## 🚀 本番運用時の注意

このテストコンポーネントは**開発・デバッグ用**です。本番運用時は以下を考慮してください：

1. **セキュリティルール**: テストモードから適切なルールに変更
2. **パフォーマンス**: 大量データの場合はページネーション実装
3. **エラーハンドリング**: ユーザーフレンドリーなエラー表示
4. **テストコンポーネント削除**: 本番では非表示またはdev環境のみ表示

---

# Message CRUD Backend 実装詳細

## 📊 Firestore データ構造

### コレクション階層
```
conversations/
└── {conversationId}/
    ├── (ドキュメントメタデータ)
    ├── messages/
    │   └── {messageId} (ドキュメント)
    ├── lines/
    │   └── {lineId} (ドキュメント)
    ├── branchPoints/
    │   └── {branchPointId} (ドキュメント)
    ├── tags/
    │   └── {tagId} (ドキュメント)
    └── tagGroups/
        └── {tagGroupId} (ドキュメント)
```

### Message ドキュメント構造
```typescript
interface Message {
  id: string;                     // ドキュメントID
  content: string;                // メッセージ内容（必須）
  timestamp: string;              // ISO文字列（必須）
  lineId: string;                 // 所属ライン（必須）
  prevInLine?: string;            // 前のメッセージID
  nextInLine?: string;            // 次のメッセージID
  branchFromMessageId?: string;   // 分岐元メッセージID
  tags?: string[];                // タグIDの配列
  hasBookmark?: boolean;          // ブックマーク状態
  author?: string;                // 作成者
  images?: string[];              // 画像URL配列
  createdAt?: Timestamp;          // Firestore作成日時
  updatedAt?: Timestamp;          // Firestore更新日時
}
```

## 🔧 DataSourceManager拡張実装

### lib/data-source.ts の CRUD 機能追加

#### 1. Firebase インポート拡張
```typescript
import {
  collection, getDocs, doc, getDoc,
  addDoc, updateDoc, deleteDoc,
  serverTimestamp, Timestamp
} from 'firebase/firestore';
```

#### 2. createMessage 実装
```typescript
async createMessage(message: Omit<Message, 'id'>): Promise<string> {
  // バリデーション
  this.validateMessage(message);

  const messagesRef = collection(db, 'conversations', this.conversationId, 'messages');
  const messageData = {
    ...message,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const docRef = await addDoc(messagesRef, messageData);
  return docRef.id;
}
```

#### 3. updateMessage 実装
```typescript
async updateMessage(id: string, updates: Partial<Message>): Promise<void> {
  // バリデーションと存在確認
  this.validateMessageId(id);
  this.validateMessageUpdates(updates);

  const messageRef = doc(db, 'conversations', this.conversationId, 'messages', id);

  // 存在確認
  const messageDoc = await getDoc(messageRef);
  if (!messageDoc.exists()) {
    throw new Error(`Message with ID ${id} not found`);
  }

  const updateData = {
    ...updates,
    updatedAt: serverTimestamp()
  };

  await updateDoc(messageRef, updateData);
}
```

#### 4. deleteMessage 実装
```typescript
async deleteMessage(id: string): Promise<void> {
  this.validateMessageId(id);

  const messageRef = doc(db, 'conversations', this.conversationId, 'messages', id);

  // 存在確認
  const messageDoc = await getDoc(messageRef);
  if (!messageDoc.exists()) {
    throw new Error(`Message with ID ${id} not found`);
  }

  await deleteDoc(messageRef);
}
```

## 🛡️ バリデーション機能

### 入力データ検証
```typescript
private validateMessage(message: Omit<Message, 'id'>): void {
  // 必須フィールドチェック
  if (!message.content?.trim()) throw new Error('Message content is required');
  if (!message.lineId?.trim()) throw new Error('LineId is required');
  if (!message.timestamp) throw new Error('Timestamp is required');

  // 形式チェック
  if (isNaN(Date.parse(message.timestamp))) {
    throw new Error('Invalid timestamp format');
  }
}
```

### 更新データ検証
```typescript
private validateMessageUpdates(updates: Partial<Message>): void {
  if (Object.keys(updates).length === 0) {
    throw new Error('No updates provided');
  }

  // 各フィールドの個別チェック
  if (updates.content !== undefined && !updates.content.trim()) {
    throw new Error('Message content cannot be empty');
  }
  // ...その他のフィールド検証
}
```

## 🚨 エラーハンドリング

### Firestore固有エラーの分類処理
```typescript
private handleFirestoreError(error: unknown, operation: string): void {
  if (error instanceof Error) {
    if (error.message.includes('permission-denied')) {
      console.error(`❌ Permission denied for ${operation} operation`);
    } else if (error.message.includes('not-found')) {
      console.error(`❌ Document not found for ${operation} operation`);
    } else if (error.message.includes('already-exists')) {
      console.error(`❌ Document already exists for ${operation} operation`);
    } else if (error.message.includes('network')) {
      console.error(`❌ Network error during ${operation} operation`);
    }
  }
}
```

### エラータイプ別対処法
- **permission-denied**: Firestoreセキュリティルール確認
- **not-found**: ドキュメント存在確認
- **already-exists**: 重複チェック実装
- **network**: 接続状態確認

## 🧪 テストコンポーネント実装

### components/message-crud-test.tsx
```typescript
export function MessageCrudTest() {
  const [messageContent, setMessageContent] = useState('テストメッセージです');
  const [messageId, setMessageId] = useState('');
  const [result, setResult] = useState<string>('');

  // CRUD操作のテスト関数
  const handleCreateMessage = async () => { /* ... */ };
  const handleUpdateMessage = async () => { /* ... */ };
  const handleDeleteMessage = async () => { /* ... */ };
}
```

### 管理画面への統合
- `app/management/page.tsx` にテストUI追加
- リアルタイムでCRUD操作の動作確認が可能
- エラーハンドリングの動作確認

## 📈 パフォーマンス考慮事項

### 最適化ポイント
1. **バッチ操作**: 複数メッセージの一括処理時はbatch操作を検討
2. **インデックス**: よく使われるクエリに対するFirestoreインデックス設定
3. **キャッシュ**: 頻繁にアクセスするデータのローカルキャッシュ
4. **リアルタイム**: onSnapshot使用時のリスナー管理

### セキュリティ考慮事項
1. **Firestoreルール**: 適切な読み書き権限設定
2. **入力サニタイズ**: XSS対策のための入力データ検証
3. **レート制限**: 大量リクエスト対策
4. **ログ管理**: 機密情報のログ出力回避

## 🔄 今後の拡張予定

### 追加機能候補
1. **バッチ操作**: 複数メッセージの一括更新・削除
2. **検索機能**: 内容・タグ・日時での検索
3. **履歴管理**: メッセージ編集履歴の保存
4. **リアルタイム更新**: onSnapshotによるリアルタイム同期
5. **画像アップロード**: Firebase Storageとの連携
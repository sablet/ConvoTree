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
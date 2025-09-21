'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export function FirestoreDebug() {
  const [result, setResult] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const testFirestoreConnection = async () => {
    setIsLoading(true);
    setResult('🔍 Firestore 接続テスト中...');

    try {
      // 環境変数確認
      const envCheck = {
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ? '✓ 設定済み' : '❌ 未設定',
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ? '✓ 設定済み' : '❌ 未設定',
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ? '✓ 設定済み' : '❌ 未設定',
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ? '✓ 設定済み' : '❌ 未設定',
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ? '✓ 設定済み' : '❌ 未設定',
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ? '✓ 設定済み' : '❌ 未設定'
      };

      let debugInfo = '🔧 Firebase 設定確認:\n';
      debugInfo += `API Key: ${envCheck.apiKey}\n`;
      debugInfo += `Auth Domain: ${envCheck.authDomain}\n`;
      debugInfo += `Project ID: ${envCheck.projectId}\n`;
      debugInfo += `Storage Bucket: ${envCheck.storageBucket}\n`;
      debugInfo += `Messaging Sender ID: ${envCheck.messagingSenderId}\n`;
      debugInfo += `App ID: ${envCheck.appId}\n\n`;

      // Firestore 接続テスト
      debugInfo += '🔥 Firestore 接続テスト:\n';

      // conversations コレクション存在確認
      try {
        const conversationsRef = collection(db, 'conversations');
        const conversationsSnapshot = await getDocs(conversationsRef);
        debugInfo += `Conversations コレクション: ${conversationsSnapshot.size} 件のドキュメント\n`;

        if (conversationsSnapshot.size === 0) {
          debugInfo += '❌ conversations コレクションが空です\n';
        } else {
          conversationsSnapshot.forEach((doc) => {
            debugInfo += `  - ドキュメント ID: ${doc.id}\n`;
          });
        }
      } catch (error) {
        debugInfo += `❌ conversations コレクション取得エラー: ${error}\n`;
      }

      // sample-conversation-1 の詳細チェック
      debugInfo += '\n📋 sample-conversation-1 詳細チェック:\n';
      const conversationId = 'sample-conversation-1';

      try {
        // messages サブコレクション
        const messagesRef = collection(db, 'conversations', conversationId, 'messages');
        const messagesSnapshot = await getDocs(messagesRef);
        debugInfo += `Messages: ${messagesSnapshot.size} 件\n`;

        // lines サブコレクション
        const linesRef = collection(db, 'conversations', conversationId, 'lines');
        const linesSnapshot = await getDocs(linesRef);
        debugInfo += `Lines: ${linesSnapshot.size} 件\n`;

        // branchPoints サブコレクション
        const branchPointsRef = collection(db, 'conversations', conversationId, 'branchPoints');
        const branchPointsSnapshot = await getDocs(branchPointsRef);
        debugInfo += `Branch Points: ${branchPointsSnapshot.size} 件\n`;

        // tags サブコレクション
        const tagsRef = collection(db, 'conversations', conversationId, 'tags');
        const tagsSnapshot = await getDocs(tagsRef);
        debugInfo += `Tags: ${tagsSnapshot.size} 件\n`;

        // tagGroups サブコレクション
        const tagGroupsRef = collection(db, 'conversations', conversationId, 'tagGroups');
        const tagGroupsSnapshot = await getDocs(tagGroupsRef);
        debugInfo += `Tag Groups: ${tagGroupsSnapshot.size} 件\n`;

        if (messagesSnapshot.size === 0) {
          debugInfo += '\n❌ データが見つかりません。インポートが必要です。\n';
          debugInfo += '💡 解決方法: node scripts/import-to-firestore.js を実行してください\n';
        } else {
          debugInfo += '\n✅ Firestore データが正常に存在します\n';
        }

      } catch (error) {
        debugInfo += `❌ サブコレクション取得エラー: ${error}\n`;
      }

      setResult(debugInfo);

    } catch (error) {
      setResult(`❌ エラーが発生しました:\n${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 border rounded-lg bg-gray-50">
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-lg font-semibold">🔍 Firestore デバッグツール</h3>
        <Button
          onClick={testFirestoreConnection}
          disabled={isLoading}
          size="sm"
          className="bg-blue-500 hover:bg-blue-600"
        >
          {isLoading ? '実行中...' : '接続テスト実行'}
        </Button>
      </div>

      {result && (
        <div className="bg-white border rounded p-3 font-mono text-sm whitespace-pre-wrap max-h-96 overflow-y-auto">
          {result}
        </div>
      )}
    </div>
  );
}
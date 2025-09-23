'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { config } from '@/lib/config';

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
        if (!config.conversationId) {
          throw new Error('NEXT_PUBLIC_CONVERSATION_ID環境変数が設定されていません');
        }


        // conversations/sample-conversation-1/messages コレクションからデータ取得
        const messagesRef = collection(db, 'conversations', config.conversationId, 'messages');
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
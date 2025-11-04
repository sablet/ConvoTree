'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useChatRepository } from '@/lib/chat-repository-context';

export function MessageCrudTest() {
  const repository = useChatRepository();
  const [result, setResult] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [messageContent, setMessageContent] = useState('テストメッセージです');
  const [messageId, setMessageId] = useState('');

  const handleCreateMessage = async () => {
    setIsLoading(true);
    setResult('📝 メッセージを作成中...');

    try {
      const newMessage = {
        content: messageContent,
        lineId: 'test-line',
        timestamp: new Date().toISOString(),
        author: 'テストユーザー'
      };

      const id = await repository.createMessage(newMessage);
      setMessageId(id);
      setResult(`✅ メッセージが作成されました！\nID: ${id}`);
    } catch (error) {
      setResult(`❌ エラー: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateMessage = async () => {
    if (!messageId) {
      setResult('❌ 更新するメッセージIDが必要です。まず作成してください。');
      return;
    }

    setIsLoading(true);
    setResult('📝 メッセージを更新中...');

    try {
      await repository.updateMessage(messageId, {
        content: `${messageContent} (更新済み)`,
        hasBookmark: true
      });
      setResult(`✅ メッセージ ${messageId} が更新されました！`);
    } catch (error) {
      setResult(`❌ エラー: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteMessage = async () => {
    if (!messageId) {
      setResult('❌ 削除するメッセージIDが必要です。まず作成してください。');
      return;
    }

    setIsLoading(true);
    setResult('🗑️ メッセージを削除中...');

    try {
      await repository.deleteMessage(messageId);
      setResult(`✅ メッセージ ${messageId} が削除されました！`);
      setMessageId('');
    } catch (error) {
      setResult(`❌ エラー: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 border rounded-lg bg-gray-50">
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-lg font-semibold">🧪 Message CRUD テスト</h3>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">メッセージ内容:</label>
          <Input
            value={messageContent}
            onChange={(e) => setMessageContent(e.target.value)}
            placeholder="テストメッセージを入力"
            className="w-full"
          />
        </div>

        {messageId && (
          <div className="p-2 bg-blue-50 rounded text-sm">
            <strong>現在のメッセージID:</strong> {messageId}
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          <Button
            onClick={handleCreateMessage}
            disabled={isLoading}
            className="bg-green-500 hover:bg-green-600"
          >
            📝 作成
          </Button>

          <Button
            onClick={handleUpdateMessage}
            disabled={isLoading || !messageId}
            className="bg-blue-500 hover:bg-blue-600"
          >
            ✏️ 更新
          </Button>

          <Button
            onClick={handleDeleteMessage}
            disabled={isLoading || !messageId}
            className="bg-red-500 hover:bg-red-600"
          >
            🗑️ 削除
          </Button>
        </div>
      </div>

      {result && (
        <div className="mt-4 bg-white border rounded p-3 font-mono text-sm whitespace-pre-wrap">
          {result}
        </div>
      )}
    </div>
  );
}
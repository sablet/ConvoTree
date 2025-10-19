import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import Image from "next/image";
import type { Message } from "@/lib/types";

interface InsertMessageInputProps {
  messages: Record<string, Message>;
  currentLineId: string;
  onInsertMessage: (content: string, timestamp: Date, images?: string[]) => Promise<void>;
  onCancel: () => void;
}

export function InsertMessageInput({ 
  messages, 
  currentLineId, 
  onInsertMessage, 
  onCancel 
}: InsertMessageInputProps) {
  const [timestamp, setTimestamp] = useState<Date>(new Date());
  const [content, setContent] = useState<string>("");
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const datePickerRef = useRef<HTMLDivElement>(null);

  // 現在のタイムスタンプを更新する関数
  const updateTimestamp = (newTimestamp: Date) => {
    setTimestamp(newTimestamp);
  };

  // メッセージのタイムスタンプを取得する関数
  const getMessageTimestamp = (messageId: string): Date | null => {
    const message = messages[messageId];
    if (!message) return null;
    return message.timestamp instanceof Date 
      ? message.timestamp 
      : new Date(message.timestamp);
  };

  // メッセージIDからタイムスタンプを設定する関数
  const onUseMessageTimestamp = (messageId: string) => {
    const messageTimestamp = getMessageTimestamp(messageId);
    if (messageTimestamp) {
      updateTimestamp(messageTimestamp);
    }
  };

  // メッセージ挿入処理
  const handleInsert = async () => {
    if (!content.trim()) return;
    
    try {
      await onInsertMessage(content, timestamp, pendingImages);
      // 成功後にリセット
      setContent("");
      setPendingImages([]);
      onCancel(); // UIを閉じる
    } catch (error) {
      console.error("Failed to insert message:", error);
      alert("メッセージの挿入に失敗しました");
    }
  };



  // 最も最近のメッセージを取得
  const sortedMessages = Object.values(messages)
    .filter(msg => msg.lineId === currentLineId)
    .sort((a, b) => {
      const dateA = getMessageTimestamp(a.id) || new Date(0);
      const dateB = getMessageTimestamp(b.id) || new Date(0);
      return dateB.getTime() - dateA.getTime();
    });

  return (
    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-blue-800">過去のタイムラインにメッセージを挿入</h3>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-blue-500 hover:text-blue-700"
          onClick={onCancel}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="mb-3">
        <div className="flex items-center gap-2 mb-2">
          <label className="text-sm font-medium text-gray-700">挿入日時:</label>
          <div className="relative" ref={datePickerRef}>
            <input
              type="datetime-local"
              value={new Date(timestamp.getTime() - timestamp.getTimezoneOffset() * 60000)
                .toISOString()
                .slice(0, 16)}
              onChange={(e) => {
                // 入力された値をブラウザのタイムゾーンとして扱う
                const localDate = new Date(e.target.value);
                // タイムゾーンオフセットを考慮してUTCとして処理
                const utcDate = new Date(localDate.getTime() + localDate.getTimezoneOffset() * 60000);
                setTimestamp(utcDate);
              }}
              className="border border-gray-300 rounded px-3 py-1 text-sm w-48"
            />
          </div>
        </div>

        <div className="text-xs text-gray-500 mb-2">
          または以下のメッセージからタイムスタンプを選択:
        </div>
        <div className="flex flex-wrap gap-2 max-h-20 overflow-y-auto">
          {sortedMessages.slice(0, 5).map((message) => {
            const messageTimestamp = getMessageTimestamp(message.id);
            if (!messageTimestamp) return null;
            
            return (
              <Button
                key={message.id}
                variant="outline"
                size="sm"
                className="text-xs py-1 px-2 h-auto whitespace-normal max-w-[120px]"
                onClick={() => onUseMessageTimestamp(message.id)}
                title={`タイムスタンプ: ${messageTimestamp.toLocaleString()}`}
              >
                {message.content.length > 20 
                  ? `${message.content.substring(0, 20)}...` 
                  : message.content}
              </Button>
            );
          })}
        </div>
      </div>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="挿入するメッセージを入力..."
        className="w-full min-h-[80px] max-h-32 border border-gray-300 rounded-md px-3 py-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none text-sm"
      />

      {pendingImages.length > 0 && (
        <div className="mt-2 p-2 bg-blue-100 rounded border border-blue-200">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-blue-800">添付画像 ({pendingImages.length})</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {pendingImages.map((image, index) => (
              <div key={index} className="relative group">
                <Image
                  src={image}
                  alt={`Preview ${index + 1}`}
                  width={48}
                  height={48}
                  className="w-12 h-12 object-cover rounded border border-blue-300"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 mt-3">
        <Button
          variant="outline"
          size="sm"
          onClick={onCancel}
        >
          キャンセル
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={handleInsert}
          disabled={!content.trim()}
        >
          挿入
        </Button>
      </div>
    </div>
  );
}
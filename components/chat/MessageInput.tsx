import { Button } from "@/components/ui/button"
import { Send } from "lucide-react"
import Image from "next/image"
import { SlashCommandButtons } from "@/components/slash-command-buttons"
import type { Line, Message } from "@/lib/types"

interface MessageInputProps {
  inputValue: string
  pendingImages: string[]
  selectedBaseMessage: string | null
  currentLineId: string // eslint-disable-line @typescript-eslint/no-unused-vars
  currentLine: Line | null
  messages: Record<string, Message>
  isUpdating: boolean
  textareaRef: React.RefObject<HTMLTextAreaElement>
  onInputChange: (value: string) => void
  onSend: () => void
  onPaste: (e: ClipboardEvent) => void
  onImageAdd: (file: File) => Promise<string> // eslint-disable-line @typescript-eslint/no-unused-vars
  onImageRemove: (index: number) => void
  onBaseMessageClear: () => void
  onPendingImagesClear: () => void
  adjustTextareaHeight: () => void
  getRelativeTime: (dateString: string) => string
}

/**
 * MessageInput Component
 *
 * Message input form with image attachments and slash commands
 */
export function MessageInput({
  inputValue,
  pendingImages,
  selectedBaseMessage,
  currentLineId: _currentLineId,
  currentLine,
  messages,
  isUpdating,
  textareaRef,
  onInputChange,
  onSend,
  onImageAdd: _onImageAdd,
  onImageRemove,
  onBaseMessageClear,
  onPendingImagesClear,
  adjustTextareaHeight,
  getRelativeTime
}: MessageInputProps) {
  return (
    <>
      {/* 分岐元メッセージ表示 or 現在のライン表示 */}
          {selectedBaseMessage ? (
            <div className="mb-3 p-3 bg-emerald-50 rounded-lg border border-emerald-200">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-xs px-2 py-1 rounded bg-emerald-500 text-white flex-shrink-0">
                    🌿 新しい分岐を作成
                  </span>
                  <span className="text-xs text-gray-400 flex-shrink-0">
                    {(() => {
                      const message = messages[selectedBaseMessage]
                      if (!message) return ""
                      return getRelativeTime(message.timestamp.toISOString())
                    })()}
                  </span>
                  <span className="text-xs text-gray-500 truncate">
                    分岐元: {(() => {
                      const message = messages[selectedBaseMessage]
                      if (!message) return ""
                      const content = message.content.slice(0, 30)
                      return `${content}${message.content.length > 30 ? "..." : ""}`
                    })()}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-gray-400 hover:text-gray-600 hover:bg-emerald-100 flex-shrink-0"
                  onClick={onBaseMessageClear}
                >
                  ✕
                </Button>
              </div>
            </div>
          ) : (
            <div className="mb-3 p-3 bg-gray-50 rounded-lg text-sm border border-gray-200">
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-1 rounded bg-gray-200 text-gray-700">
                  📝 現在のラインに追加
                </span>
                <span className="text-gray-500">
                  {currentLine?.name || "メインの流れ"}
                </span>
              </div>
            </div>
          )}

          {/* 添付画像プレビュー */}
          {pendingImages.length > 0 && (
            <div className="mb-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-blue-800">画像 ({pendingImages.length})</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-blue-400 hover:text-blue-600 hover:bg-blue-100"
                  onClick={onPendingImagesClear}
                >
                  すべて削除
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {pendingImages.map((imageUrl, index) => (
                  <div key={index} className="relative group">
                    <Image
                      src={imageUrl}
                      alt={`Preview ${index + 1}`}
                      width={60}
                      height={60}
                      className="w-15 h-15 object-cover rounded border border-blue-300"
                    />
                    <button
                      onClick={() => onImageRemove(index)}
                      className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs hover:bg-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <div className="flex-1">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => onInputChange(e.target.value)}
                onInput={adjustTextareaHeight}
                placeholder="メッセージを入力... (/task, /task_completed, /task_high, /document, /session などのコマンドが使用できます)"
                className="min-h-[80px] max-h-32 resize-none border border-gray-300 rounded-md px-3 py-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none w-full overflow-y-auto"
                style={{ height: '80px' }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    onSend()
                  }
                }}
              />
            </div>
            <div className="flex flex-col gap-2">
              <SlashCommandButtons
                onCommandSelect={(command) => {
                  // カーソル位置に挿入するか、先頭に追加
                  if (inputValue.trim() === '') {
                    onInputChange(command)
                  } else {
                    onInputChange(command + inputValue)
                  }
                }}
              />
              <Button
                onClick={onSend}
                disabled={(!inputValue.trim() && pendingImages.length === 0) || isUpdating}
                className="h-9 px-3 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 [&_svg]:!size-3"
              >
                <Send className="h-3 w-3" />
                {isUpdating && <span className="ml-2 text-xs">送信中...</span>}
              </Button>
            </div>
          </div>
    </>
  )
}

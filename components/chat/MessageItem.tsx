import { Button } from "@/components/ui/button"
import { Copy, CheckCircle, Edit3, Trash2 } from "lucide-react"
import Image from "next/image"
import { MessageTypeRenderer } from "@/components/message-types/message-type-renderer"
import { EditingMessageForm } from "./EditingMessageForm"
import { BranchingLinesPanel } from "./BranchingLinesPanel"
import type { MessageItemProps } from "./types"

/**
 * 個別メッセージ表示コンポーネント
 */
export function MessageItem({
  message,
  isCurrentLine,
  isSelected,
  isSelectionMode,
  isSelectedInBulk,
  editingMessageId,
  editingContent,
  editingMessageType,
  editingMetadata,
  hoveredMessageId,
  hoveredImageId,
  copySuccessMessageId,
  hasSetCursorToEnd,
  branchingLines,
  currentLineId,
  messages,
  tags,
  isUpdating,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onCopy,
  onImageDelete,
  onMessageTap,
  onSwitchLine,
  onHoverMessage,
  onHoverImage,
  setEditingContent,
  setEditingMessageType,
  setEditingMetadata,
  setHasSetCursorToEnd,
  isValidImageUrl,
  getRelativeTime
}: MessageItemProps) {
  return (
    <div
      id={`message-${message.id}`}
      className={`group relative transition-all duration-200 ${
        isSelected ? "bg-gray-100 -mx-2 px-2 py-2 rounded-lg border-2 border-green-600" : ""
      } ${
        isSelectedInBulk ? "bg-blue-100 -mx-2 px-2 py-2 rounded-lg border-2 border-blue-500" : ""
      } ${
        !isCurrentLine ? "border-l-2 border-blue-200 pl-3 ml-1" : ""
      }`}
      onMouseEnter={() => onHoverMessage(message.id)}
      onMouseLeave={() => onHoverMessage(null)}
      onClick={() => {
        if (isSelectionMode) {
          onMessageTap(message.id)
        }
      }}
      onDoubleClick={() => {
        if (!isSelectionMode) {
          onMessageTap(message.id)
        }
      }}
    >
      <div className="flex gap-3">
        {/* 選択チェックボックス（選択モード時のみ表示） */}
        {isSelectionMode && (
          <div
            className="flex items-center pt-0.5 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation()
              onMessageTap(message.id)
            }}
          >
            <input
              type="checkbox"
              checked={isSelectedInBulk}
              onChange={() => {}}
              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2 pointer-events-none"
            />
          </div>
        )}

        {/* 時刻表示 */}
        <div className={`text-xs font-mono min-w-[35px] pt-0.5 leading-relaxed ${
          !isCurrentLine ? 'text-blue-400' : 'text-gray-400'
        }`}>
          {new Date(message.timestamp).toLocaleTimeString("ja-JP", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })}
        </div>

        {/* メッセージ内容 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            {message.hasBookmark && <div className="w-3 h-3 border border-gray-300 mt-1 flex-shrink-0" />}

            {editingMessageId === message.id ? (
              /* 統合編集モード */
              <EditingMessageForm
                message={message}
                editingMessageId={editingMessageId}
                editingContent={editingContent}
                editingMessageType={editingMessageType}
                editingMetadata={editingMetadata}
                hasSetCursorToEnd={hasSetCursorToEnd}
                isUpdating={isUpdating}
                setEditingContent={setEditingContent}
                setEditingMessageType={setEditingMessageType}
                setEditingMetadata={setEditingMetadata}
                setHasSetCursorToEnd={setHasSetCursorToEnd}
                onSaveEdit={onSaveEdit}
                onCancelEdit={onCancelEdit}
              />
            ) : (
              /* 通常表示モード */
              <div className="flex-1 min-w-0">
                <MessageTypeRenderer message={message} />

                {/* 画像表示 */}
                {message.images && message.images.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {message.images.filter(imageUrl => isValidImageUrl(imageUrl)).map((imageUrl, imageIndex) => (
                      <div
                        key={imageIndex}
                        className="relative group"
                        onMouseEnter={() => onHoverImage(`${message.id}-${imageIndex}`)}
                        onMouseLeave={() => onHoverImage(null)}
                      >
                        <Image
                          src={imageUrl}
                          alt={`Image ${imageIndex + 1}`}
                          width={200}
                          height={200}
                          className="rounded border border-gray-300 object-cover max-w-[200px] max-h-[200px]"
                        />
                        {hoveredImageId === `${message.id}-${imageIndex}` && (
                          <div className="absolute top-1 right-1 flex gap-1">
                            <Button
                              onClick={() => onImageDelete(message.id, imageIndex)}
                              size="sm"
                              className="h-6 px-2 bg-red-500 hover:bg-red-600 text-white"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* コピー成功フィードバック */}
                {copySuccessMessageId === message.id && (
                  <div className="absolute -top-8 right-0 flex items-center gap-1 bg-gray-100 text-gray-700 px-2 py-1 rounded-md text-xs border border-gray-200 shadow-sm animate-in fade-in slide-in-from-top-1 duration-300">
                    <CheckCircle className="h-3 w-3" />
                    <span>コピーしました</span>
                  </div>
                )}

                {/* ホバー時の操作ボタン */}
                {hoveredMessageId === message.id && !isSelectionMode && editingMessageId !== message.id && (
                  <div className="absolute bottom-0 right-0 flex gap-1 bg-white shadow-md border border-gray-200 rounded-md p-1">
                    <Button
                      onClick={(e) => {
                        e.stopPropagation()
                        onCopy(message.id)
                      }}
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 hover:bg-gray-50"
                      title="コピー"
                      data-copy-message-id={message.id}
                    >
                      <Copy className="h-3 w-3 text-gray-600" />
                    </Button>
                    <Button
                      onClick={(e) => {
                        e.stopPropagation()
                        onStartEdit(message.id)
                      }}
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 hover:bg-blue-50"
                      title="編集"
                    >
                      <Edit3 className="h-3 w-3 text-blue-600" />
                    </Button>
                    <Button
                      onClick={(e) => {
                        e.stopPropagation()
                        onDelete(message.id)
                      }}
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 hover:bg-red-50"
                      title="削除"
                    >
                      <Trash2 className="h-3 w-3 text-red-600" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 分岐情報表示 */}
          <BranchingLinesPanel
            branchingLines={branchingLines}
            currentLineId={currentLineId}
            messages={messages}
            tags={tags}
            messageId={message.id}
            onSwitchLine={onSwitchLine}
            getRelativeTime={getRelativeTime}
          />
        </div>
      </div>
    </div>
  )
}

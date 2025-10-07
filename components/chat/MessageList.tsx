import { Badge } from "@/components/ui/badge"
import { GitBranch } from "lucide-react"
import { MessageItem } from "./MessageItem"
import { getMessageLineInfo } from "./hooks/useMessageLineInfo"
import type { Message, Line, Tag, BranchPoint } from "@/lib/types"
import type { MessageType } from "@/lib/constants"

interface Timeline {
  messages: Message[]
  transitions: Array<{ index: number; lineId: string; lineName: string }>
}

interface MessageListProps {
  filteredTimeline: Timeline
  messages: Record<string, Message>
  lines: Record<string, Line>
  tags: Record<string, Tag>
  branchPoints: Record<string, BranchPoint> // eslint-disable-line @typescript-eslint/no-unused-vars
  currentLineId: string
  selectedBaseMessage: string | null
  editingMessageId: string | null
  editingContent: string
  editingMessageType: MessageType | null
  editingMetadata: Record<string, unknown>
  hoveredMessageId: string | null
  hoveredImageId: string | null
  copySuccessMessageId: string | null
  isSelectionMode: boolean
  selectedMessages: Set<string>
  hasSetCursorToEnd: string | null
  messagesContainerRef: React.RefObject<HTMLDivElement>
  messagesEndRef: React.RefObject<HTMLDivElement>
  onStartEdit: (messageId: string) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onDelete: (messageId: string) => void
  onCopy: (messageId: string) => void
  onImageDelete: (messageId: string, imageIndex: number) => void
  onMessageTap: (messageId: string) => void
  onSwitchLine: (lineId: string) => void
  onHoverMessage: (messageId: string | null) => void
  onHoverImage: (imageId: string | null) => void
  setEditingContent: (content: string) => void
  setEditingMessageType: (type: MessageType | null) => void
  setEditingMetadata: (metadata: Record<string, unknown>) => void
  setHasSetCursorToEnd: (value: string | null) => void
  isValidImageUrl: (url: string) => boolean
  getRelativeTime: (dateString: string) => string
  formatDateForSeparator: (date: Date) => string
  isSameDay: (date1: Date, date2: Date) => boolean
  getBranchingLines: (messageId: string) => Line[]
  isUpdating: boolean
  onUpdateMessage: (messageId: string, updates: Partial<Message>) => Promise<void>
}

/**
 * MessageList Component
 *
 * Displays the list of messages with editing, deletion, and interaction features
 */
export function MessageList({
  filteredTimeline,
  messages,
  lines,
  tags,
  branchPoints: _branchPoints,
  currentLineId,
  selectedBaseMessage,
  editingMessageId,
  editingContent,
  editingMessageType,
  editingMetadata,
  hoveredMessageId,
  hoveredImageId,
  copySuccessMessageId,
  isSelectionMode,
  selectedMessages,
  hasSetCursorToEnd,
  messagesContainerRef,
  messagesEndRef,
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
  getRelativeTime,
  formatDateForSeparator,
  isSameDay,
  getBranchingLines,
  isUpdating,
  onUpdateMessage
}: MessageListProps) {
  return (
    <div
      ref={messagesContainerRef}
      className="flex-1 overflow-y-auto overflow-x-hidden px-2 sm:px-4 py-6 pb-80 space-y-8"
      style={{ width: '100%', maxWidth: '100vw', boxSizing: 'border-box' }}
    >
      {filteredTimeline.messages.map((message, index) => {
        const branchingLines = getBranchingLines(message.id)
        const isSelected = selectedBaseMessage === message.id
        const messageLineInfo = getMessageLineInfo(index, filteredTimeline, lines, currentLineId)
        const isLineTransition = messageLineInfo.isLineStart && index > 0

        // 日付が変わったかどうかをチェック
        const previousMessage = index > 0 ? filteredTimeline.messages[index - 1] : null
        const shouldShowDateSeparator =
          index === 0 || // 最初のメッセージの場合は必ず表示
          (previousMessage && !isSameDay(previousMessage.timestamp, message.timestamp))

        return (
          <div key={`${message.id}-${index}`} className="space-y-4">
            {/* 日付セパレーター */}
            {shouldShowDateSeparator && (
              <div className="flex items-center justify-center py-4">
                <div className="bg-gray-100 text-gray-600 px-4 py-2 rounded-full text-sm font-medium border">
                  {formatDateForSeparator(message.timestamp)}
                </div>
              </div>
            )}

            {/* ライン切り替わりインジケーター */}
            {isLineTransition && (
              <div className="flex items-center gap-3 py-3 -mx-4 px-4 bg-gradient-to-r from-blue-50 to-transparent border-l-4 border-blue-400">
                <GitBranch className="w-4 h-4 text-blue-600" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-blue-800">
                    → {messageLineInfo.transitionInfo?.lineName}
                  </div>
                </div>
                {messageLineInfo.lineInfo?.tagIds && messageLineInfo.lineInfo.tagIds.length > 0 && (
                  <div className="flex gap-1">
                    {messageLineInfo.lineInfo.tagIds.slice(0, 2).map((tagId, tagIndex) => {
                      const tag = tags[tagId]
                      if (!tag) return null
                      return (
                        <Badge key={tagIndex} variant="secondary" className="text-xs bg-blue-100 text-blue-700">
                          {tag.name}
                        </Badge>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            <MessageItem
              message={message}
              isCurrentLine={messageLineInfo.isCurrentLine}
              isSelected={isSelected}
              isSelectionMode={isSelectionMode}
              isSelectedInBulk={selectedMessages.has(message.id)}
              editingMessageId={editingMessageId}
              editingContent={editingContent}
              editingMessageType={editingMessageType}
              editingMetadata={editingMetadata}
              hoveredMessageId={hoveredMessageId}
              hoveredImageId={hoveredImageId}
              copySuccessMessageId={copySuccessMessageId}
              hasSetCursorToEnd={hasSetCursorToEnd}
              branchingLines={branchingLines}
              currentLineId={currentLineId}
              messages={messages}
              tags={tags}
              isUpdating={isUpdating}
              onStartEdit={onStartEdit}
              onSaveEdit={onSaveEdit}
              onCancelEdit={onCancelEdit}
              onDelete={onDelete}
              onCopy={onCopy}
              onImageDelete={onImageDelete}
              onMessageTap={onMessageTap}
              onSwitchLine={onSwitchLine}
              onHoverMessage={onHoverMessage}
              onHoverImage={onHoverImage}
              setEditingContent={setEditingContent}
              setEditingMessageType={setEditingMessageType}
              setEditingMetadata={setEditingMetadata}
              setHasSetCursorToEnd={setHasSetCursorToEnd}
              isValidImageUrl={isValidImageUrl}
              getRelativeTime={getRelativeTime}
              onUpdateMessage={onUpdateMessage}
            />
          </div>
        )
      })}
      <div ref={messagesEndRef} />
    </div>
  )
}

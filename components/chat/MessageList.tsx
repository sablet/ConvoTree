import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Check, Trash2, Copy, CheckCircle, Edit3, GitBranch } from "lucide-react"
import Image from "next/image"
import { MessageTypeRenderer } from "@/components/message-types/message-type-renderer"
import type { Message, Line, Tag, BranchPoint } from "@/lib/types"
import type { MessageType } from "@/lib/constants"
import { MESSAGE_TYPE_TEXT, MESSAGE_TYPE_TASK, MESSAGE_TYPE_DOCUMENT, MESSAGE_TYPE_SESSION } from "@/lib/constants"
import { FILTER_TEXT, FILTER_TASK, FILTER_DOCUMENT, FILTER_SESSION } from "@/lib/ui-strings"

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
  isUpdating
}: MessageListProps) {
  // ヘルパー関数
  const getMessageLineInfo = (messageIndex: number, timeline: Timeline) => {
    const { transitions } = timeline
    const message = timeline.messages[messageIndex]

    if (!message) {
      return {
        isLineStart: false,
        isCurrentLine: false,
        isEditable: false,
        lineInfo: null,
        transitionInfo: null
      }
    }

    // このメッセージがラインの開始点かどうかをチェック
    const transitionAtThisIndex = transitions.find(t => t.index === messageIndex)
    const isLineStart = transitionAtThisIndex !== undefined

    // 現在ラインかどうかをチェック
    const isCurrentLine = message.lineId === currentLineId

    // 編集可能かどうかをチェック（現在のタイムラインに表示されているメッセージは全て編集可能）
    const isEditable = true

    return {
      isLineStart,
      isCurrentLine,
      isEditable,
      lineInfo: lines[message.lineId],
      transitionInfo: transitionAtThisIndex || null
    }
  }

  return (
    <div
      ref={messagesContainerRef}
      className="flex-1 overflow-y-auto overflow-x-hidden px-2 sm:px-4 py-6 pb-80 space-y-8"
      style={{ width: '100%', maxWidth: '100vw', boxSizing: 'border-box' }}
    >
      {filteredTimeline.messages.map((message, index) => {
        const branchingLines = getBranchingLines(message.id)
        const isSelected = selectedBaseMessage === message.id
        const messageLineInfo = getMessageLineInfo(index, filteredTimeline)
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

            <div
              id={`message-${message.id}`}
              className={`group relative transition-all duration-200 ${
                isSelected ? "bg-gray-100 -mx-2 px-2 py-2 rounded-lg border-2 border-green-600" : ""
              } ${
                selectedMessages.has(message.id) ? "bg-blue-100 -mx-2 px-2 py-2 rounded-lg border-2 border-blue-500" : ""
              } ${
                !messageLineInfo.isCurrentLine ? "border-l-2 border-blue-200 pl-3 ml-1" : ""
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
                      checked={selectedMessages.has(message.id)}
                      onChange={() => {}}
                      className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2 pointer-events-none"
                    />
                  </div>
                )}

                {/* 時刻表示 */}
                <div className={`text-xs font-mono min-w-[35px] pt-0.5 leading-relaxed ${
                  !messageLineInfo.isCurrentLine ? 'text-blue-400' : 'text-gray-400'
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
                      <div className="flex-1 space-y-4">
                        {/* メッセージタイプ選択 */}
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-medium text-gray-600">タイプ:</label>
                          <select
                            value={editingMessageType || message.type || 'text'}
                            onChange={(e) => setEditingMessageType(e.target.value as MessageType)}
                            className="text-xs border border-gray-300 rounded px-2 py-1 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                          >
                            <option value={MESSAGE_TYPE_TEXT}>{FILTER_TEXT}</option>
                            <option value={MESSAGE_TYPE_TASK}>{FILTER_TASK}</option>
                            <option value={MESSAGE_TYPE_DOCUMENT}>{FILTER_DOCUMENT}</option>
                            <option value={MESSAGE_TYPE_SESSION}>{FILTER_SESSION}</option>
                          </select>
                        </div>

                        {/* テキスト内容編集と保存ボタン */}
                        <div className="flex gap-2">
                          <textarea
                            value={editingContent}
                            onChange={(e) => setEditingContent(e.target.value)}
                            className="flex-1 min-h-[80px] p-2 border border-blue-300 rounded-md resize-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none text-sm"
                            placeholder="メッセージ内容"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                                e.preventDefault()
                                onSaveEdit()
                              } else if (e.key === "Escape") {
                                e.preventDefault()
                                onCancelEdit()
                              }
                            }}
                            ref={(textarea) => {
                              if (textarea && editingMessageId && hasSetCursorToEnd !== editingMessageId) {
                                textarea.focus()
                                // カーソルを文末に移動（初回のみ）
                                textarea.setSelectionRange(textarea.value.length, textarea.value.length)
                                setHasSetCursorToEnd(editingMessageId)
                              }
                            }}
                          />
                          {/* 保存・キャンセルボタン */}
                          <div className="flex flex-col gap-1">
                            <Button
                              onClick={onSaveEdit}
                              disabled={!editingContent.trim() || isUpdating}
                              size="sm"
                              className="h-8 px-3 bg-blue-500 hover:bg-blue-600 text-white"
                            >
                              <Check className="h-3 w-3 mr-1" />
                              保存
                            </Button>
                            <Button
                              onClick={onCancelEdit}
                              disabled={isUpdating}
                              variant="outline"
                              size="sm"
                              className="h-8 px-3"
                            >
                              キャンセル
                            </Button>
                          </div>
                        </div>

                        {/* タイプ別プロパティ編集 */}
                        {(editingMessageType === MESSAGE_TYPE_TASK || (editingMessageType === null && message.type === MESSAGE_TYPE_TASK)) && (
                          <div className="bg-orange-50 p-3 rounded-md border border-orange-200">
                            <h4 className="text-xs font-medium text-orange-800 mb-2">タスクプロパティ</h4>
                            <div>
                              <label className="text-xs text-gray-600">優先度</label>
                              <select
                                className="w-full text-xs border border-gray-300 rounded px-2 py-1"
                                value={(editingMetadata.priority as string) || (message.metadata?.priority as string) || 'medium'}
                                onChange={(e) => setEditingMetadata({ ...editingMetadata, priority: e.target.value })}
                              >
                                <option value="low">低</option>
                                <option value="medium">中</option>
                                <option value="high">高</option>
                              </select>
                            </div>
                            <div className="mt-2">
                              <label className="flex items-center gap-2 text-xs">
                                <input
                                  type="checkbox"
                                  checked={(editingMetadata.completed as boolean) ?? (message.metadata?.completed as boolean) ?? false}
                                  onChange={(e) => setEditingMetadata({ ...editingMetadata, completed: e.target.checked })}
                                  className="rounded"
                                />
                                完了
                              </label>
                            </div>
                          </div>
                        )}

                        {(editingMessageType === MESSAGE_TYPE_SESSION || (editingMessageType === null && message.type === MESSAGE_TYPE_SESSION)) && (
                          <div className="bg-purple-50 p-3 rounded-md border border-purple-200">
                            <h4 className="text-xs font-medium text-purple-800 mb-2">セッションプロパティ</h4>
                            <div className="space-y-2">
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-xs text-gray-600">開始日時</label>
                                  <input
                                    type="datetime-local"
                                    className="w-full text-xs border border-gray-300 rounded px-2 py-1"
                                    value={(() => {
                                      const checkedInAt = (editingMetadata.checkedInAt as string) ?? (message.metadata?.checkedInAt as string) ?? ''
                                      if (!checkedInAt) return ''
                                      const date = new Date(checkedInAt)
                                      const year = date.getFullYear()
                                      const month = String(date.getMonth() + 1).padStart(2, '0')
                                      const day = String(date.getDate()).padStart(2, '0')
                                      const hours = String(date.getHours()).padStart(2, '0')
                                      const minutes = String(date.getMinutes()).padStart(2, '0')
                                      return `${year}-${month}-${day}T${hours}:${minutes}`
                                    })()}
                                    onChange={(e) => {
                                      const isoString = e.target.value ? new Date(e.target.value).toISOString() : ''
                                      const newMetadata: Record<string, unknown> = {
                                        ...editingMetadata,
                                        checkedInAt: isoString
                                      }
                                      if (isoString && editingMetadata.timeSpent) {
                                        newMetadata.checkedOutAt = new Date(new Date(isoString).getTime() + (editingMetadata.timeSpent as number) * 60000).toISOString()
                                      }
                                      setEditingMetadata(newMetadata)
                                    }}
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-gray-600">経過分数</label>
                                  <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    className="w-full text-xs border border-gray-300 rounded px-2 py-1"
                                    value={(editingMetadata.timeSpent as number) ?? (message.metadata?.timeSpent as number) ?? 0}
                                    onChange={(e) => {
                                      const minutes = parseInt(e.target.value) || 0
                                      const checkedInAt = (editingMetadata.checkedInAt as string) || (message.metadata?.checkedInAt as string)
                                      const newMetadata: Record<string, unknown> = {
                                        ...editingMetadata,
                                        timeSpent: minutes
                                      }
                                      if (checkedInAt && minutes > 0) {
                                        newMetadata.checkedOutAt = new Date(new Date(checkedInAt).getTime() + minutes * 60000).toISOString()
                                      } else if (minutes === 0) {
                                        newMetadata.checkedOutAt = ''
                                      }
                                      setEditingMetadata(newMetadata)
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      /* 通常表示モード */
                      <div className="flex-1 min-w-0">
                        <MessageTypeRenderer
                          message={message}
                        />

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
                  {branchingLines.length > 0 && (
                    <div className="ml-4 space-y-2 border-l-2 border-gray-200 pl-3">
                      <div className="flex items-center gap-2 mb-3">
                        <GitBranch className="h-3 w-3 text-emerald-500" />
                        <span className="text-xs text-gray-500">分岐しました（{branchingLines.length}ライン）</span>
                      </div>
                      <div className="space-y-1">
                        {branchingLines.map((line) => {
                          const isCurrentLine = line.id === currentLineId
                          const lastMessageId = line.endMessageId || line.messageIds[line.messageIds.length - 1]
                          const lastMessage = lastMessageId ? messages[lastMessageId] : null
                          const lastMessagePreview = lastMessage?.content ? lastMessage.content.slice(0, 18) + (lastMessage.content.length > 18 ? "..." : "") : ""
                          const firstTagId = line.tagIds?.[0]
                          const firstTag = firstTagId ? tags[firstTagId] : null
                          const relativeTime = line.updated_at ? getRelativeTime(line.updated_at) : (line.created_at ? getRelativeTime(line.created_at) : "")

                          return (
                            <div
                              key={`${message.id}-line-${line.id}`}
                              className={`w-full text-left rounded-lg transition-all duration-200 relative group ${
                                isCurrentLine
                                  ? 'bg-emerald-100 border-2 border-emerald-300 text-emerald-800'
                                  : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent text-gray-700 hover:text-gray-900'
                              }`}
                            >
                              <div
                                onClick={(e) => {
                                  e.stopPropagation()
                                }}
                                onDoubleClick={(e) => {
                                  e.stopPropagation()
                                  onSwitchLine(line.id)
                                }}
                                className="px-3 py-2 w-full cursor-pointer"
                              >
                                <div className="flex items-center gap-2 mb-1">
                                  <div className={`w-1.5 h-1.5 rounded-full border flex-shrink-0 ${
                                    isCurrentLine ? 'bg-emerald-500 border-emerald-500' : 'border-gray-400'
                                  }`}></div>
                                  <span className={`font-medium text-sm truncate ${isCurrentLine ? 'text-emerald-700' : 'text-gray-900'}`}>
                                    {line.name}
                                  </span>
                                  {firstTag && (
                                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                                      isCurrentLine ? 'bg-emerald-200 text-emerald-600' : 'bg-gray-200 text-gray-500'
                                    }`}>
                                      {firstTag.name}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center justify-between gap-3 text-xs">
                                  <span className={`truncate flex-1 ${isCurrentLine ? 'text-emerald-600' : 'text-gray-500'}`}>
                                    {lastMessagePreview}
                                  </span>
                                  <span className={`text-xs flex-shrink-0 ${isCurrentLine ? 'text-emerald-500' : 'text-gray-400'}`}>
                                    {relativeTime}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })}
      <div ref={messagesEndRef} />
    </div>
  )
}

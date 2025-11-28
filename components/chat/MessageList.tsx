/* eslint-disable max-lines */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { GitBranch, ChevronUp } from "lucide-react"
import { MessageItem } from "./MessageItem"
import { getMessageLineInfo } from "./hooks/useMessageLineInfo"
import { MessageDateNavigator } from "./MessageDateNavigator"
import type { Message, Line, Tag } from "@/lib/types"
import type { MessageType } from "@/lib/constants"
import type { PaginationInfo } from "@/hooks/helpers/branch-ancestry"

function ensureDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}

/** 同一グループとみなす時間間隔（ミリ秒） */
const MESSAGE_GROUP_THRESHOLD_MS = 10 * 60 * 1000

/**
 * 前のメッセージと同じグループかどうかを判定
 * - 閾値以内かつ同じ日付
 * - 同じラインに属している
 */
function isSameMessageGroup(
  currentMessage: Message,
  previousMessage: Message | null
): boolean {
  if (!previousMessage) {
    return false
  }
  // 異なるラインのメッセージは別グループ
  if (currentMessage.lineId !== previousMessage.lineId) {
    return false
  }
  const currentDate = ensureDate(currentMessage.timestamp)
  const previousDate = ensureDate(previousMessage.timestamp)
  const diffMs = currentDate.getTime() - previousDate.getTime()
  return diffMs >= 0 && diffMs < MESSAGE_GROUP_THRESHOLD_MS
}

interface Timeline {
  messages: Message[]
  transitions: Array<{ index: number; lineId: string; lineName: string }>
  pagination?: PaginationInfo
}

interface MessageRowActions {
  onStartEdit: (messageId: string) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onDelete: (messageId: string) => void
  onCopy: (messageId: string) => void
  onImageDelete: (messageId: string, imageIndex: number) => void
  onMessageTap: (messageId: string, shiftKey?: boolean) => void
  onSwitchLine: (lineId: string) => void
  onHoverMessage: (messageId: string | null) => void
  onHoverImage: (imageId: string | null) => void
  setEditingContent: (content: string) => void
  setEditingMessageType: (type: MessageType | null) => void
  setEditingMetadata: (metadata: Record<string, unknown>) => void
  setHasSetCursorToEnd: (value: string | null) => void
  isValidImageUrl: (url: string) => boolean
  onUpdateMessage: (messageId: string, updates: Partial<Message>) => Promise<void>
}

interface MessageRowProps {
  message: Message
  index: number
  filteredTimeline: Timeline
  lines: Record<string, Line>
  currentLineId: string
  selectedBaseMessage: string | null
  isSelectionMode: boolean
  selectedMessages: Set<string>
  editingMessageId: string | null
  editingContent: string
  editingMessageType: MessageType | null
  editingMetadata: Record<string, unknown>
  hoveredMessageId: string | null
  hoveredImageId: string | null
  copySuccessMessageId: string | null
  hasSetCursorToEnd: string | null
  registerMessageRef: (messageId: string, element: HTMLDivElement | null) => void
  messages: Record<string, Message>
  tags: Record<string, Tag>
  isUpdating: boolean
  formatDateForSeparator: (date: Date) => string
  isSameDay: (date1: Date, date2: Date) => boolean
  actions: MessageRowActions
  /** グループの先頭メッセージなら時刻を表示 */
  shouldShowTime: boolean
  /** 新しいグループの開始（グループ間のスペース用） */
  isNewGroup: boolean
  isDraggable?: boolean
  onDragStart?: (e: React.DragEvent, messageId: string) => void
  onDragEnd?: (e: React.DragEvent) => void
}

function MessageRow({
  message,
  index,
  filteredTimeline,
  lines,
  currentLineId,
  selectedBaseMessage,
  isSelectionMode,
  selectedMessages,
  editingMessageId,
  editingContent,
  editingMessageType,
  editingMetadata,
  hoveredMessageId,
  hoveredImageId,
  copySuccessMessageId,
  hasSetCursorToEnd,
  registerMessageRef,
  messages,
  tags,
  isUpdating,
  formatDateForSeparator,
  isSameDay,
  actions,
  shouldShowTime,
  isNewGroup,
  isDraggable,
  onDragStart,
  onDragEnd
}: MessageRowProps) {
  const isSelected = selectedBaseMessage === message.id
  const messageLineInfo = getMessageLineInfo(index, filteredTimeline, lines, currentLineId)
  const isLineTransition = messageLineInfo.isLineStart && index > 0

  const previousMessage = index > 0 ? filteredTimeline.messages[index - 1] : null
  const currentMessageDate = ensureDate(message.timestamp)
  const previousMessageDate = previousMessage ? ensureDate(previousMessage.timestamp) : null
  const shouldShowDateSeparator =
    index === 0 || (previousMessageDate && !isSameDay(previousMessageDate, currentMessageDate))

  const messageItemProps = {
    message,
    editingMessageId,
    editingContent,
    editingMessageType,
    editingMetadata,
    hoveredMessageId,
    hoveredImageId,
    copySuccessMessageId,
    hasSetCursorToEnd,
    currentLineId,
    messages,
    tags,
    isUpdating,
    ...actions
  }

  // 新しいグループの開始時は上にスペースを追加（日付セパレーターやライン遷移がある場合は不要）
  const needsGroupSpacing = isNewGroup && !shouldShowDateSeparator && !isLineTransition && index > 0

  return (
    <div
      ref={(element) => registerMessageRef(message.id, element)}
      className={needsGroupSpacing ? "pt-3" : ""}
    >
      {shouldShowDateSeparator && (
        <div className="flex items-center justify-center py-4">
          <div className="rounded-full border bg-gray-100 px-4 py-2 text-sm font-medium text-gray-600">
            {formatDateForSeparator(currentMessageDate)}
          </div>
        </div>
      )}

      {isLineTransition && (
        <div className="-mx-4 flex items-center gap-3 border-l-4 border-blue-400 bg-gradient-to-r from-blue-50 to-transparent px-4 py-3">
          <GitBranch className="h-4 w-4 text-blue-600" />
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
                  <Badge key={tagIndex} variant="secondary" className="bg-blue-100 text-xs text-blue-700">
                    {tag.name}
                  </Badge>
                )
              })}
            </div>
          )}
        </div>
      )}

      <MessageItem
        {...messageItemProps}
        isCurrentLine={messageLineInfo.isCurrentLine}
        isSelected={isSelected}
        isSelectionMode={isSelectionMode}
        isSelectedInBulk={selectedMessages.has(message.id)}
        shouldShowTime={shouldShowTime}
        isDraggable={isDraggable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      />
    </div>
  )
}

interface MessageListProps extends MessageRowActions {
  filteredTimeline: Timeline
  messages: Record<string, Message>
  lines: Record<string, Line>
  tags: Record<string, Tag>
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
  formatDateForSeparator: (date: Date) => string
  isSameDay: (date1: Date, date2: Date) => boolean
  isUpdating: boolean
  isDraggable?: boolean
  onDragStart?: (e: React.DragEvent, messageId: string) => void
  onDragEnd?: (e: React.DragEvent) => void
  onPageChange?: (page: number) => void
}

/**
 * MessageList Component
 *
 * Displays the list of messages with editing, deletion, and interaction features
 */
// eslint-disable-next-line max-lines-per-function
export function MessageList({
  filteredTimeline,
  messages,
  lines,
  tags,
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
  formatDateForSeparator,
  isSameDay,
  isUpdating,
  onUpdateMessage,
  isDraggable,
  onDragStart,
  onDragEnd,
  onPageChange
}: MessageListProps) {
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const dateNavigatorRef = useRef<HTMLDivElement | null>(null)
  const [currentTopDate, setCurrentTopDate] = useState<Date | null>(null)

  const updateTopVisibleMessage = useCallback(() => {
    const container = messagesContainerRef.current
    if (!container) {
      return
    }

    const containerRect = container.getBoundingClientRect()
    const navigatorHeight = dateNavigatorRef.current?.getBoundingClientRect().height ?? 0
    const topBoundary = containerRect.top + navigatorHeight + 16

    let nextDate: Date | null = null

    for (const message of filteredTimeline.messages) {
      const element = messageRefs.current.get(message.id)
      if (!element) {
        continue
      }

      const rect = element.getBoundingClientRect()
      if (rect.bottom > topBoundary) {
        nextDate = ensureDate(message.timestamp)
        break
      }
    }



    setCurrentTopDate((previous) => {
      if (!nextDate) {
        return null
      }

      if (previous && nextDate.toDateString() === previous.toDateString()) {
        return previous
      }

      return nextDate
    })
  }, [filteredTimeline.messages, messagesContainerRef])

  const registerMessageRef = useCallback((messageId: string, element: HTMLDivElement | null) => {
    if (element) {
      messageRefs.current.set(messageId, element)
      return
    }

    messageRefs.current.delete(messageId)
  }, [])

  const calculateTargetScroll = useCallback((element: HTMLDivElement, container: HTMLDivElement) => {
    let totalOffset = 0
    let current: HTMLElement | null = element

    while (current && current !== container) {
      totalOffset += current.offsetTop
      current = current.offsetParent as HTMLElement | null
    }

    // Fallback to bounding rect when offsetParent chain does not reach container
    if (!current) {
      const containerRect = container.getBoundingClientRect()
      const elementRect = element.getBoundingClientRect()
      totalOffset = container.scrollTop + (elementRect.top - containerRect.top)
    }

    const navigatorHeight = dateNavigatorRef.current?.getBoundingClientRect().height ?? 0
    const offset = navigatorHeight + 16

    return Math.max(totalOffset - offset, 0)
  }, [])

  const scrollToMessage = useCallback((messageId: string) => {
    const container = messagesContainerRef.current
    const element = messageRefs.current.get(messageId)
    if (!container || !element) {
      return
    }

    const targetPosition = calculateTargetScroll(element, container)

    if (typeof container.scrollTo === 'function') {
      container.scrollTo({ top: targetPosition, behavior: 'auto' })
      return
    }

    container.scrollTop = targetPosition
  }, [calculateTargetScroll, messagesContainerRef])

  const findMessageIdForDate = useCallback((targetDate: Date) => {
    if (filteredTimeline.messages.length === 0) {
      return null
    }

    const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate())
    const targetTime = startOfDay.getTime()

    for (const message of filteredTimeline.messages) {
      const messageDate = ensureDate(message.timestamp)
      if (Number.isNaN(messageDate.getTime())) {
        continue
      }

      if (messageDate.getTime() >= targetTime) {
        return message.id
      }
    }

    return null
  }, [filteredTimeline.messages])

  const jumpToRelativeDate = useCallback((daysOffset: number, monthOffset: number = 0) => {
    const today = new Date()
    const target = new Date(today)
    if (monthOffset !== 0) {
      target.setMonth(today.getMonth() + monthOffset)
    }
    if (daysOffset !== 0) {
      target.setDate(today.getDate() + daysOffset)
    }
    const messageId = findMessageIdForDate(target)
    if (messageId) {
      scrollToMessage(messageId)
    }
  }, [findMessageIdForDate, scrollToMessage])

  const handleJumpToToday = useCallback(() => jumpToRelativeDate(0), [jumpToRelativeDate])
  const handleJumpToYesterday = useCallback(() => jumpToRelativeDate(-1), [jumpToRelativeDate])
  const handleJumpToLastWeek = useCallback(() => jumpToRelativeDate(-7), [jumpToRelativeDate])
  const handleJumpToLastMonth = useCallback(() => jumpToRelativeDate(0, -1), [jumpToRelativeDate])

  const handleJumpToFirst = useCallback(() => {
    const firstMessage = filteredTimeline.messages[0]
    if (firstMessage) {
      scrollToMessage(firstMessage.id)
    }
  }, [filteredTimeline.messages, scrollToMessage])

  const handleJumpToLast = useCallback(() => {
    const lastMessage = filteredTimeline.messages[filteredTimeline.messages.length - 1]
    if (lastMessage) {
      scrollToMessage(lastMessage.id)
    }
  }, [filteredTimeline.messages, scrollToMessage])

  const handleJumpToSpecificDate = useCallback((date: Date) => {
    const messageId = findMessageIdForDate(date)
    if (messageId) {
      scrollToMessage(messageId)
    }
  }, [findMessageIdForDate, scrollToMessage])

  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) {
      return
    }

    let animationFrame: number | null = null

    const handleScroll = () => {
      if (animationFrame !== null) {
        return
      }

      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = null
        updateTopVisibleMessage()
      })
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    updateTopVisibleMessage()

    return () => {
      container.removeEventListener('scroll', handleScroll)
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame)
      }
    }
  }, [messagesContainerRef, updateTopVisibleMessage])

  useEffect(() => {
    updateTopVisibleMessage()
  }, [filteredTimeline.messages, updateTopVisibleMessage])

  const hasMessages = filteredTimeline.messages.length > 0
  const currentDateLabel = currentTopDate ? formatDateForSeparator(currentTopDate) : null
  const pagination = filteredTimeline.pagination

  const handleLoadOlderMessages = useCallback(() => {
    if (pagination && onPageChange) {
      onPageChange(pagination.currentPage + 1)
    }
  }, [pagination, onPageChange])

  // メッセージグループ情報を事前計算
  const messageGroupInfo = useMemo(() => {
    const info = new Map<string, { shouldShowTime: boolean; isNewGroup: boolean }>()
    let previousMessage: Message | null = null

    for (const message of filteredTimeline.messages) {
      const inSameGroup = isSameMessageGroup(message, previousMessage)

      info.set(message.id, {
        shouldShowTime: !inSameGroup,
        isNewGroup: !inSameGroup
      })

      previousMessage = message
    }

    return info
  }, [filteredTimeline.messages])

  // Debug log to show the last 10 messages with timestamp info
  useEffect(() => {
    if (filteredTimeline.messages.length > 0) {
      const last10Messages = filteredTimeline.messages.slice(-10);
      console.log('DEBUG: Last 10 messages in timeline:');
      console.table(
        last10Messages.map(msg => ({
          id: msg.id,
          content: msg.content.substring(0, 50) + (msg.content.length > 50 ? '...' : ''), // Truncate long content
          createdAt: msg.timestamp,
          updatedAt: msg.updatedAt || 'N/A'
        }))
      );
    }
  }, [filteredTimeline.messages])

  const messageRowActions = useMemo<MessageRowActions>(() => ({
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
    onUpdateMessage
  }), [
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
    onUpdateMessage
  ])

  return (
    <div
      ref={messagesContainerRef}
      className="relative flex-1 overflow-y-auto overflow-x-hidden px-2 pb-32 sm:px-4"
      style={{
        maxWidth: '100%',
        WebkitOverflowScrolling: 'touch',
        touchAction: 'pan-y'
      }}
    >
      <div className="pointer-events-none sticky top-0 z-20 -mx-2 bg-gradient-to-b from-white via-white/95 to-transparent px-2 pb-4 pt-3 sm:-mx-4 sm:px-4">
        <div ref={dateNavigatorRef} className="pointer-events-auto flex justify-center">
          <MessageDateNavigator
            label={currentDateLabel}
            disabled={!hasMessages}
            onJumpToToday={handleJumpToToday}
            onJumpToYesterday={handleJumpToYesterday}
            onJumpToLastWeek={handleJumpToLastWeek}
            onJumpToLastMonth={handleJumpToLastMonth}
            onJumpToFirst={handleJumpToFirst}
            onJumpToLast={handleJumpToLast}
            onJumpToSpecificDate={handleJumpToSpecificDate}
          />
        </div>
      </div>

      <div className="space-y-2 pt-4" style={{ maxWidth: '100%', wordBreak: 'break-word' }}>
        {/* ページネーション：古いメッセージを読み込むボタン */}
        {pagination?.hasOlderMessages && (
          <div className="flex justify-center pb-4">
            <Button
              variant="outline"
              size="sm"
              onClick={handleLoadOlderMessages}
              className="gap-2 text-gray-600 hover:text-gray-900"
            >
              <ChevronUp className="h-4 w-4" />
              <span>
                古いメッセージを表示
                <span className="ml-1 text-xs text-gray-400">
                  ({pagination.totalFilteredMessages - pagination.pageSize * pagination.currentPage}件)
                </span>
              </span>
            </Button>
          </div>
        )}

        {filteredTimeline.messages.map((message, index) => {
          const groupInfo = messageGroupInfo.get(message.id) ?? { shouldShowTime: true, isNewGroup: true }
          return (
            <MessageRow
              key={message.id}
              message={message}
              index={index}
              filteredTimeline={filteredTimeline}
              lines={lines}
              currentLineId={currentLineId}
              selectedBaseMessage={selectedBaseMessage}
              isSelectionMode={isSelectionMode}
              selectedMessages={selectedMessages}
              editingMessageId={editingMessageId}
              editingContent={editingContent}
              editingMessageType={editingMessageType}
              editingMetadata={editingMetadata}
              hoveredMessageId={hoveredMessageId}
              hoveredImageId={hoveredImageId}
              copySuccessMessageId={copySuccessMessageId}
              hasSetCursorToEnd={hasSetCursorToEnd}
              registerMessageRef={registerMessageRef}
              messages={messages}
              tags={tags}
              isUpdating={isUpdating}
              formatDateForSeparator={formatDateForSeparator}
              isSameDay={isSameDay}
              shouldShowTime={groupInfo.shouldShowTime}
              isNewGroup={groupInfo.isNewGroup}
              isDraggable={isDraggable && (message.lineId === currentLineId || selectedMessages.has(message.id))}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              actions={messageRowActions}
            />
          )
        })}
      </div>

      <div ref={messagesEndRef} />
    </div>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { GitBranch } from "lucide-react"
import { MessageItem } from "./MessageItem"
import { getMessageLineInfo } from "./hooks/useMessageLineInfo"
import { MessageDateNavigator } from "./MessageDateNavigator"
import type { Message, Line, Tag, BranchPoint } from "@/lib/types"
import type { MessageType } from "@/lib/constants"

function ensureDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}

interface Timeline {
  messages: Message[]
  transitions: Array<{ index: number; lineId: string; lineName: string }>
}

interface MessageRowActions {
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
  getBranchingLines: (messageId: string) => Line[]
  messages: Record<string, Message>
  tags: Record<string, Tag>
  isUpdating: boolean
  formatDateForSeparator: (date: Date) => string
  isSameDay: (date1: Date, date2: Date) => boolean
  getRelativeTime: (dateString: string) => string
  actions: MessageRowActions
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
  getBranchingLines,
  messages,
  tags,
  isUpdating,
  formatDateForSeparator,
  isSameDay,
  getRelativeTime,
  actions
}: MessageRowProps) {
  const branchingLines = getBranchingLines(message.id)
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
    branchingLines,
    currentLineId,
    messages,
    tags,
    isUpdating,
    getRelativeTime,
    ...actions
  }

  return (
    <div
      ref={(element) => registerMessageRef(message.id, element)}
      className="space-y-4"
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
      />
    </div>
  )
}

interface MessageListProps extends MessageRowActions {
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
  isUpdating,
  onUpdateMessage
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

    if (!nextDate && filteredTimeline.messages.length > 0) {
      const fallback = filteredTimeline.messages[filteredTimeline.messages.length - 1]
      nextDate = ensureDate(fallback.timestamp)
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
      container.scrollTo({ top: targetPosition, behavior: 'smooth' })
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

    return filteredTimeline.messages[filteredTimeline.messages.length - 1]?.id ?? null
  }, [filteredTimeline.messages])

  const handleJumpToYesterday = useCallback(() => {
    const today = new Date()
    const target = new Date(today)
    target.setDate(today.getDate() - 1)
    const messageId = findMessageIdForDate(target)
    if (messageId) {
      scrollToMessage(messageId)
    }
  }, [findMessageIdForDate, scrollToMessage])

  const handleJumpToLastWeek = useCallback(() => {
    const today = new Date()
    const target = new Date(today)
    target.setDate(today.getDate() - 7)
    const messageId = findMessageIdForDate(target)
    if (messageId) {
      scrollToMessage(messageId)
    }
  }, [findMessageIdForDate, scrollToMessage])

  const handleJumpToLastMonth = useCallback(() => {
    const today = new Date()
    const target = new Date(today)
    target.setMonth(today.getMonth() - 1)
    const messageId = findMessageIdForDate(target)
    if (messageId) {
      scrollToMessage(messageId)
    }
  }, [findMessageIdForDate, scrollToMessage])

  const handleJumpToFirst = useCallback(() => {
    const firstMessage = filteredTimeline.messages[0]
    if (firstMessage) {
      scrollToMessage(firstMessage.id)
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
      className="relative flex-1 overflow-y-auto overflow-x-hidden px-2 pb-80 sm:px-4"
      style={{ width: '100%', maxWidth: '100vw', boxSizing: 'border-box' }}
    >
      <div className="pointer-events-none sticky top-0 z-20 -mx-2 bg-gradient-to-b from-white via-white/95 to-transparent px-2 pb-4 pt-3 sm:-mx-4 sm:px-4">
        <div ref={dateNavigatorRef} className="pointer-events-auto flex justify-center">
          <MessageDateNavigator
            label={currentDateLabel}
            disabled={!hasMessages}
            onJumpToYesterday={handleJumpToYesterday}
            onJumpToLastWeek={handleJumpToLastWeek}
            onJumpToLastMonth={handleJumpToLastMonth}
            onJumpToFirst={handleJumpToFirst}
            onJumpToSpecificDate={handleJumpToSpecificDate}
          />
        </div>
      </div>

      <div className="space-y-8 pt-4">
        {filteredTimeline.messages.map((message, index) => (
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
            getBranchingLines={getBranchingLines}
            messages={messages}
            tags={tags}
            isUpdating={isUpdating}
            formatDateForSeparator={formatDateForSeparator}
            isSameDay={isSameDay}
            getRelativeTime={getRelativeTime}
            actions={messageRowActions}
          />
        ))}
      </div>

      <div ref={messagesEndRef} />
    </div>
  )
}

"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { HamburgerMenu } from "@/components/hamburger-menu"
import { RecentLinesFooter } from "@/components/recent-lines-footer"
import { BranchSelector } from "./BranchSelector"
import { ChatHeader } from "./ChatHeader"
import { LineEditDialog } from "./LineEditDialog"
import { MessageList } from "./MessageList"
import { MessageInput } from "./MessageInput"
import { MessageDeleteDialog } from "./MessageDeleteDialog"
import { MessageMoveDialog } from "./MessageMoveDialog"
import { useChatState } from "@/hooks/use-chat-state"
import { useMessageOperations } from "@/hooks/use-message-operations"
import { useBranchOperations } from "@/hooks/use-branch-operations"
import type { Message, Line, BranchPoint, Tag } from "@/lib/types"
import { TIMELINE_BRANCH_ID } from "@/lib/constants"
import { DATE_TODAY, DATE_YESTERDAY, WEEKDAY_NAMES } from "@/lib/ui-strings"

interface ChatContainerProps {
  initialMessages?: Record<string, Message>
  initialLines?: Record<string, Line>
  initialBranchPoints?: Record<string, BranchPoint>
  initialTags?: Record<string, Tag>
  initialCurrentLineId?: string
  onLineChange?: (lineId: string) => void
  onNewLineCreated?: (lineId: string, lineName: string) => void
}

/**
 * ChatContainer Component
 *
 * Main container that integrates all hooks and components
 */
export function ChatContainer({
  initialMessages = {},
  initialLines = {},
  initialBranchPoints = {},
  initialTags = {},
  initialCurrentLineId = '',
  onLineChange,
  onNewLineCreated
}: ChatContainerProps) {
  // Refs
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // UI State
  const [inputValue, setInputValue] = useState("")
  const [pendingImages, setPendingImages] = useState<string[]>([])
  const [selectedBaseMessage, setSelectedBaseMessage] = useState<string | null>(null)
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null)
  const [hoveredImageId, setHoveredImageId] = useState<string | null>(null)

  // Initialize hooks
  const chatState = useChatState({
    initialMessages,
    initialLines,
    initialBranchPoints,
    initialTags,
    initialCurrentLineId
  })

  // Scroll to bottom callback
  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'instant' })
    }
  }, [])

  // Message operations hook
  const messageOps = useMessageOperations({
    chatState,
    onCacheInvalidate: chatState.clearAllCaches,
    onScrollToBottom: scrollToBottom
  })

  // Branch operations hook
  const branchOps = useBranchOperations({
    chatState,
    messagesContainerRef,
    selectedBaseMessage,
    setSelectedBaseMessage,
    onLineChange,
    onNewLineCreated
  })

  // Textarea auto-resize
  const adjustTextareaHeight = useCallback(() => {
    if (textareaRef.current) {
      const textarea = textareaRef.current
      textarea.style.height = 'auto'
      const newHeight = Math.min(Math.max(textarea.scrollHeight, 80), 128)
      textarea.style.height = `${newHeight}px`
    }
  }, [])

  // Image paste handler
  const handlePaste = useCallback(async (e: ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) {
          try {
            const imageUrl = await messageOps.handleImageFile(file)
            setPendingImages(prev => [...prev, imageUrl])
          } catch (error) {
            console.error('Failed to handle pasted image:', error)
            alert('画像の処理に失敗しました')
          }
        }
      }
    }
  }, [messageOps])

  // Utility functions
  const getRelativeTime = (dateString: string): string => {
    if (!dateString) return ""

    const now = new Date()
    const date = new Date(dateString)

    if (isNaN(date.getTime())) return ""

    const diffMs = now.getTime() - date.getTime()
    const diffMinutes = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffMinutes < 1) return "今"
    if (diffMinutes < 60) return `${diffMinutes}分前`
    if (diffHours < 24) return `${diffHours}時間前`
    if (diffDays < 30) return `${diffDays}日前`

    const diffMonths = Math.floor(diffDays / 30)
    return `${diffMonths}ヶ月前`
  }

  const formatDateForSeparator = (date: Date): string => {
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)

    const messageDate = new Date(date)

    if (messageDate.toDateString() === today.toDateString()) {
      return DATE_TODAY
    }

    if (messageDate.toDateString() === yesterday.toDateString()) {
      return DATE_YESTERDAY
    }

    const year = messageDate.getFullYear()
    const month = messageDate.getMonth() + 1
    const day = messageDate.getDate()
    const weekday = WEEKDAY_NAMES[messageDate.getDay()]

    const currentYear = today.getFullYear()
    if (year === currentYear) {
      return `${month}月${day}日 (${weekday})`
    }

    return `${year}年${month}月${day}日 (${weekday})`
  }

  const isSameDay = (date1: Date, date2: Date): boolean => {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    )
  }

  // Send message handler
  const handleSendMessage = async () => {
    if (!inputValue.trim() && pendingImages.length === 0) return

    // タイムライン仮想ブランチの場合はメインラインに投稿
    let actualTargetLineId = chatState.currentLineId
    if (chatState.currentLineId === TIMELINE_BRANCH_ID) {
      const mainLine = Object.values(chatState.lines).find(line => line.id === 'main')
      if (!mainLine) {
        alert('メインラインが見つかりません')
        return
      }
      actualTargetLineId = mainLine.id
    }

    await messageOps.handleSendMessage(
      inputValue,
      pendingImages,
      selectedBaseMessage,
      actualTargetLineId,
      branchOps.completeTimeline
    )

    // Clear input state
    setInputValue("")
    setPendingImages([])
    setSelectedBaseMessage(null)

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = '80px'
    }

    // Update footer on new line creation
    if (selectedBaseMessage && onNewLineCreated) {
      branchOps.setFooterKey(prev => prev + 1)
    }
  }

  // Effects
  useEffect(() => {
    adjustTextareaHeight()
  }, [inputValue, adjustTextareaHeight])

  useEffect(() => {
    const pasteHandler = (e: Event) => {
      handlePaste(e as ClipboardEvent)
    }
    document.addEventListener('paste', pasteHandler)
    return () => {
      document.removeEventListener('paste', pasteHandler)
    }
  }, [handlePaste])

  useEffect(() => {
    scrollToBottom()
  }, [branchOps.completeTimeline.messages.length, scrollToBottom])

  // Get current line info
  const currentLineInfo = branchOps.getCurrentLine()

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Hamburger Menu */}
      <HamburgerMenu>
        <div className="space-y-4">
          {/* メッセージ選択ツール */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">メッセージ操作</h3>
            <div className="space-y-2">
              <button
                onClick={branchOps.handleToggleSelectionMode}
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                  branchOps.isSelectionMode
                    ? 'bg-blue-100 text-blue-900 border border-blue-200'
                    : 'hover:bg-gray-100 text-gray-700 border border-gray-200'
                }`}
                disabled={branchOps.isUpdating || messageOps.isUpdating}
              >
                {branchOps.isSelectionMode ? '選択モード終了' : 'メッセージ選択モード'}
              </button>
              {branchOps.selectedMessages.size > 0 && (
                <div className="space-y-1">
                  <button
                    onClick={branchOps.handleMoveMessages}
                    className="w-full text-left px-3 py-2 rounded-md text-sm bg-blue-500 hover:bg-blue-600 text-white transition-colors"
                    disabled={branchOps.isUpdating || messageOps.isUpdating}
                  >
                    {branchOps.selectedMessages.size}件を別ラインに移動
                  </button>
                  <button
                    onClick={() => branchOps.setSelectedMessages(new Set())}
                    className="w-full text-left px-3 py-2 rounded-md text-sm border border-gray-200 hover:bg-gray-100 text-gray-700 transition-colors"
                    disabled={branchOps.isUpdating || messageOps.isUpdating}
                  >
                    選択解除
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ライン管理 */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">ライン管理</h3>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {Object.values(chatState.lines).map((line) => {
                const isActive = line.id === chatState.currentLineId
                return (
                  <button
                    key={line.id}
                    onClick={() => branchOps.switchToLine(line.id)}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                      isActive
                        ? 'bg-blue-100 text-blue-900 border border-blue-200'
                        : 'hover:bg-gray-100 text-gray-700'
                    }`}
                  >
                    <div className="font-medium truncate">{line.name}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {line.messageIds.length}件のメッセージ
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </HamburgerMenu>

      {/* Branch Selector (Timeline Minimap + Filters) */}
      <BranchSelector
        completeTimeline={branchOps.completeTimeline}
        currentLine={currentLineInfo}
        filterMessageType={chatState.filterMessageType}
        filterTag={chatState.filterTag}
        searchKeyword={chatState.searchKeyword}
        tags={chatState.tags}
        lines={chatState.lines}
        getLineAncestry={branchOps.getLineAncestry}
        onSwitchLine={branchOps.switchToLine}
        onFilterTypeChange={chatState.setFilterMessageType}
        onFilterTagChange={chatState.setFilterTag}
        onSearchChange={chatState.setSearchKeyword}
      />

      {/* Current Line Header or Line Edit Dialog */}
      {branchOps.isEditingBranch ? (
        <LineEditDialog
          isOpen={branchOps.isEditingBranch}
          currentLine={currentLineInfo}
          editingBranchData={branchOps.editingBranchData}
          tags={chatState.tags}
          messages={chatState.messages}
          onSave={branchOps.handleSaveLineEdit}
          onCancel={() => branchOps.setIsEditingBranch(false)}
          onAddTag={branchOps.handleAddTag}
          onRemoveTag={branchOps.handleRemoveTag}
          onDataChange={branchOps.setEditingBranchData}
        />
      ) : (
        <ChatHeader
          currentLine={currentLineInfo}
          messages={chatState.messages}
          tags={chatState.tags}
          onEditLine={branchOps.handleEditLine}
        />
      )}

      {/* Messages List */}
      <MessageList
        filteredTimeline={branchOps.filteredTimeline}
        messages={chatState.messages}
        lines={chatState.lines}
        tags={chatState.tags}
        branchPoints={chatState.branchPoints}
        currentLineId={chatState.currentLineId}
        selectedBaseMessage={selectedBaseMessage}
        editingMessageId={messageOps.editingMessageId}
        editingContent={messageOps.editingContent}
        editingMessageType={messageOps.editingMessageType}
        editingMetadata={messageOps.editingMetadata}
        hoveredMessageId={hoveredMessageId}
        hoveredImageId={hoveredImageId}
        copySuccessMessageId={messageOps.copySuccessMessageId}
        isSelectionMode={branchOps.isSelectionMode}
        selectedMessages={branchOps.selectedMessages}
        hasSetCursorToEnd={messageOps.hasSetCursorToEnd}
        messagesContainerRef={messagesContainerRef}
        messagesEndRef={messagesEndRef}
        onStartEdit={messageOps.handleStartEdit}
        onSaveEdit={messageOps.handleSaveEdit}
        onCancelEdit={messageOps.handleCancelEdit}
        onDelete={messageOps.handleDeleteMessage}
        onCopy={messageOps.handleCopyMessage}
        onImageDelete={messageOps.handleDeleteImage}
        onMessageTap={branchOps.handleMessageTap}
        onSwitchLine={branchOps.switchToLine}
        onHoverMessage={setHoveredMessageId}
        onHoverImage={setHoveredImageId}
        setEditingContent={messageOps.setEditingContent}
        setEditingMessageType={messageOps.setEditingMessageType}
        setEditingMetadata={messageOps.setEditingMetadata}
        setHasSetCursorToEnd={messageOps.setHasSetCursorToEnd}
        isValidImageUrl={messageOps.isValidImageUrl}
        getRelativeTime={getRelativeTime}
        formatDateForSeparator={formatDateForSeparator}
        isSameDay={isSameDay}
        getBranchingLines={branchOps.getBranchingLines}
        isUpdating={branchOps.isUpdating || messageOps.isUpdating}
      />

      {/* Composer or Selection Toolbar */}
      <div className="fixed bottom-28 left-0 right-0 p-2 sm:p-4 border-t border-gray-100 bg-white z-10">
        {(branchOps.isSelectionMode || branchOps.selectedMessages.size > 0) ? (
          /* Selection Toolbar */
          <div className="bg-yellow-50 -m-2 sm:-m-4 p-2 sm:p-4 border-t border-yellow-200">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-700">
                  {branchOps.selectedMessages.size > 0 ? `${branchOps.selectedMessages.size}件選択中` : '選択モード'}
                </span>
                {branchOps.selectedMessages.size > 0 && (
                  <Button
                    onClick={branchOps.handleMoveMessages}
                    size="sm"
                    className="bg-blue-500 hover:bg-blue-600 text-white"
                    disabled={branchOps.isUpdating}
                  >
                    別ラインに移動
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                {branchOps.selectedMessages.size > 0 && (
                  <Button
                    onClick={() => branchOps.setSelectedMessages(new Set())}
                    size="sm"
                    variant="outline"
                    disabled={branchOps.isUpdating}
                  >
                    選択解除
                  </Button>
                )}
                <Button
                  onClick={branchOps.handleToggleSelectionMode}
                  size="sm"
                  variant={branchOps.isSelectionMode ? "default" : "outline"}
                  disabled={branchOps.isUpdating}
                >
                  {branchOps.isSelectionMode ? '選択完了' : '選択モード'}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          /* Message Input */
          <MessageInput
            inputValue={inputValue}
            pendingImages={pendingImages}
            selectedBaseMessage={selectedBaseMessage}
            currentLineId={chatState.currentLineId}
            currentLine={currentLineInfo}
            messages={chatState.messages}
            isUpdating={branchOps.isUpdating || messageOps.isUpdating}
            textareaRef={textareaRef}
            onInputChange={setInputValue}
            onSend={handleSendMessage}
            onPaste={handlePaste}
            onImageAdd={messageOps.handleImageFile}
            onImageRemove={(index) => setPendingImages(prev => prev.filter((_, i) => i !== index))}
            onBaseMessageClear={() => setSelectedBaseMessage(null)}
            onPendingImagesClear={() => setPendingImages([])}
            adjustTextareaHeight={adjustTextareaHeight}
            getRelativeTime={getRelativeTime}
          />
        )}
      </div>

      {/* Recent Lines Footer */}
      <RecentLinesFooter
        key={branchOps.footerKey}
        lines={chatState.lines}
        messages={chatState.messages}
        currentLineId={chatState.currentLineId}
        branchPoints={chatState.branchPoints}
        onLineSelect={branchOps.switchToLine}
      />

      {/* Message Move Dialog */}
      <MessageMoveDialog
        isOpen={branchOps.showMoveDialog}
        selectedMessagesCount={branchOps.selectedMessages.size}
        currentLineId={chatState.currentLineId}
        lines={chatState.lines}
        tags={chatState.tags}
        isUpdating={branchOps.isUpdating}
        onConfirm={branchOps.handleConfirmMove}
        onCancel={() => branchOps.setShowMoveDialog(false)}
      />

      {/* Message Delete Dialog */}
      <MessageDeleteDialog
        isOpen={Boolean(messageOps.deleteConfirmation)}
        message={messageOps.deleteConfirmation?.message || null}
        messageId={messageOps.deleteConfirmation?.messageId || null}
        branchPoints={chatState.branchPoints}
        isUpdating={messageOps.isUpdating}
        onConfirm={messageOps.handleConfirmDelete}
        onCancel={() => messageOps.setDeleteConfirmation(null)}
      />
    </div>
  )
}

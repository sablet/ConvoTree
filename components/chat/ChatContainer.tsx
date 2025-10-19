"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { HamburgerMenu } from "@/components/hamburger-menu"
import { RecentLinesFooter } from "@/components/recent-lines-footer"
import { BranchSelector } from "./BranchSelector"
import { ChatHeader } from "./ChatHeader"
import { LineEditDialog } from "./LineEditDialog"
import { MessageList } from "./MessageList"
import { MessageInput } from "./MessageInput"
import { MessageDeleteDialog } from "./MessageDeleteDialog"
import { MessageMoveDialog } from "./MessageMoveDialog"
import { SelectionToolbar } from "./SelectionToolbar"
import { InsertMessageInput } from "./InsertMessageInput"
import { useChatState } from "@/hooks/use-chat-state"
import { useMessageOperations } from "@/hooks/use-message-operations"
import { useBranchOperations } from "@/hooks/use-branch-operations"
import { useInputOperations } from "@/hooks/use-input-operations"
import type { Message, Line, BranchPoint, Tag } from "@/lib/types"
import { getRelativeTime, formatDateForSeparator, isSameDay } from "@/lib/utils"
import { useLineConnection } from "./use-line-connection"
import { useMessageInsert } from "./use-message-insert"

interface ChatContainerProps {
  initialMessages?: Record<string, Message>
  initialLines?: Record<string, Line>
  initialBranchPoints?: Record<string, BranchPoint>
  initialTags?: Record<string, Tag>
  initialCurrentLineId?: string
  onLineChange?: (lineId: string) => void
}

/** Main container that integrates all hooks and components */
export function ChatContainer({
  initialMessages = {},
  initialLines = {},
  initialBranchPoints = {},
  initialTags = {},
  initialCurrentLineId = '',
  onLineChange
}: ChatContainerProps) {
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null)
  const [hoveredImageId, setHoveredImageId] = useState<string | null>(null)
  const [showInsertMode, setShowInsertMode] = useState<boolean>(false)
  const [showLineConnectionDialog, setShowLineConnectionDialog] = useState<boolean>(false)
  const chatState = useChatState({
    initialMessages,
    initialLines,
    initialBranchPoints,
    initialTags,
    initialCurrentLineId
  })
  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'instant' })
    }
  }, [])
  const messageOps = useMessageOperations({
    chatState,
    onCacheInvalidate: chatState.clearAllCaches,
    onScrollToBottom: scrollToBottom
  })
  const [selectedBaseMessage, setSelectedBaseMessage] = useState<string | null>(null)
  const branchOps = useBranchOperations({
    chatState,
    messagesContainerRef,
    selectedBaseMessage,
    setSelectedBaseMessage,
    onLineChange
  })
  const inputOps = useInputOperations({
    messageOps,
    branchOps,
    currentLineId: chatState.currentLineId,
    lines: chatState.lines
  })
  const { handleLineConnect, isConnectingLine } = useLineConnection({
    lines: chatState.lines,
    currentLineId: chatState.currentLineId,
    setLines: chatState.setLines,
    clearAllCaches: chatState.clearAllCaches,
    clearTimelineCaches: branchOps.clearTimelineCaches
  })
  const { handleInsertMessage } = useMessageInsert({
    currentLineId: chatState.currentLineId,
    timelineMessages: branchOps.completeTimeline.messages,
    handleCreateMessageWithTimestamp: messageOps.handleCreateMessageWithTimestamp,
    setMessages: chatState.setMessages,
    clearTimelineCaches: branchOps.clearTimelineCaches
  })
  const handleLineConnectAndClose = useCallback(async (targetLineId: string) => {
    const success = await handleLineConnect(targetLineId)
    if (success) setShowLineConnectionDialog(false)
  }, [handleLineConnect])
  useEffect(() => {
    scrollToBottom()
  }, [branchOps.completeTimeline.messages.length, scrollToBottom])
  const currentLineInfo = branchOps.getCurrentLine()

  return (
    <div className="flex flex-col h-screen bg-white">
      <HamburgerMenu />
      <BranchSelector
        completeTimeline={branchOps.completeTimeline}
        currentLine={currentLineInfo}
        filterMessageType={chatState.filterMessageType}
        filterTaskCompleted={chatState.filterTaskCompleted}
        filterDateStart={chatState.filterDateStart}
        filterDateEnd={chatState.filterDateEnd}
        filterTag={chatState.filterTag}
        searchKeyword={chatState.searchKeyword}
        tags={chatState.tags}
        lines={chatState.lines}
        getLineAncestry={branchOps.getLineAncestry}
        onSwitchLine={branchOps.switchToLine}
        onFilterTypeChange={chatState.setFilterMessageType}
        onFilterTaskCompletedChange={chatState.setFilterTaskCompleted}
        onFilterDateStartChange={chatState.setFilterDateStart}
        onFilterDateEndChange={chatState.setFilterDateEnd}
        onFilterTagChange={chatState.setFilterTag}
        onSearchChange={chatState.setSearchKeyword}
      />
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
          onToggleSelectionMode={branchOps.handleToggleSelectionMode}
          onToggleInsertMode={() => setShowInsertMode(prev => !prev)}
          onToggleLineConnection={() => setShowLineConnectionDialog(prev => !prev)}
          isSelectionMode={branchOps.isSelectionMode}
        />
      )}
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
        onUpdateMessage={messageOps.handleUpdateMessage}
      />
      <div className="fixed bottom-28 left-0 right-0 p-2 sm:p-4 border-t border-gray-100 bg-white z-10">
        {showInsertMode ? (
          <InsertMessageInput
            messages={chatState.messages}
            currentLineId={chatState.currentLineId}
            onInsertMessage={handleInsertMessage}
            onCancel={() => setShowInsertMode(false)}
          />
        ) : (branchOps.isSelectionMode || branchOps.selectedMessages.size > 0) ? (
          <SelectionToolbar
            isSelectionMode={branchOps.isSelectionMode}
            selectedMessagesCount={branchOps.selectedMessages.size}
            isUpdating={branchOps.isUpdating}
            onToggleSelectionMode={branchOps.handleToggleSelectionMode}
            onToggleInsertMode={() => setShowInsertMode(prev => !prev)}
            onMoveMessages={branchOps.handleMoveMessages}
            onClearSelection={() => branchOps.setSelectedMessages(new Set())}
          />
        ) : (
          <MessageInput
            inputValue={inputOps.inputValue}
            pendingImages={inputOps.pendingImages}
            selectedBaseMessage={selectedBaseMessage}
            currentLineId={chatState.currentLineId}
            currentLine={currentLineInfo}
            messages={chatState.messages}
            isUpdating={branchOps.isUpdating || messageOps.isUpdating}
            textareaRef={inputOps.textareaRef}
            onInputChange={inputOps.setInputValue}
            onSend={inputOps.handleSendMessage}
            onPaste={inputOps.handlePaste}
            onImageAdd={messageOps.handleImageFile}
            onImageRemove={(index) => inputOps.setPendingImages(prev => prev.filter((_, i) => i !== index))}
            onBaseMessageClear={() => inputOps.setSelectedBaseMessage(null)}
            onPendingImagesClear={() => inputOps.setPendingImages([])}
            adjustTextareaHeight={inputOps.adjustTextareaHeight}
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
        mode="message-move"
        selectedMessagesCount={branchOps.selectedMessages.size}
        currentLineId={chatState.currentLineId}
        lines={chatState.lines}
        tags={chatState.tags}
        isUpdating={branchOps.isUpdating}
        getLineAncestry={branchOps.getLineAncestry}
        onConfirm={branchOps.handleConfirmMove}
        onCreateNewLine={branchOps.handleCreateNewLineAndMove}
        onCancel={() => branchOps.setShowMoveDialog(false)}
      />

      {/* Line Connection Dialog */}
      <MessageMoveDialog
        isOpen={showLineConnectionDialog}
        mode="line-connection"
        currentLineId={chatState.currentLineId}
        lines={chatState.lines}
        tags={chatState.tags}
        isUpdating={isConnectingLine}
        getLineAncestry={branchOps.getLineAncestry}
        onConfirm={handleLineConnectAndClose}
        onCancel={() => setShowLineConnectionDialog(false)}
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

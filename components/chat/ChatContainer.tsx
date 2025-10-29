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
import { BulkDeleteDialog } from "./BulkDeleteDialog"
import { SelectionToolbar } from "./SelectionToolbar"
import { InsertMessageInput } from "./InsertMessageInput"
import { LineSidebar } from "./LineSidebar"
import { useChatState } from "@/hooks/use-chat-state"
import { useMessageOperations } from "@/hooks/use-message-operations"
import { useBranchOperations } from "@/hooks/use-branch-operations"
import { useInputOperations } from "@/hooks/use-input-operations"
import { useMessageDragDrop } from "@/hooks/use-message-drag-drop"
import { useWindowWidth } from "@/hooks/use-window-width"
import { useDeviceType } from "@/hooks/use-device-type"
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
  
  // Window width detection for sidebar visibility
  const { shouldShowSidebar } = useWindowWidth()
  
  // Device type detection for drag-drop
  const deviceType = useDeviceType()
  const isDesktop = deviceType === 'desktop'
  
  // Drag and drop operations
  const dragDropOps = useMessageDragDrop({
    messages: chatState.messages,
    setMessages: chatState.setMessages,
    lines: chatState.lines,
    setLines: chatState.setLines,
    clearAllCaches: chatState.clearAllCaches,
    currentLineId: chatState.currentLineId,
    selectedMessages: branchOps.selectedMessages,
    isSelectionMode: branchOps.isSelectionMode
  })
  
  useEffect(() => {
    scrollToBottom()
  }, [branchOps.completeTimeline.messages.length, scrollToBottom])
  const currentLineInfo = branchOps.getCurrentLine()

  return (
    <div className="flex h-screen bg-white overflow-hidden">
      {/* Line Sidebar - Visible when window width >= sidebar width * 2 */}
      <LineSidebar
        lines={chatState.lines}
        messages={chatState.messages}
        tags={chatState.tags}
        currentLineId={chatState.currentLineId}
        isVisible={shouldShowSidebar}
        getLineAncestry={branchOps.getLineAncestry}
        onLineSelect={branchOps.switchToLine}
        onDrop={dragDropOps.handleDrop}
        onCreateLine={branchOps.handleCreateLine}
        setLines={chatState.setLines}
        clearAllCaches={chatState.clearAllCaches}
      />
      
      {/* Main Content - Force width to prevent flex item overflow */}
      <div className="relative flex flex-col flex-1 overflow-hidden" style={{ minWidth: 0, maxWidth: '100%', width: 0 }}>
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
          lines={chatState.lines}
          tags={chatState.tags}
          getLineAncestry={branchOps.getLineAncestry}
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
        isDraggable={isDesktop}
        onDragStart={isDesktop ? dragDropOps.handleDragStart : undefined}
        onDragEnd={isDesktop ? dragDropOps.handleDragEnd : undefined}
      />

      {/* Input Area - Fixed at bottom */}
      <div className="border-t border-gray-100 bg-white p-2 sm:p-4 shrink-0">
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
            onDeleteMessages={branchOps.handleDeleteMessages}
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

      {/* Recent Lines Footer - Fixed at bottom */}
      <div className="border-t border-gray-200 bg-white shrink-0">
        <RecentLinesFooter
          key={branchOps.footerKey}
          lines={chatState.lines}
          messages={chatState.messages}
          currentLineId={chatState.currentLineId}
          branchPoints={chatState.branchPoints}
          onLineSelect={branchOps.switchToLine}
        />
      </div>

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

      {/* Bulk Delete Dialog */}
      <BulkDeleteDialog
        isOpen={branchOps.showBulkDeleteDialog}
        selectedMessagesCount={branchOps.selectedMessages.size}
        isUpdating={branchOps.isUpdating}
        onConfirm={branchOps.handleConfirmBulkDelete}
        onCancel={() => branchOps.setShowBulkDeleteDialog(false)}
      />
      </div>
    </div>
  )
}

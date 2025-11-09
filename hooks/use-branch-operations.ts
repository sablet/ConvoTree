import { useState, useCallback } from 'react'
import type { Line } from '@/lib/types'
import type { ChatState } from './use-chat-state'
import type { ChatRepository } from '@/lib/repositories/chat-repository'
import { TIMELINE_BRANCH_ID } from '@/lib/constants'
import type { LineAncestryResult } from './helpers/branch-ancestry'
import { useMessageMove } from './helpers/use-message-move'
import { useTimelineOperations } from './helpers/use-timeline-operations'
import { useLineCrud } from './helpers/use-line-crud'
import { useLineEditing } from './helpers/use-line-editing'
import { useScrollPosition } from './helpers/use-scroll-position'

interface BranchOperationsProps {
  chatState: ChatState
  messagesContainerRef: React.RefObject<HTMLDivElement>
  selectedBaseMessage: string | null
  setSelectedBaseMessage: React.Dispatch<React.SetStateAction<string | null>>
  onLineChange?: (lineId: string) => void
  chatRepository: ChatRepository
}


interface BranchOperations {
  // ライン切り替え
  switchToLine: (lineId: string) => void
  getCurrentLine: () => Line | null

  // タイムライン・パス計算
  getBranchingLines: (messageId: string) => Line[]
  getLineAncestry: (lineId: string) => string[]
  getOptimizedPath: (lineId: string) => LineAncestryResult
  getCompleteTimeline: () => LineAncestryResult
  completeTimeline: LineAncestryResult
  filteredTimeline: LineAncestryResult
  clearTimelineCaches: () => void

  // スクロール位置管理
  scrollPositions: Map<string, number>
  saveScrollPosition: (lineId: string) => void
  restoreScrollPosition: (lineId: string) => void

  // ライン編集
  isEditingBranch: boolean
  editingBranchData: { name: string; tagIds: string[]; newTag: string }
  handleEditLine: () => void
  handleSaveLineEdit: () => Promise<void>
  handleAddTag: () => void
  handleRemoveTag: (tagIndex: number) => void
  setIsEditingBranch: React.Dispatch<React.SetStateAction<boolean>>
  setEditingBranchData: React.Dispatch<React.SetStateAction<{ name: string; tagIds: string[]; newTag: string }>>
  handleCreateLine: (lineName: string, parentLineId?: string) => Promise<string>
  handleDeleteLine: (lineId: string) => Promise<void>

  // メッセージタップ処理
  selectedBaseMessage: string | null
  setSelectedBaseMessage: React.Dispatch<React.SetStateAction<string | null>>
  handleMessageTap: (messageId: string) => void

  // メッセージ選択と削除
  selectedMessages: Set<string>
  setSelectedMessages: React.Dispatch<React.SetStateAction<Set<string>>>
  isSelectionMode: boolean
  isRangeSelectionMode: boolean
  handleToggleSelectionMode: () => void
  handleToggleRangeSelectionMode: () => void
  handleDeleteMessages: () => void
  handleMoveMessages: () => void
  handleConfirmMove: (targetLineId: string) => Promise<void>
  handleConfirmBulkDelete: () => Promise<void>
  showMoveDialog: boolean
  setShowMoveDialog: React.Dispatch<React.SetStateAction<boolean>>
  showBulkDeleteDialog: boolean
  setShowBulkDeleteDialog: React.Dispatch<React.SetStateAction<boolean>>

  // 更新状態
  isUpdating: boolean

  // フッター更新
  footerKey: number
  setFooterKey: React.Dispatch<React.SetStateAction<number>>
}

/**
 * Branch operations hook
 *
 * Handles all branch/line-related operations:
 * - Line switching and navigation
 * - Timeline and path calculation
 * - Line editing (name, tags)
 * - Message multi-selection and move
 * - Scroll position management
 *
 * @param props - Chat state and callbacks
 * @returns BranchOperations object
 */
export function useBranchOperations({
  chatState,
  messagesContainerRef,
  selectedBaseMessage,
  setSelectedBaseMessage,
  onLineChange,
  chatRepository
}: BranchOperationsProps): BranchOperations {
  const {
    messages,
    setMessages,
    lines,
    setLines,
    setTags,
    currentLineId,
    setCurrentLineId,
    pathCache,
    setPathCache,
    lineAncestryCache,
    setLineAncestryCache,
    filterMessageType,
    filterTaskCompleted,
    filterDateStart,
    filterDateEnd,
    filterTag,
    searchKeyword,
    clearAllCaches
  } = chatState

  const [footerKey, setFooterKey] = useState(0)
  const [lastSelectedMessageId, setLastSelectedMessageId] = useState<string | null>(null)

  const {
    scrollPositions,
    saveScrollPosition,
    restoreScrollPosition,
    setScrollPositions
  } = useScrollPosition({ messagesContainerRef })

  const messageMoveOps = useMessageMove({
    messages,
    setMessages,
    lines,
    setLines,
    clearAllCaches,
    setSelectedBaseMessage,
    chatRepository
  })

  const {
    selectedMessages,
    isSelectionMode,
    isRangeSelectionMode,
    showMoveDialog,
    showBulkDeleteDialog,
    isUpdating: moveIsUpdating,
    handleToggleSelectionMode,
    handleToggleRangeSelectionMode,
    handleMoveMessages,
    handleDeleteMessages,
    handleConfirmBulkDelete,
    handleConfirmMove,
    setSelectedMessages,
    setShowMoveDialog,
    setShowBulkDeleteDialog,
    setIsSelectionMode
  } = messageMoveOps

  const {
    getBranchingLines,
    getLineAncestry,
    getOptimizedPath,
    getCompleteTimeline,
    completeTimeline,
    filteredTimeline,
    clearTimelineCaches
  } = useTimelineOperations({
    messages,
    lines,
    currentLineId,
    pathCache,
    setPathCache,
    lineAncestryCache,
    setLineAncestryCache,
    filterMessageType,
    filterTaskCompleted,
    filterDateStart,
    filterDateEnd,
    filterTag,
    searchKeyword
  })

  const getCurrentLine = useCallback((): Line | null => {
    if (currentLineId === TIMELINE_BRANCH_ID) {
      return {
        id: TIMELINE_BRANCH_ID,
        name: '全メッセージ (時系列)',
        parent_line_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    }
    return lines[currentLineId] || null
  }, [currentLineId, messages, lines])

  const {
    isEditingBranch,
    editingBranchData,
    isUpdating: editIsUpdating,
    handleEditLine,
    handleSaveLineEdit,
    handleAddTag,
    handleRemoveTag,
    setIsEditingBranch,
    setEditingBranchData
  } = useLineEditing({
    currentLineId,
    getCurrentLine,
    setLines,
    setTags,
    clearAllCaches
  })

  const {
    handleCreateLine,
    handleDeleteLine,
    isUpdating: crudIsUpdating
  } = useLineCrud({
    lines,
    messages,
    currentLineId,
    setLines,
    setMessages,
    setSelectedBaseMessage,
    setSelectedMessages,
    setIsSelectionMode,
    setShowMoveDialog,
    setShowBulkDeleteDialog,
    setScrollPositions,
    setCurrentLineId,
    onLineChange,
    saveScrollPosition,
    clearTimelineCaches,
    clearAllCaches,
    setFooterKey,
    messagesContainerRef
  })

  const handleMessageTap = useCallback((messageId: string, shiftKey?: boolean) => {
    if (isSelectionMode) {
      setSelectedMessages(prev => {
        const newSet = new Set(prev)

        // Shift+クリック または 範囲選択モード: 範囲選択
        const shouldRangeSelect = (shiftKey || isRangeSelectionMode) && lastSelectedMessageId !== null
        if (shouldRangeSelect && lastSelectedMessageId !== null) {
          const messageIds = completeTimeline.messages.map(m => m.id)
          const startIndex = messageIds.indexOf(lastSelectedMessageId)
          const endIndex = messageIds.indexOf(messageId)

          if (startIndex !== -1 && endIndex !== -1) {
            const [min, max] = [Math.min(startIndex, endIndex), Math.max(startIndex, endIndex)]
            const isDeselecting = newSet.has(messageId)

            for (let i = min; i <= max; i++) {
              if (isDeselecting) {
                newSet.delete(messageIds[i])
              } else {
                newSet.add(messageIds[i])
              }
            }
          }
        } else {
          // 通常クリック: 個別トグル
          if (newSet.has(messageId)) {
            newSet.delete(messageId)
          } else {
            newSet.add(messageId)
          }
        }

        return newSet
      })
      setLastSelectedMessageId(messageId)
    } else {
      if (selectedBaseMessage === messageId) {
        setSelectedBaseMessage(null)
      } else {
        setSelectedBaseMessage(messageId)
      }
    }
  }, [isSelectionMode, isRangeSelectionMode, lastSelectedMessageId, completeTimeline, setSelectedMessages, selectedBaseMessage, setSelectedBaseMessage])

  const switchToLine = useCallback((lineId: string) => {
    if (lineId === TIMELINE_BRANCH_ID || lines[lineId]) {
      if (currentLineId) {
        saveScrollPosition(currentLineId)
      }
      setCurrentLineId(lineId)
      if (onLineChange) {
        onLineChange(lineId)
      }
      restoreScrollPosition(lineId)
    }
  }, [lines, currentLineId, saveScrollPosition, setCurrentLineId, onLineChange, restoreScrollPosition])

  return {
    showMoveDialog,
    setShowMoveDialog,
    handleMoveMessages,
    handleConfirmMove,
    switchToLine,
    getCurrentLine,
    getBranchingLines,
    getLineAncestry,
    getOptimizedPath,
    getCompleteTimeline,
    completeTimeline,
    filteredTimeline,
    clearTimelineCaches,
    scrollPositions,
    saveScrollPosition,
    restoreScrollPosition,
    isEditingBranch,
    editingBranchData,
    isUpdating: editIsUpdating || moveIsUpdating || crudIsUpdating,
    handleEditLine,
    handleSaveLineEdit,
    handleAddTag,
    handleRemoveTag,
    setIsEditingBranch,
    setEditingBranchData,
    handleCreateLine,
    handleDeleteLine,
    selectedBaseMessage,
    setSelectedBaseMessage,
    handleMessageTap,
    selectedMessages,
    setSelectedMessages,
    isSelectionMode,
    isRangeSelectionMode,
    handleToggleSelectionMode,
    handleToggleRangeSelectionMode,
    handleDeleteMessages,
    handleConfirmBulkDelete,
    showBulkDeleteDialog,
    setShowBulkDeleteDialog,
    footerKey,
    setFooterKey
  }
}

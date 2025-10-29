import { useState, useCallback } from 'react'
import type { Line } from '@/lib/types'
import type { ChatState } from './use-chat-state'
import { TIMELINE_BRANCH_ID } from '@/lib/constants'
import type { LineAncestryResult } from './helpers/branch-ancestry'
import { saveLineEdit, updateLocalLineState, createNewTag, type LineEditData } from './helpers/line-edit'
import { dataSourceManager } from '@/lib/data-source'
import { useMessageMove } from './helpers/use-message-move'
import { useTimelineOperations } from './helpers/use-timeline-operations'

interface BranchOperationsProps {
  chatState: ChatState
  messagesContainerRef: React.RefObject<HTMLDivElement>
  selectedBaseMessage: string | null
  setSelectedBaseMessage: React.Dispatch<React.SetStateAction<string | null>>
  onLineChange?: (lineId: string) => void
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
  handleCreateLine: (lineName: string) => Promise<void>

  // メッセージタップ処理
  selectedBaseMessage: string | null
  setSelectedBaseMessage: React.Dispatch<React.SetStateAction<string | null>>
  handleMessageTap: (messageId: string) => void

  // メッセージ選択と削除
  selectedMessages: Set<string>
  setSelectedMessages: React.Dispatch<React.SetStateAction<Set<string>>>
  isSelectionMode: boolean
  handleToggleSelectionMode: () => void
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
  onLineChange
}: BranchOperationsProps): BranchOperations {
  const {
    messages,
    setMessages,
    lines,
    setLines,
    branchPoints,
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

  // スクロール位置
  const [scrollPositions, setScrollPositions] = useState<Map<string, number>>(new Map())

  // ライン編集
  const [isEditingBranch, setIsEditingBranch] = useState(false)
  const [editingBranchData, setEditingBranchData] = useState<LineEditData>({ name: "", tagIds: [], newTag: "" })
  const [isUpdating, setIsUpdating] = useState(false)

  // フッター更新
  const [footerKey, setFooterKey] = useState(0)

  const messageMoveOps = useMessageMove({
    messages,
    setMessages,
    lines,
    setLines,
    clearAllCaches,
    setSelectedBaseMessage
  })

  const {
    selectedMessages,
    isSelectionMode,
    showMoveDialog,
    showBulkDeleteDialog,
    isUpdating: moveIsUpdating,
    handleToggleSelectionMode,
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
    branchPoints,
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

  /**
   * Handle message tap (selection or branching)
   */
  const handleMessageTap = useCallback((messageId: string) => {
    if (isSelectionMode) {
      setSelectedMessages(prev => {
        const newSet = new Set(prev)
        if (newSet.has(messageId)) {
          newSet.delete(messageId)
        } else {
          newSet.add(messageId)
        }
        return newSet
      })
    } else {
      // Branching mode
      if (selectedBaseMessage === messageId) {
        setSelectedBaseMessage(null)
      } else {
        setSelectedBaseMessage(messageId)
      }
    }
  }, [isSelectionMode, setSelectedMessages, selectedBaseMessage, setSelectedBaseMessage])



  /**
   * Save scroll position
   */
  const saveScrollPosition = useCallback((lineId: string) => {
    if (messagesContainerRef.current) {
      const scrollTop = messagesContainerRef.current.scrollTop
      setScrollPositions(prev => new Map(prev).set(lineId, scrollTop))
    }
  }, [messagesContainerRef])

  /**
   * Restore scroll position
   */
  const restoreScrollPosition = useCallback((lineId: string) => {
    const savedPosition = scrollPositions.get(lineId)
    if (savedPosition !== undefined && messagesContainerRef.current) {
      // 少し遅延させてDOMの更新を待つ
      setTimeout(() => {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTop = savedPosition
        }
      }, 50)
    }
  }, [scrollPositions, messagesContainerRef])

  /**
   * Switch to line (with scroll position preservation)
   */
  const switchToLine = useCallback((lineId: string) => {
    if (lineId === TIMELINE_BRANCH_ID || lines[lineId]) {
      // 現在のラインのスクロール位置を保存
      if (currentLineId) {
        saveScrollPosition(currentLineId)
      }

      setCurrentLineId(lineId)

      // 外部コールバックを呼び出し
      if (onLineChange) {
        onLineChange(lineId)
      }

      // 新しいラインのスクロール位置を復元
      restoreScrollPosition(lineId)
    }
  }, [lines, currentLineId, saveScrollPosition, setCurrentLineId, onLineChange, restoreScrollPosition])

  /**
   * Get current line object
   */
  const getCurrentLine = useCallback((): Line | null => {
    // タイムライン仮想ブランチの場合
    if (currentLineId === TIMELINE_BRANCH_ID) {
      const allMessages = Object.values(messages)
      return {
        id: TIMELINE_BRANCH_ID,
        name: '全メッセージ (時系列)',
        messageIds: allMessages.map(m => m.id).sort((a, b) => {
          const msgA = messages[a]
          const msgB = messages[b]
          return new Date(msgA.timestamp).getTime() - new Date(msgB.timestamp).getTime()
        }),
        startMessageId: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    }

    return lines[currentLineId] || null
  }, [currentLineId, messages, lines])

  /**
   * Start editing line
   */
  const handleEditLine = useCallback(() => {
    const currentLineInfo = getCurrentLine()
    if (currentLineInfo) {
      setEditingBranchData({
        name: currentLineInfo.name,
        tagIds: [...(currentLineInfo.tagIds || [])],
        newTag: ""
      })
      setIsEditingBranch(true)
    }
  }, [getCurrentLine])

  /**
   * Save line edit
   */
  const handleSaveLineEdit = useCallback(async () => {
    setIsUpdating(true)
    try {
      await saveLineEdit(currentLineId, editingBranchData)
      updateLocalLineState(currentLineId, editingBranchData, setLines)
      clearAllCaches()
      setIsEditingBranch(false)
    } catch (error) {
      console.error("Failed to save line edit:", error)
      alert("ラインの保存に失敗しました。")
    } finally {
      setIsUpdating(false)
    }
  }, [editingBranchData, currentLineId, setLines, clearAllCaches])

  /**
   * Add tag
   */
  const handleAddTag = useCallback(() => {
    if (editingBranchData.newTag.trim()) {
      const newTagId = createNewTag(editingBranchData.newTag, setTags)
      setEditingBranchData(prev => ({
        ...prev,
        tagIds: [...prev.tagIds, newTagId],
        newTag: ""
      }))
    }
  }, [editingBranchData, setTags])

  /**
   * Remove tag
   */
  const handleRemoveTag = useCallback((tagIndex: number) => {
    setEditingBranchData(prev => ({
      ...prev,
      tagIds: prev.tagIds.filter((_, index) => index !== tagIndex)
    }))
  }, [])

  const handleCreateLine = useCallback(async (lineName: string) => {
    const trimmedName = lineName.trim()
    if (!trimmedName) {
      alert('ライン名を入力してください')
      return
    }

    setIsUpdating(true)
    try {
      const timestamp = new Date().toISOString()
      const newLineId = await dataSourceManager.createLine({
        name: trimmedName,
        messageIds: [],
        startMessageId: '',
        tagIds: [],
        created_at: timestamp,
        updated_at: timestamp
      })

      const newLine: Line = {
        id: newLineId,
        name: trimmedName,
        messageIds: [],
        startMessageId: '',
        tagIds: [],
        created_at: timestamp,
        updated_at: timestamp
      }

      setLines(prev => ({
        ...prev,
        [newLineId]: newLine
      }))

      setSelectedBaseMessage(null)
      setSelectedMessages(new Set())
      setIsSelectionMode(false)

      if (currentLineId) {
        saveScrollPosition(currentLineId)
      }

      setCurrentLineId(newLineId)
      if (onLineChange) {
        onLineChange(newLineId)
      }

      clearTimelineCaches()
      clearAllCaches()
      setFooterKey(prev => prev + 1)

      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop = 0
      }
    } catch (error) {
      console.error('Failed to create line:', error)
      alert('ラインの作成に失敗しました')
      throw error
    } finally {
      setIsUpdating(false)
    }
  }, [clearTimelineCaches, clearAllCaches, setLines, setSelectedBaseMessage, setSelectedMessages, setIsSelectionMode, currentLineId, saveScrollPosition, setCurrentLineId, onLineChange, setFooterKey, messagesContainerRef])

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
    isUpdating: isUpdating || moveIsUpdating,
    handleEditLine,
    handleSaveLineEdit,
    handleAddTag,
    handleRemoveTag,
    setIsEditingBranch,
    setEditingBranchData,
    handleCreateLine,
    selectedBaseMessage,
    setSelectedBaseMessage,
    handleMessageTap,
    selectedMessages,
    setSelectedMessages,
    isSelectionMode,
    handleToggleSelectionMode,
    handleDeleteMessages,
    handleConfirmBulkDelete,
    showBulkDeleteDialog,
    setShowBulkDeleteDialog,
    footerKey,
    setFooterKey
  }
}

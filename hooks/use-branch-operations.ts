import { useState, useCallback, useMemo } from 'react'
import type { Line } from '@/lib/types'
import type { ChatState } from './use-chat-state'
import { TIMELINE_BRANCH_ID } from '@/lib/constants'
import { calculateLineAncestry, calculateOptimizedPath, type LineAncestryResult } from './helpers/branch-ancestry'
import { filterTimeline } from './helpers/timeline-filter'
import { saveLineEdit, updateLocalLineState, createNewTag, type LineEditData } from './helpers/line-edit'
import { useMessageMove, type MessageMoveOperations } from './helpers/use-message-move'

interface BranchOperationsProps {
  chatState: ChatState
  messagesContainerRef: React.RefObject<HTMLDivElement>
  selectedBaseMessage: string | null
  setSelectedBaseMessage: React.Dispatch<React.SetStateAction<string | null>>
  onLineChange?: (lineId: string) => void
}

export interface BranchOperations extends MessageMoveOperations {
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

  // メッセージ移動関連の処理
  const messageMoveOps = useMessageMove({
    messages,
    setMessages,
    lines,
    setLines,
    setCurrentLineId,
    clearAllCaches,
    selectedBaseMessage,
    setSelectedBaseMessage
  })

  /**
   * Get branching lines from a branch point
   */
  const getBranchingLines = useCallback((messageId: string): Line[] => {
    const branchPoint = branchPoints[messageId]
    if (!branchPoint || !branchPoint.lines.length) return []
    return branchPoint.lines.map(lineId => lines[lineId]).filter(Boolean)
  }, [branchPoints, lines])

  /**
   * Get line ancestry chain (memoized with cache)
   */
  const getLineAncestry = useCallback((lineId: string): string[] => {
    // キャッシュチェック
    if (lineAncestryCache.has(lineId)) {
      const cached = lineAncestryCache.get(lineId)
      if (cached) return cached
    }

    const ancestry = calculateLineAncestry(lineId, lines, messages, lineAncestryCache)

    setLineAncestryCache(prev => {
      const newCache = new Map(prev)
      newCache.set(lineId, ancestry)
      return newCache
    })

    return ancestry
  }, [lines, messages, lineAncestryCache, setLineAncestryCache])

  /**
   * Get optimized path (with cache)
   */
  const getOptimizedPath = useCallback((lineId: string): LineAncestryResult => {
    if (pathCache.has(lineId)) {
      const cached = pathCache.get(lineId)
      if (cached) return cached
    }

    const result = calculateOptimizedPath(lineId, lines, messages, lineAncestryCache)

    setPathCache(prev => {
      const newCache = new Map(prev)
      newCache.set(lineId, result)
      return newCache
    })

    return result
  }, [lines, messages, lineAncestryCache, pathCache, setPathCache])

  /**
   * Get complete timeline
   */
  const getCompleteTimeline = useCallback((): LineAncestryResult => {
    // タイムライン仮想ブランチの場合
    if (currentLineId === TIMELINE_BRANCH_ID) {
      const allMessages = Object.values(messages).sort((a, b) => {
        return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      })

      // ライン切り替わり情報を生成
      const transitions: Array<{ index: number, lineId: string, lineName: string }> = []
      let prevLineId: string | null = null

      allMessages.forEach((msg, index) => {
        if (msg.lineId !== prevLineId) {
          const line = lines[msg.lineId]
          transitions.push({
            index,
            lineId: msg.lineId,
            lineName: line?.name || msg.lineId
          })
          prevLineId = msg.lineId
        }
      })

      return { messages: allMessages, transitions }
    }

    // 通常のライン表示
    if (!currentLineId || !lines[currentLineId]) {
      return { messages: [], transitions: [] }
    }

    const result = getOptimizedPath(currentLineId)
    return result
  }, [currentLineId, lines, messages, getOptimizedPath])

  /**
   * Memoized timeline
   */
  const completeTimeline = useMemo(() => {
    return getCompleteTimeline()
  }, [getCompleteTimeline])

  /**
   * Filtered timeline
   */
  const filteredTimeline = useMemo(() => {
    return filterTimeline(completeTimeline, {
      filterMessageType,
      filterTaskCompleted,
      filterDateStart,
      filterDateEnd,
      filterTag,
      searchKeyword
    })
  }, [completeTimeline, filterMessageType, filterTaskCompleted, filterDateStart, filterDateEnd, filterTag, searchKeyword])

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

  /** 
   * Clear timeline caches
   */
  const clearTimelineCaches = useCallback(() => {
    setPathCache(new Map());
    setLineAncestryCache(new Map());
  }, [setPathCache, setLineAncestryCache]);

  return {
    ...messageMoveOps,
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
    isUpdating: isUpdating || messageMoveOps.isUpdating,
    handleEditLine,
    handleSaveLineEdit,
    handleAddTag,
    handleRemoveTag,
    setIsEditingBranch,
    setEditingBranchData,
    footerKey,
    setFooterKey
  }
}

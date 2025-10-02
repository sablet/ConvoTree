import { useState, useCallback, useMemo } from 'react'
import { dataSourceManager } from '@/lib/data-source'
import type { Line, Message, Tag } from '@/lib/types'
import type { ChatState } from './use-chat-state'
import { TIMELINE_BRANCH_ID } from '@/lib/constants'

interface BranchOperationsProps {
  chatState: ChatState
  messagesContainerRef: React.RefObject<HTMLDivElement>
  selectedBaseMessage: string | null
  setSelectedBaseMessage: React.Dispatch<React.SetStateAction<string | null>>
  onLineChange?: (lineId: string) => void
  onNewLineCreated?: (lineId: string, lineName: string) => void
}

interface LineAncestryResult {
  messages: Message[]
  transitions: Array<{ index: number; lineId: string; lineName: string }>
}

export interface BranchOperations {
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

  // スクロール位置管理
  scrollPositions: Map<string, number>
  saveScrollPosition: (lineId: string) => void
  restoreScrollPosition: (lineId: string) => void

  // ライン編集
  isEditingBranch: boolean
  editingBranchData: { name: string; tagIds: string[]; newTag: string }
  isUpdating: boolean
  handleEditLine: () => void
  handleSaveLineEdit: () => Promise<void>
  handleAddTag: () => void
  handleRemoveTag: (tagIndex: number) => void
  setIsEditingBranch: React.Dispatch<React.SetStateAction<boolean>>
  setEditingBranchData: React.Dispatch<React.SetStateAction<{ name: string; tagIds: string[]; newTag: string }>>

  // 複数選択・移動
  selectedMessages: Set<string>
  isSelectionMode: boolean
  showMoveDialog: boolean
  handleToggleSelectionMode: () => void
  handleMoveMessages: () => void
  handleConfirmMove: (targetLineId: string) => Promise<void>
  handleMessageTap: (messageId: string) => void
  setSelectedMessages: React.Dispatch<React.SetStateAction<Set<string>>>
  setShowMoveDialog: React.Dispatch<React.SetStateAction<boolean>>

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
  onNewLineCreated
}: BranchOperationsProps): BranchOperations {
  const {
    messages,
    setMessages,
    lines,
    setLines,
    branchPoints,
    tags,
    setTags,
    currentLineId,
    setCurrentLineId,
    pathCache,
    setPathCache,
    lineAncestryCache,
    setLineAncestryCache,
    filterMessageType,
    filterTag,
    searchKeyword,
    clearAllCaches
  } = chatState

  // スクロール位置
  const [scrollPositions, setScrollPositions] = useState<Map<string, number>>(new Map())

  // ライン編集
  const [isEditingBranch, setIsEditingBranch] = useState(false)
  const [editingBranchData, setEditingBranchData] = useState<{
    name: string
    tagIds: string[]
    newTag: string
  }>({ name: "", tagIds: [], newTag: "" })

  // 複数選択・移動
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set())
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [showMoveDialog, setShowMoveDialog] = useState(false)

  // フッター更新
  const [footerKey, setFooterKey] = useState(0)

  // 更新中フラグ
  const [isUpdating, setIsUpdating] = useState(false)

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

    const line = lines[lineId]
    if (!line) {
      return []
    }

    let ancestry: string[] = []

    // 分岐元がある場合は親ラインの祖先を取得
    if (line.branchFromMessageId) {
      const branchFromMessage = messages[line.branchFromMessageId]
      if (branchFromMessage) {
        const parentLineId = branchFromMessage.lineId
        const parentAncestry = getLineAncestry(parentLineId)
        ancestry = [...parentAncestry, parentLineId]
      }
    }

    // キャッシュに保存
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
    // キャッシュチェック
    if (pathCache.has(lineId)) {
      const cached = pathCache.get(lineId)
      if (cached) return cached
    }

    const ancestry = getLineAncestry(lineId)
    const fullLineChain = [...ancestry, lineId]

    const allMessages: Message[] = []
    const transitions: Array<{ index: number, lineId: string, lineName: string }> = []

    for (let i = 0; i < fullLineChain.length; i++) {
      const currentLineInChain = lines[fullLineChain[i]]
      if (!currentLineInChain) continue

      // ライン切り替えポイントを記録
      if (i > 0) {
        transitions.push({
          index: allMessages.length,
          lineId: currentLineInChain.id,
          lineName: currentLineInChain.name
        })
      }

      // メッセージを追加
      if (i < fullLineChain.length - 1) {
        // 中間ライン: 分岐点までのメッセージのみ
        const nextLine = lines[fullLineChain[i + 1]]
        if (nextLine?.branchFromMessageId) {
          const branchPointIndex = currentLineInChain.messageIds.indexOf(nextLine.branchFromMessageId)
          if (branchPointIndex >= 0) {
            const segmentMessages = currentLineInChain.messageIds
              .slice(0, branchPointIndex + 1)
              .map(msgId => messages[msgId])
              .filter(Boolean)
            allMessages.push(...segmentMessages)
          }
        }
      } else {
        // 最終ライン: 全メッセージ
        const lineMessages = currentLineInChain.messageIds
          .map(msgId => messages[msgId])
          .filter(Boolean)
        allMessages.push(...lineMessages)
      }
    }

    const result = { messages: allMessages, transitions }

    // キャッシュに保存
    setPathCache(prev => {
      const newCache = new Map(prev)
      newCache.set(lineId, result)
      return newCache
    })

    return result
  }, [getLineAncestry, lines, messages, pathCache, setPathCache])

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
    const filtered = completeTimeline.messages.filter(message => {
      // メッセージタイプフィルター
      if (filterMessageType !== 'all' && message.type !== filterMessageType) {
        return false
      }

      // タグフィルター（部分一致）
      if (filterTag) {
        const messageTags = message.tags || []
        const hasMatchingTag = messageTags.some(tag =>
          tag.toLowerCase().includes(filterTag.toLowerCase())
        )
        if (!hasMatchingTag) {
          return false
        }
      }

      // キーワード検索（部分一致）
      if (searchKeyword) {
        const contentMatch = message.content.toLowerCase().includes(searchKeyword.toLowerCase())
        const authorMatch = message.author?.toLowerCase().includes(searchKeyword.toLowerCase()) || false
        if (!contentMatch && !authorMatch) {
          return false
        }
      }

      return true
    })

    return {
      messages: filtered,
      transitions: completeTimeline.transitions
    }
  }, [completeTimeline, filterMessageType, filterTag, searchKeyword])

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
    const currentLineInfo = getCurrentLine()
    if (currentLineInfo) {
      const currentTimestamp = new Date()
      const updatedLineData = {
        name: editingBranchData.name,
        tagIds: editingBranchData.tagIds,
        updated_at: currentTimestamp.toISOString()
      }

      setIsUpdating(true)
      try {
        // Firestoreのデータを更新
        await dataSourceManager.updateLine(currentLineId, updatedLineData)

        // ローカルのstateを更新
        setLines((prev) => {
          const updated = { ...prev }
          if (updated[currentLineId]) {
            updated[currentLineId] = {
              ...updated[currentLineId],
              ...updatedLineData
            }
          }
          return updated
        })

        // キャッシュをクリアしてUIを更新
        clearAllCaches()

        setIsEditingBranch(false)
      } catch (error) {
        console.error("Failed to save line edit:", error)
        alert("ラインの保存に失敗しました。")
      } finally {
        setIsUpdating(false)
      }
    }
  }, [getCurrentLine, editingBranchData, currentLineId, setLines, clearAllCaches])

  /**
   * Add tag
   */
  const handleAddTag = useCallback(() => {
    if (editingBranchData.newTag.trim()) {
      // 新しいタグを作成
      const newTagId = `tag_${Date.now()}`
      const newTag: Tag = {
        id: newTagId,
        name: editingBranchData.newTag.trim()
      }

      // タグを追加
      setTags(prev => ({
        ...prev,
        [newTagId]: newTag
      }))

      // 編集データを更新
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
   * Handle message tap (selection or branching)
   */
  const handleMessageTap = useCallback((messageId: string) => {
    if (isSelectionMode) {
      // 複数選択モード
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
      // 通常の分岐作成モード
      if (selectedBaseMessage === messageId) {
        setSelectedBaseMessage(null)
      } else {
        setSelectedBaseMessage(messageId)
      }
    }
  }, [isSelectionMode, selectedBaseMessage, setSelectedBaseMessage])

  /**
   * Toggle selection mode
   */
  const handleToggleSelectionMode = useCallback(() => {
    setIsSelectionMode(!isSelectionMode)
    if (isSelectionMode) {
      // 選択モードを終了する際は選択をクリア
      setSelectedMessages(new Set())
    } else {
      // 選択モードに入る際は分岐作成を無効化
      setSelectedBaseMessage(null)
    }
  }, [isSelectionMode, setSelectedBaseMessage])

  /**
   * Show move messages dialog
   */
  const handleMoveMessages = useCallback(() => {
    if (selectedMessages.size > 0) {
      setShowMoveDialog(true)
    }
  }, [selectedMessages])

  /**
   * Confirm and execute message move
   */
  const handleConfirmMove = useCallback(async (targetLineId: string) => {
    if (selectedMessages.size === 0) return

    setIsUpdating(true)
    try {
      // 選択されたメッセージIDを配列として取得
      const selectedMessageIds = Array.from(selectedMessages)
      const updateTimestamp = new Date().toISOString()

      // 元のライン別にメッセージをグループ化
      const messagesByOldLine = new Map<string, string[]>()
      for (const messageId of selectedMessageIds) {
        const message = messages[messageId]
        if (message) {
          const oldLineId = message.lineId
          if (!messagesByOldLine.has(oldLineId)) {
            messagesByOldLine.set(oldLineId, [])
          }
          messagesByOldLine.get(oldLineId)?.push(messageId)
        }
      }

      // 一括更新用のPromise配列を準備
      const updatePromises: Promise<unknown>[] = []

      // 全メッセージのlineIdを一括更新
      for (const messageId of selectedMessageIds) {
        updatePromises.push(
          dataSourceManager.updateMessage(messageId, {
            lineId: targetLineId
          })
        )
      }

      // 各元ラインからメッセージIDを一括削除
      for (const [oldLineId, messageIds] of Array.from(messagesByOldLine.entries())) {
        if (lines[oldLineId]) {
          const updatedMessageIds = lines[oldLineId].messageIds.filter(id => !messageIds.includes(id))
          updatePromises.push(
            dataSourceManager.updateLine(oldLineId, {
              messageIds: updatedMessageIds,
              updated_at: updateTimestamp
            })
          )
        }
      }

      // ターゲットラインに全メッセージIDを一括追加
      if (lines[targetLineId]) {
        const currentMessageIds = lines[targetLineId].messageIds
        const newMessageIds = [...currentMessageIds, ...selectedMessageIds.filter(id => !currentMessageIds.includes(id))]
        updatePromises.push(
          dataSourceManager.updateLine(targetLineId, {
            messageIds: newMessageIds,
            updated_at: updateTimestamp
          })
        )
      }

      // 全ての更新を並列実行
      await Promise.all(updatePromises)

      // ローカル状態を更新
      setMessages(prev => {
        const updated = { ...prev }
        Array.from(selectedMessages).forEach(messageId => {
          if (updated[messageId]) {
            updated[messageId] = {
              ...updated[messageId],
              lineId: targetLineId
            }
          }
        })
        return updated
      })

      setLines(prev => {
        const updated = { ...prev }

        // 各メッセージの元のラインから削除
        Array.from(selectedMessages).forEach(messageId => {
          const message = messages[messageId]
          if (message && updated[message.lineId]) {
            updated[message.lineId] = {
              ...updated[message.lineId],
              messageIds: updated[message.lineId].messageIds.filter(id => id !== messageId),
              updated_at: updateTimestamp
            }
          }
        })

        // ターゲットラインに追加
        if (updated[targetLineId]) {
          const newMessageIds = [...updated[targetLineId].messageIds]
          Array.from(selectedMessages).forEach(messageId => {
            if (!newMessageIds.includes(messageId)) {
              newMessageIds.push(messageId)
            }
          })
          updated[targetLineId] = {
            ...updated[targetLineId],
            messageIds: newMessageIds,
            updated_at: updateTimestamp
          }
        }

        return updated
      })

      // キャッシュをクリア
      clearAllCaches()

      // 選択をクリアしてダイアログを閉じる
      const movedCount = selectedMessages.size
      setSelectedMessages(new Set())
      setShowMoveDialog(false)

      alert(`${movedCount}件のメッセージを移動しました`)

    } catch (error) {
      console.error('Failed to move messages:', error)
      alert('メッセージの移動に失敗しました')
    } finally {
      setIsUpdating(false)
    }
  }, [selectedMessages, messages, lines, setMessages, setLines, clearAllCaches])

  return {
    switchToLine,
    getCurrentLine,
    getBranchingLines,
    getLineAncestry,
    getOptimizedPath,
    getCompleteTimeline,
    completeTimeline,
    filteredTimeline,
    scrollPositions,
    saveScrollPosition,
    restoreScrollPosition,
    isEditingBranch,
    editingBranchData,
    isUpdating,
    handleEditLine,
    handleSaveLineEdit,
    handleAddTag,
    handleRemoveTag,
    setIsEditingBranch,
    setEditingBranchData,
    selectedMessages,
    isSelectionMode,
    showMoveDialog,
    handleToggleSelectionMode,
    handleMoveMessages,
    handleConfirmMove,
    handleMessageTap,
    setSelectedMessages,
    setShowMoveDialog,
    footerKey,
    setFooterKey
  }
}

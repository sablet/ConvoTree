import { useState, useCallback } from 'react'
import type { Message, Line } from '@/lib/types'
import { moveMessagesToLine, updateLocalStateAfterMove, updateLocalStateAfterCreateLine } from './message-move'

interface MessageMoveProps {
  messages: Record<string, Message>
  setMessages: React.Dispatch<React.SetStateAction<Record<string, Message>>>
  lines: Record<string, Line>
  setLines: React.Dispatch<React.SetStateAction<Record<string, Line>>>
  setCurrentLineId: React.Dispatch<React.SetStateAction<string>>
  clearAllCaches: () => void
  selectedBaseMessage: string | null
  setSelectedBaseMessage: React.Dispatch<React.SetStateAction<string | null>>
}

export interface MessageMoveOperations {
  selectedMessages: Set<string>
  isSelectionMode: boolean
  showMoveDialog: boolean
  handleToggleSelectionMode: () => void
  handleMoveMessages: () => void
  handleConfirmMove: (targetLineId: string) => Promise<void>
  handleCreateNewLineAndMove: (lineName: string) => Promise<void>
  handleMessageTap: (messageId: string) => void
  setSelectedMessages: React.Dispatch<React.SetStateAction<Set<string>>>
  setShowMoveDialog: React.Dispatch<React.SetStateAction<boolean>>
  isUpdating: boolean
}

/**
 * Message move operations hook
 *
 * Handles message multi-selection and move operations
 */
export function useMessageMove({
  messages,
  setMessages,
  lines,
  setLines,
  setCurrentLineId,
  clearAllCaches,
  selectedBaseMessage,
  setSelectedBaseMessage
}: MessageMoveProps): MessageMoveOperations {
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set())
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [showMoveDialog, setShowMoveDialog] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)

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
      await moveMessagesToLine(selectedMessages, targetLineId, messages, lines)
      updateLocalStateAfterMove({ selectedMessages, targetLineId, messages, setMessages, setLines })
      clearAllCaches()

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

  /**
   * Create new line and move messages
   */
  const handleCreateNewLineAndMove = useCallback(async (lineName: string) => {
    if (selectedMessages.size === 0) return

    setIsUpdating(true)
    try {
      const { dataSourceManager } = await import('@/lib/data-source/factory')
      const messageIds = Array.from(selectedMessages)

      // Determine branchFromMessageId from the first selected message
      const firstMessage = messages[messageIds[0]]
      let branchFromMessageId: string | undefined

      if (firstMessage?.prevInLine) {
        branchFromMessageId = firstMessage.prevInLine
      } else if (firstMessage?.lineId) {
        const parentLine = lines[firstMessage.lineId]
        if (parentLine?.branchFromMessageId) {
          branchFromMessageId = parentLine.branchFromMessageId
        }
      }

      const newLineId = await dataSourceManager.createLineAndMoveMessages(messageIds, lineName)

      updateLocalStateAfterCreateLine({
        selectedMessages,
        newLineId,
        lineName,
        branchFromMessageId,
        messages,
        setMessages,
        setLines
      })
      clearAllCaches()
      setSelectedMessages(new Set())
      setShowMoveDialog(false)

      // Switch to the new line
      setCurrentLineId(newLineId)

      alert(`新しいライン「${lineName}」を作成し、${messageIds.length}件のメッセージを移動しました`)
    } catch (error) {
      console.error('Failed to create line and move messages:', error)
      alert('ラインの作成とメッセージの移動に失敗しました')
    } finally {
      setIsUpdating(false)
    }
  }, [selectedMessages, messages, lines, setMessages, setLines, setCurrentLineId, clearAllCaches])

  return {
    selectedMessages,
    isSelectionMode,
    showMoveDialog,
    handleToggleSelectionMode,
    handleMoveMessages,
    handleConfirmMove,
    handleCreateNewLineAndMove,
    handleMessageTap,
    setSelectedMessages,
    setShowMoveDialog,
    isUpdating
  }
}

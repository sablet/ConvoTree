import { useState, useCallback } from 'react'
import type { Message, Line } from '@/lib/types'
import type { ChatRepository } from '@/lib/repositories/chat-repository'
import { executeBulkDelete } from './message-bulk-delete'
import { moveMessagesToLine, updateLocalStateAfterMove } from './message-move'

interface MessageMoveProps {
  messages: Record<string, Message>
  setMessages: React.Dispatch<React.SetStateAction<Record<string, Message>>>
  lines: Record<string, Line>
  setLines: React.Dispatch<React.SetStateAction<Record<string, Line>>>
  clearAllCaches: () => void
  setSelectedBaseMessage: React.Dispatch<React.SetStateAction<string | null>>
  chatRepository: ChatRepository
}

interface MessageMoveOperations {
  selectedMessages: Set<string>
  isSelectionMode: boolean
  isRangeSelectionMode: boolean
  showMoveDialog: boolean
  showBulkDeleteDialog: boolean
  isUpdating: boolean
  handleToggleSelectionMode: () => void
  handleToggleRangeSelectionMode: () => void
  handleMoveMessages: () => void
  handleDeleteMessages: () => void
  handleConfirmBulkDelete: () => Promise<void>
  handleConfirmMove: (targetLineId: string) => Promise<void>
  setSelectedMessages: React.Dispatch<React.SetStateAction<Set<string>>>
  setShowMoveDialog: React.Dispatch<React.SetStateAction<boolean>>
  setShowBulkDeleteDialog: React.Dispatch<React.SetStateAction<boolean>>
  setIsSelectionMode: React.Dispatch<React.SetStateAction<boolean>>
}

export function useMessageMove({
  messages,
  setMessages,
  lines,
  setLines,
  clearAllCaches,
  setSelectedBaseMessage,
  chatRepository
}: MessageMoveProps): MessageMoveOperations {
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set())
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [isRangeSelectionMode, setIsRangeSelectionMode] = useState(false)
  const [showMoveDialog, setShowMoveDialog] = useState(false)
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)

  const handleToggleSelectionMode = useCallback(() => {
    setIsSelectionMode(prev => {
      if (prev) {
        setSelectedMessages(new Set())
        setShowMoveDialog(false)
        setShowBulkDeleteDialog(false)
        setIsRangeSelectionMode(false)
      } else {
        setSelectedBaseMessage(null)
      }
      return !prev
    })
  }, [setSelectedBaseMessage])

  const handleToggleRangeSelectionMode = useCallback(() => {
    setIsRangeSelectionMode(prev => !prev)
  }, [])

  const handleMoveMessages = useCallback(() => {
    if (selectedMessages.size > 0) {
      setShowMoveDialog(true)
    }
  }, [selectedMessages])

  const handleDeleteMessages = useCallback(() => {
    if (selectedMessages.size > 0) {
      setShowBulkDeleteDialog(true)
    }
  }, [selectedMessages])

  const handleConfirmBulkDelete = useCallback(async () => {
    if (selectedMessages.size === 0) return

    setIsUpdating(true)
    try {
      await executeBulkDelete({
        selectedMessages,
        messages,
        setMessages,
        setLines,
        clearAllCaches,
        setSelectedMessages,
        setShowBulkDeleteDialog,
        setIsSelectionMode,
        chatRepository
      })
    } catch (error) {
      console.error('Failed to delete messages:', error)
      alert('メッセージの削除に失敗しました')
    } finally {
      setIsUpdating(false)
    }
  }, [selectedMessages, messages, setMessages, setLines, clearAllCaches, setSelectedMessages, setShowBulkDeleteDialog, setIsSelectionMode, chatRepository])

  const handleConfirmMove = useCallback(async (targetLineId: string) => {
    if (selectedMessages.size === 0) return

    setIsUpdating(true)
    try {
      await moveMessagesToLine(selectedMessages, targetLineId, messages, lines)
      updateLocalStateAfterMove({
        selectedMessages,
        targetLineId,
        messages,
        setMessages,
        setLines
      })
      clearAllCaches()
      chatRepository.clearAllCache()

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMessages, messages, lines, setMessages, setLines, clearAllCaches])

  return {
    selectedMessages,
    isSelectionMode,
    isRangeSelectionMode,
    showMoveDialog,
    showBulkDeleteDialog,
    isUpdating,
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
  }
}


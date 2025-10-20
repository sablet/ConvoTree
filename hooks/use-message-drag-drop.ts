import { useCallback, useRef } from 'react'
import { toast } from 'sonner'
import type { Message, Line } from '@/lib/types'
import { moveMessagesToLine, updateLocalStateAfterMove } from './helpers/message-move'

interface MessageDragDropProps {
  messages: Record<string, Message>
  setMessages: React.Dispatch<React.SetStateAction<Record<string, Message>>>
  lines: Record<string, Line>
  setLines: React.Dispatch<React.SetStateAction<Record<string, Line>>>
  clearAllCaches: () => void
  currentLineId: string
  selectedMessages: Set<string>
  isSelectionMode: boolean
}

interface UndoState {
  messageIds: Set<string>
  originalLineId: string
  targetLineId: string
  timeoutId: ReturnType<typeof setTimeout>
}

/**
 * Message drag and drop operations hook
 *
 * Handles drag-and-drop of messages between lines with undo functionality
 */
export function useMessageDragDrop({
  messages,
  setMessages,
  lines,
  setLines,
  clearAllCaches,
  currentLineId,
  selectedMessages,
  isSelectionMode
}: MessageDragDropProps) {
  const undoStateRef = useRef<UndoState | null>(null)

  /**
   * Handle drag start on message
   */
  const handleDragStart = useCallback((e: React.DragEvent, messageId: string) => {
    e.dataTransfer.effectAllowed = 'move'

    // If in selection mode and message is selected, drag all selected messages
    if (isSelectionMode && selectedMessages.has(messageId)) {
      const messageIds = Array.from(selectedMessages)
      e.dataTransfer.setData('text/plain', JSON.stringify(messageIds))
      e.dataTransfer.setData('drag-type', 'multiple')
    } else {
      e.dataTransfer.setData('text/plain', messageId)
      e.dataTransfer.setData('drag-type', 'single')
    }

    // Visual feedback
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5'
    }
  }, [isSelectionMode, selectedMessages])

  /**
   * Handle drag end on message
   */
  const handleDragEnd = useCallback((e: React.DragEvent) => {
    // Restore opacity
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1'
    }
  }, [])

  /**
   * Handle message drop on line
   */
  const handleDrop = useCallback(
    async (targetLineId: string, dragData: string) => {
      const targetLine = lines[targetLineId]
      if (!targetLine) {
        console.error('Target line not found:', targetLineId)
        return
      }

      // Parse drag data - could be single messageId or JSON array
      let messageIds: string[]
      try {
        messageIds = JSON.parse(dragData)
        if (!Array.isArray(messageIds)) {
          messageIds = [dragData]
        }
      } catch {
        // Single message ID (not JSON)
        messageIds = [dragData]
      }

      // Validate all messages exist
      const validMessageIds = messageIds.filter(id => messages[id])
      if (validMessageIds.length === 0) {
        console.error('No valid messages found')
        return
      }

      // Get original line ID from first message
      const firstMessage = messages[validMessageIds[0]]
      const originalLineId = firstMessage.lineId

      // Don't move if already in target line
      if (originalLineId === targetLineId) {
        return
      }

      // Cancel any pending undo
      if (undoStateRef.current) {
        clearTimeout(undoStateRef.current.timeoutId)
        undoStateRef.current = null
      }

      // Perform the move
      try {
        const messageSet = new Set(validMessageIds)

        // Move messages in backend
        await moveMessagesToLine(messageSet, targetLineId, messages, lines)

        // Update local state
        updateLocalStateAfterMove({
          selectedMessages: messageSet,
          targetLineId,
          messages,
          setMessages,
          setLines
        })

        clearAllCaches()

        // Show success toast with undo
        const undoState: UndoState = {
          messageIds: messageSet,
          originalLineId,
          targetLineId,
          timeoutId: setTimeout(() => {
            undoStateRef.current = null
          }, 5000)
        }
        // eslint-disable-next-line require-atomic-updates
        undoStateRef.current = undoState

        const messageCount = validMessageIds.length
        const messageText = messageCount === 1 ? 'message' : `${messageCount} messages`
        toast.success(`Moved ${messageText} to "${targetLine.name}"`, {
          duration: 5000,
            action: {
            label: 'Undo',
            onClick: () => {
              const currentUndoState = undoStateRef.current
              if (!currentUndoState) return

              // Cancel timeout
              clearTimeout(currentUndoState.timeoutId)

              // Move back to original line
              void (async () => {
                try {
                  await moveMessagesToLine(currentUndoState.messageIds, originalLineId, messages, lines)

                  updateLocalStateAfterMove({
                    selectedMessages: currentUndoState.messageIds,
                    targetLineId: originalLineId,
                    messages,
                    setMessages,
                    setLines
                  })

                  clearAllCaches()
                  undoStateRef.current = null

                  toast.success('Move undone', { duration: 2000 })
                } catch (error) {
                  console.error('Failed to undo move:', error)
                  toast.error('Failed to undo move')
                }
              })()
            }
          }
        })

      } catch (error) {
        console.error('Failed to move messages:', error)
        toast.error('Failed to move messages')
      }
    },
    [messages, lines, setMessages, setLines, clearAllCaches]
  )

  /**
   * Check if message is draggable (only on current line for now)
   */
  const isDraggable = useCallback(
    (message: Message) => {
      return message.lineId === currentLineId
    },
    [currentLineId]
  )

  return {
    handleDragStart,
    handleDragEnd,
    handleDrop,
    isDraggable
  }
}


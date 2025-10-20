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
}

interface UndoState {
  messageId: string
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
  currentLineId
}: MessageDragDropProps) {
  const undoStateRef = useRef<UndoState | null>(null)

  /**
   * Handle drag start on message
   */
  const handleDragStart = useCallback((e: React.DragEvent, messageId: string) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', messageId)
    
    // Visual feedback
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5'
    }
  }, [])

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
    async (targetLineId: string, messageId: string) => {
      const message = messages[messageId]
      if (!message) {
        console.error('Message not found:', messageId)
        return
      }

      const originalLineId = message.lineId

      // Don't move if already in target line
      if (originalLineId === targetLineId) {
        return
      }

      const targetLine = lines[targetLineId]
      if (!targetLine) {
        console.error('Target line not found:', targetLineId)
        return
      }

      // Cancel any pending undo
      if (undoStateRef.current) {
        clearTimeout(undoStateRef.current.timeoutId)
        undoStateRef.current = null
      }

      // Perform the move
      try {
        const selectedMessages = new Set([messageId])
        
        // Move message in backend
        await moveMessagesToLine(selectedMessages, targetLineId, messages, lines)
        
        // Update local state
        updateLocalStateAfterMove({
          selectedMessages,
          targetLineId,
          messages,
          setMessages,
          setLines
        })
        
        clearAllCaches()

        // Show success toast with undo
        const undoState: UndoState = {
          messageId,
          originalLineId,
          targetLineId,
          timeoutId: setTimeout(() => {
            undoStateRef.current = null
          }, 5000)
        }
        // eslint-disable-next-line require-atomic-updates
        undoStateRef.current = undoState

        toast.success(`Moved message to "${targetLine.name}"`, {
          duration: 5000,
            action: {
            label: 'Undo',
            onClick: () => {
              const currentUndoState = undoStateRef.current
              if (!currentUndoState) return

              // Cancel timeout
              clearTimeout(currentUndoState.timeoutId)

              // Move back to original line
              const restoreSet = new Set([messageId])
              
              void (async () => {
                try {
                  await moveMessagesToLine(restoreSet, originalLineId, messages, lines)
                  
                  updateLocalStateAfterMove({
                    selectedMessages: restoreSet,
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
        console.error('Failed to move message:', error)
        toast.error('Failed to move message')
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


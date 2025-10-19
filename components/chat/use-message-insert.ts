import { useCallback } from "react"
import type { Message } from "@/lib/types"

interface TimelineMessage {
  id: string
  timestamp: Date | string
}

interface UseMessageInsertProps {
  currentLineId: string
  timelineMessages: TimelineMessage[]
  handleCreateMessageWithTimestamp: (
    content: string,
    images: string[],
    prevMessageId: string | undefined,
    lineId: string,
    timestamp: Date
  ) => Promise<{ messageId: string }>
  setMessages: (updater: (prev: Record<string, Message>) => Record<string, Message>) => void
  clearTimelineCaches: () => void
}

export function useMessageInsert({
  currentLineId,
  timelineMessages,
  handleCreateMessageWithTimestamp,
  setMessages,
  clearTimelineCaches
}: UseMessageInsertProps) {
  const handleInsertMessage = useCallback(async (
    content: string,
    timestamp: Date,
    images?: string[]
  ) => {
    if (!content.trim()) return

    const targetTimestamp = timestamp.getTime()

    let insertIndex = 0
    for (let i = 0; i < timelineMessages.length; i++) {
      const message = timelineMessages[i]
      const messageTimestamp = message.timestamp instanceof Date
        ? message.timestamp.getTime()
        : new Date(message.timestamp).getTime()

      if (messageTimestamp > targetTimestamp) {
        insertIndex = i
        break
      }
    }

    const prevMessage = insertIndex > 0 ? timelineMessages[insertIndex - 1] : null
    const { messageId: newMessageId } = await handleCreateMessageWithTimestamp(
      content,
      images || [],
      prevMessage?.id || undefined,
      currentLineId,
      timestamp
    )

    setMessages(prev => {
      const updated = { ...prev }
      if (updated[newMessageId]) {
        updated[newMessageId] = {
          ...updated[newMessageId],
          timestamp
        }
      }
      return updated
    })

    clearTimelineCaches()
  }, [currentLineId, timelineMessages, handleCreateMessageWithTimestamp, setMessages, clearTimelineCaches])

  return { handleInsertMessage }
}

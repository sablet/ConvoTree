import { useCallback } from "react"
import type { Message } from "@/lib/types"

interface UseMessageInsertProps {
  currentLineId: string
  handleCreateMessageWithTimestamp: (
    content: string,
    images: string[],
    lineId: string,
    timestamp: Date
  ) => Promise<{ messageId: string; message: Message }>
  setMessages: (updater: (prev: Record<string, Message>) => Record<string, Message>) => void
  clearTimelineCaches: () => void
}

export function useMessageInsert({
  currentLineId,
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

    const { messageId: newMessageId } = await handleCreateMessageWithTimestamp(
      content,
      images || [],
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
  }, [currentLineId, handleCreateMessageWithTimestamp, setMessages, clearTimelineCaches])

  return { handleInsertMessage }
}

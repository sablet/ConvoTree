import { dataSourceManager } from '@/lib/data-source'
import type { Message, Line } from '@/lib/types'

interface MessageDeleteParams {
  messageId: string
  message: Message
  lines: Record<string, Line>
  deleteImageFromStorage: (url: string) => Promise<void>
  isValidImageUrl: (url: string) => boolean
}

/**
 * Delete message from Firestore
 */
export async function deleteMessageFromFirestore(params: MessageDeleteParams): Promise<void> {
  const { messageId, message, lines, deleteImageFromStorage, isValidImageUrl } = params

  // Check if any lines have this message's line as parent (branch from this message's line)
  const hasBranchingLines = Object.values(lines).some(line => line.parent_line_id === message.lineId)

  if (hasBranchingLines) {
    const confirmBranchDelete = window.confirm(
      'このメッセージのラインには分岐があります。削除すると関連する分岐も影響を受けます。本当に削除しますか？'
    )
    if (!confirmBranchDelete) {
      throw new Error('Delete cancelled')
    }
  }

  if (message.images && message.images.length > 0) {
    const deletePromises = message.images
      .filter(imageUrl => isValidImageUrl(imageUrl))
      .map(imageUrl => deleteImageFromStorage(imageUrl))

    await Promise.allSettled(deletePromises)
  }

  await dataSourceManager.deleteMessage(messageId)
}

/**
 * Update local state after message deletion
 */
export function updateLocalStateAfterDelete(
  messageId: string,
  message: Message,
  setMessages: (updater: (prev: Record<string, Message>) => Record<string, Message>) => void,
  setLines: (updater: (prev: Record<string, Line>) => Record<string, Line>) => void
): void {
  const deleteTimestamp = new Date()

  setMessages(prev => {
    const updated = { ...prev }
    delete updated[messageId]
    return updated
  })

  setLines(prev => {
    const updated = { ...prev }
    const lineId = message.lineId
    if (updated[lineId]) {
      updated[lineId] = {
        ...updated[lineId],
        updated_at: deleteTimestamp.toISOString()
      }
    }
    return updated
  })
}

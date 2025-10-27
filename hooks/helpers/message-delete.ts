import { dataSourceManager } from '@/lib/data-source'
import type { Message, Line, BranchPoint } from '@/lib/types'

interface MessageDeleteParams {
  messageId: string
  message: Message
  branchPoints: Record<string, BranchPoint>
  deleteImageFromStorage: (url: string) => Promise<void>
  isValidImageUrl: (url: string) => boolean
}

/**
 * Delete message from Firestore
 */
export async function deleteMessageFromFirestore(params: MessageDeleteParams): Promise<void> {
  const { messageId, message, branchPoints, deleteImageFromStorage, isValidImageUrl } = params

  const isBranchPoint = branchPoints[messageId] && branchPoints[messageId].lines.length > 0

  if (isBranchPoint) {
    const confirmBranchDelete = window.confirm(
      'このメッセージは分岐の起点です。削除すると関連する分岐も影響を受けます。本当に削除しますか？'
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
        messageIds: updated[lineId].messageIds.filter(id => id !== messageId),
        updated_at: deleteTimestamp.toISOString()
      }
    }
    return updated
  })
}

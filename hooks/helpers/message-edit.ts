import { dataSourceManager } from '@/lib/data-source'
import type { Message } from '@/lib/types'
import type { MessageType } from '@/lib/constants'
import { MESSAGE_TYPE_TEXT } from '@/lib/constants'
import { getDefaultMetadataForType } from './message-metadata'

interface MessageEditData {
  editingMessageId: string
  editingContent: string
  editingMessageType: MessageType
  editingMetadata: Record<string, unknown>
  messages: Record<string, Message>
}

/**
 * Save edited message to Firestore
 */
export async function saveMessageEdit(data: MessageEditData): Promise<Partial<Message>> {
  const { editingMessageId, editingContent, editingMessageType, editingMetadata, messages } = data

  if (!editingMessageId || !editingContent.trim()) {
    throw new Error('Invalid message data')
  }

  const currentMessage = messages[editingMessageId]
  const newType = editingMessageType || 'text'
  const typeChanged = currentMessage.type !== newType

  const updateData: Partial<Message> = {
    content: editingContent.trim()
  }

  if (typeChanged) {
    updateData.type = newType

    if (newType === MESSAGE_TYPE_TEXT) {
      updateData.metadata = null as unknown as Record<string, unknown>
    } else {
      updateData.metadata = Object.keys(editingMetadata).length > 0
        ? editingMetadata
        : getDefaultMetadataForType(newType, editingContent.trim())
    }
  } else {
    if (Object.keys(editingMetadata).length > 0) {
      updateData.metadata = editingMetadata
    }
  }

  const { timestamp, ...safeUpdateData } = updateData
  const dataSourceUpdateData = {
    ...safeUpdateData,
    ...(timestamp && { timestamp: timestamp instanceof Date ? timestamp.toISOString() : timestamp })
  }

  await dataSourceManager.updateMessage(editingMessageId, dataSourceUpdateData)

  return updateData
}

/**
 * Update local message state after edit
 */
export function updateLocalMessageState(
  editingMessageId: string,
  updateData: Partial<Message>,
  editingContent: string,
  setMessages: (updater: (prev: Record<string, Message>) => Record<string, Message>) => void
): void {
  const updatedAt = new Date()

  setMessages(prev => {
    const newMessages = { ...prev }
    const updatedMessage = {
      ...prev[editingMessageId],
      content: editingContent.trim(),
      ...(updateData.type && { type: updateData.type }),
      ...(updateData.metadata !== undefined && {
        metadata: updateData.metadata === null ? undefined : updateData.metadata
      }),
      updatedAt
    }

    if (updateData.metadata === null) {
      delete updatedMessage.metadata
    }

    newMessages[editingMessageId] = updatedMessage
    return newMessages
  })
}

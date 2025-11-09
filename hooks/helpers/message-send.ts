import { dataSourceManager } from '@/lib/data-source'
import { parseSlashCommand } from '@/lib/slash-command-parser'
import type { Line, Message } from '@/lib/types'

interface NewLineParams {
  name: string
  parent_line_id: string | null
}

interface NewMessageParams {
  content: string
  images: string[]
  targetLineId: string
}

/**
 * Create new branch/line
 */
export async function createNewBranch(
  params: NewLineParams
): Promise<string> {
  const { name, parent_line_id: parentLineId } = params
  const currentTimestamp = new Date()

  if (name.length >= 20) {
    const confirmCreate = window.confirm(
      `分岐名が20文字以上です（${name.length}文字）。\n\n「${name}」\n\nこの名前で分岐を作成しますか？`
    )
    if (!confirmCreate) {
      throw new Error('Branch creation cancelled')
    }
  }

  const newLineId = await dataSourceManager.createLine({
    name,
    parent_line_id: parentLineId,
    tagIds: [],
    created_at: currentTimestamp.toISOString(),
    updated_at: currentTimestamp.toISOString()
  })

  return newLineId
}

/**
 * Create new message in existing line
 */
export async function createNewMessage(params: NewMessageParams): Promise<{ messageId: string; message: Message }> {
  const { content, images, targetLineId } = params
  const parsedMessage = parseSlashCommand(content)
  const currentTimestamp = new Date()

  const messageData = {
    content: parsedMessage.content,
    timestamp: currentTimestamp.toISOString(),
    lineId: targetLineId,
    author: "User",
    type: parsedMessage.type,
    ...(images.length > 0 && { images: [...images] }),
    ...(parsedMessage.metadata !== undefined && { metadata: parsedMessage.metadata }),
  }

  const newMessageId = await dataSourceManager.createMessageWithLineUpdate(
    messageData,
    targetLineId
  )

  const newMessage: Message = {
    id: newMessageId,
    content: parsedMessage.content,
    timestamp: currentTimestamp,
    updatedAt: currentTimestamp,
    lineId: targetLineId,
    author: "User",
    type: parsedMessage.type,
    ...(parsedMessage.metadata !== undefined && { metadata: parsedMessage.metadata }),
    ...(images.length > 0 && { images: [...images] }),
  }

  return { messageId: newMessageId, message: newMessage }
}

/**
 * Update local state after creating message
 */
export function updateLocalStateAfterMessage(
  messageId: string,
  message: Message,
  setMessages: (updater: (prev: Record<string, Message>) => Record<string, Message>) => void,
  setLines: (updater: (prev: Record<string, Line>) => Record<string, Line>) => void
): void {
  const currentTimestamp = new Date()

  setMessages((prev) => ({
    ...prev,
    [messageId]: message,
  }))

  setLines((prev) => {
    const updated = { ...prev }
    if (updated[message.lineId]) {
      updated[message.lineId] = {
        ...updated[message.lineId],
        updated_at: currentTimestamp.toISOString()
      }
    }
    return updated
  })
}

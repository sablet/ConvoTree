import { dataSourceManager } from '@/lib/data-source'
import { parseSlashCommand } from '@/lib/slash-command-parser'
import type { Line, Message, BranchPoint } from '@/lib/types'

export interface NewLineParams {
  name: string
  branchFromMessageId: string
}

export interface NewMessageParams {
  content: string
  images: string[]
  targetLineId: string
  baseMessageId: string | undefined
}

/**
 * Create new branch/line
 */
export async function createNewBranch(
  params: NewLineParams,
  setBranchPoints: (updater: (prev: Record<string, BranchPoint>) => Record<string, BranchPoint>) => void
): Promise<string> {
  const { name, branchFromMessageId } = params
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
    messageIds: [],
    startMessageId: "",
    branchFromMessageId,
    tagIds: [],
    created_at: currentTimestamp.toISOString(),
    updated_at: currentTimestamp.toISOString()
  })

  await dataSourceManager.addLineToBranchPoint(branchFromMessageId, newLineId)

  setBranchPoints((prev) => {
    const updated = { ...prev }
    if (updated[branchFromMessageId]) {
      updated[branchFromMessageId] = {
        ...updated[branchFromMessageId],
        lines: [...updated[branchFromMessageId].lines, newLineId]
      }
    } else {
      updated[branchFromMessageId] = {
        messageId: branchFromMessageId,
        lines: [newLineId]
      }
    }
    return updated
  })

  return newLineId
}

/**
 * Create new message in existing line
 */
export async function createNewMessage(params: NewMessageParams): Promise<{ messageId: string; message: Message }> {
  const { content, images, targetLineId, baseMessageId } = params
  const parsedMessage = parseSlashCommand(content)
  const currentTimestamp = new Date()

  const messageData = {
    content: parsedMessage.content,
    timestamp: currentTimestamp.toISOString(),
    lineId: targetLineId,
    prevInLine: baseMessageId || undefined,
    author: "User",
    type: parsedMessage.type,
    ...(images.length > 0 && { images: [...images] }),
    ...(parsedMessage.metadata !== undefined && { metadata: parsedMessage.metadata }),
  }

  const newMessageId = await dataSourceManager.createMessageWithLineUpdate(
    messageData,
    targetLineId,
    baseMessageId || undefined
  )

  const newMessage: Message = {
    id: newMessageId,
    content: parsedMessage.content,
    timestamp: currentTimestamp,
    updatedAt: currentTimestamp,
    lineId: targetLineId,
    prevInLine: baseMessageId || undefined,
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
  baseMessageId: string | undefined,
  setMessages: (updater: (prev: Record<string, Message>) => Record<string, Message>) => void,
  setLines: (updater: (prev: Record<string, Line>) => Record<string, Line>) => void
): void {
  const currentTimestamp = new Date()

  setMessages((prev) => {
    const updated = { ...prev }
    updated[messageId] = message

    if (baseMessageId && updated[baseMessageId]) {
      updated[baseMessageId] = {
        ...updated[baseMessageId],
        nextInLine: messageId,
      }
    }

    return updated
  })

  setLines((prev) => {
    const updated = { ...prev }
    if (updated[message.lineId]) {
      const updatedMessageIds = [...updated[message.lineId].messageIds, messageId]
      const isFirstMessage = updated[message.lineId].messageIds.length === 0

      updated[message.lineId] = {
        ...updated[message.lineId],
        messageIds: updatedMessageIds,
        endMessageId: messageId,
        ...(isFirstMessage && { startMessageId: messageId }),
        updated_at: currentTimestamp.toISOString()
      }
    }
    return updated
  })
}

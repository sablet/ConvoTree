import { dataSourceManager } from '@/lib/data-source'
import type { Line, Message } from '@/lib/types'

/**
 * Move messages to a different line
 */
export async function moveMessagesToLine(
  selectedMessages: Set<string>,
  targetLineId: string,
  messages: Record<string, Message>,
  lines: Record<string, Line>
): Promise<void> {
  if (selectedMessages.size === 0) return

  const selectedMessageIds = Array.from(selectedMessages)
  const updateTimestamp = new Date().toISOString()

  const messagesByOldLine = new Map<string, string[]>()
  for (const messageId of selectedMessageIds) {
    const message = messages[messageId]
    if (message) {
      const oldLineId = message.lineId
      if (!messagesByOldLine.has(oldLineId)) {
        messagesByOldLine.set(oldLineId, [])
      }
      messagesByOldLine.get(oldLineId)?.push(messageId)
    }
  }

  const updatePromises: Promise<unknown>[] = []

  for (const messageId of selectedMessageIds) {
    updatePromises.push(
      dataSourceManager.updateMessage(messageId, {
        lineId: targetLineId
      })
    )
  }

  for (const [oldLineId, messageIds] of Array.from(messagesByOldLine.entries())) {
    if (lines[oldLineId]) {
      const updatedMessageIds = lines[oldLineId].messageIds.filter(id => !messageIds.includes(id))
      updatePromises.push(
        dataSourceManager.updateLine(oldLineId, {
          messageIds: updatedMessageIds,
          updated_at: updateTimestamp
        })
      )
    }
  }

  if (lines[targetLineId]) {
    const currentMessageIds = lines[targetLineId].messageIds
    const newMessageIds = [...currentMessageIds, ...selectedMessageIds.filter(id => !currentMessageIds.includes(id))]
    updatePromises.push(
      dataSourceManager.updateLine(targetLineId, {
        messageIds: newMessageIds,
        updated_at: updateTimestamp
      })
    )
  }

  await Promise.all(updatePromises)
}

export interface UpdateLocalStateParams {
  selectedMessages: Set<string>
  targetLineId: string
  messages: Record<string, Message>
  setMessages: (updater: (prev: Record<string, Message>) => Record<string, Message>) => void
  setLines: (updater: (prev: Record<string, Line>) => Record<string, Line>) => void
}

/**
 * Update local state after moving messages
 */
export function updateLocalStateAfterMove(params: UpdateLocalStateParams): void {
  const { selectedMessages, targetLineId, messages, setMessages, setLines } = params
  const updateDate = new Date()
  const updateTimestamp = updateDate.toISOString()

  setMessages(prev => {
    const updated = { ...prev }
    Array.from(selectedMessages).forEach(messageId => {
      if (updated[messageId]) {
        updated[messageId] = {
          ...updated[messageId],
          lineId: targetLineId,
          updatedAt: updateDate
        }
      }
    })
    return updated
  })

  setLines(prev => {
    const updated = { ...prev }

    Array.from(selectedMessages).forEach(messageId => {
      const message = messages[messageId]
      if (message && updated[message.lineId]) {
        updated[message.lineId] = {
          ...updated[message.lineId],
          messageIds: updated[message.lineId].messageIds.filter(id => id !== messageId),
          updated_at: updateTimestamp
        }
      }
    })

    if (updated[targetLineId]) {
      const newMessageIds = [...updated[targetLineId].messageIds]
      Array.from(selectedMessages).forEach(messageId => {
        if (!newMessageIds.includes(messageId)) {
          newMessageIds.push(messageId)
        }
      })
      updated[targetLineId] = {
        ...updated[targetLineId],
        messageIds: newMessageIds,
        updated_at: updateTimestamp
      }
    }

    return updated
  })
}

export interface UpdateLocalStateAfterCreateParams {
  selectedMessages: Set<string>
  newLineId: string
  lineName: string
  branchFromMessageId?: string
  messages: Record<string, Message>
  setMessages: (updater: (prev: Record<string, Message>) => Record<string, Message>) => void
  setLines: (updater: (prev: Record<string, Line>) => Record<string, Line>) => void
}

export function updateLocalStateAfterCreateLine(params: UpdateLocalStateAfterCreateParams): void {
  const { selectedMessages, newLineId, lineName, branchFromMessageId, messages, setMessages, setLines } = params
  const now = new Date().toISOString()
  const messageIds = Array.from(selectedMessages)

  const newLine: Line = {
    id: newLineId,
    name: lineName,
    messageIds,
    startMessageId: messageIds[0],
    branchFromMessageId,
    created_at: now,
    updated_at: now
  }

  setLines(prev => ({ ...prev, [newLineId]: newLine }))

  setMessages(prev => {
    const updated = { ...prev }
    messageIds.forEach(id => {
      if (updated[id]) {
        updated[id] = { ...updated[id], lineId: newLineId, prevInLine: undefined, nextInLine: undefined }
      }
    })
    return updated
  })

  const oldLineIds = new Set<string>()
  messageIds.forEach(id => { if (messages[id]?.lineId) oldLineIds.add(messages[id].lineId) })

  setLines(prev => {
    const updated = { ...prev }
    oldLineIds.forEach(lineId => {
      if (updated[lineId]) {
        updated[lineId] = { ...updated[lineId], messageIds: updated[lineId].messageIds.filter(id => !selectedMessages.has(id)), updated_at: now }
      }
    })
    return updated
  })
}

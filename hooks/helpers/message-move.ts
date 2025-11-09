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

  // Track which lines are affected
  const affectedLineIds = new Set<string>()
  affectedLineIds.add(targetLineId) // Target line is always affected

  for (const messageId of selectedMessageIds) {
    const message = messages[messageId]
    if (message) {
      affectedLineIds.add(message.lineId) // Add old line
    }
  }

  const updatePromises: Promise<unknown>[] = []

  // Update each message's lineId
  for (const messageId of selectedMessageIds) {
    updatePromises.push(
      dataSourceManager.updateMessage(messageId, {
        lineId: targetLineId
      })
    )
  }

  // Update timestamps for affected lines
  for (const lineId of Array.from(affectedLineIds)) {
    if (lines[lineId]) {
      updatePromises.push(
        dataSourceManager.updateLine(lineId, {
          updated_at: updateTimestamp
        })
      )
    }
  }

  await Promise.all(updatePromises)
}

interface UpdateLocalStateParams {
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
    const affectedLineIds = new Set<string>()
    affectedLineIds.add(targetLineId)

    // Find all affected lines (old lines that messages are being moved from)
    Array.from(selectedMessages).forEach(messageId => {
      const message = messages[messageId]
      if (message) {
        affectedLineIds.add(message.lineId)
      }
    })

    // Update timestamps for all affected lines
    affectedLineIds.forEach(lineId => {
      if (updated[lineId]) {
        updated[lineId] = {
          ...updated[lineId],
          updated_at: updateTimestamp
        }
      }
    })

    return updated
  })
}

// updateLocalStateAfterCreateLine removed alongside createLineAndMoveMessages support

import type { Dispatch, SetStateAction } from 'react'
import type { Line, Message } from '@/lib/types'
import type { ChatRepository } from '@/lib/repositories/chat-repository'

interface ExecuteBulkDeleteParams {
  selectedMessages: Set<string>
  messages: Record<string, Message>
  setMessages: Dispatch<SetStateAction<Record<string, Message>>>
  setLines: Dispatch<SetStateAction<Record<string, Line>>>
  clearAllCaches: () => void
  setSelectedMessages: Dispatch<SetStateAction<Set<string>>>
  setShowBulkDeleteDialog: Dispatch<SetStateAction<boolean>>
  setIsSelectionMode: Dispatch<SetStateAction<boolean>>
  chatRepository: ChatRepository
}

export async function executeBulkDelete(params: ExecuteBulkDeleteParams): Promise<void> {
  const {
    selectedMessages,
    messages,
    setMessages,
    setLines,
    clearAllCaches,
    setSelectedMessages,
    setShowBulkDeleteDialog,
    setIsSelectionMode,
    chatRepository
  } = params

  const messageIds = Array.from(selectedMessages)
  if (messageIds.length === 0) {
    return
  }

  const deletedCount = messageIds.length

  await Promise.all(messageIds.map(id => chatRepository.deleteMessage(id)))

  setMessages(prev => {
    const updated = { ...prev }
    messageIds.forEach(id => {
      delete updated[id]
    })
    return updated
  })

  const updateTimestamp = new Date().toISOString()

  // Find which lines are affected by the deletion
  const affectedLineIds = new Set<string>()
  messageIds.forEach(id => {
    const msg = messages[id]
    if (msg) {
      affectedLineIds.add(msg.lineId)
    }
  })

  setLines(prev => {
    const updated = { ...prev }
    // Update timestamps for affected lines
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

  clearAllCaches()
  await chatRepository.clearAllCache()
  setSelectedMessages(new Set())
  setShowBulkDeleteDialog(false)
  setIsSelectionMode(false)

  alert(`${deletedCount}件のメッセージを削除しました`)
}


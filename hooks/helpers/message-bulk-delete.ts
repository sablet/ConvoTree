import type { Dispatch, SetStateAction } from 'react'
import type { Line, Message } from '@/lib/types'
import type { ChatRepository } from '@/lib/repositories/chat-repository'

interface ExecuteBulkDeleteParams {
  selectedMessages: Set<string>
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

  setLines(prev => {
    const updated = { ...prev }
    Object.entries(updated).forEach(([lineId, line]) => {
      if (!line) return
      const filteredMessageIds = line.messageIds.filter(id => !selectedMessages.has(id))
      if (filteredMessageIds.length !== line.messageIds.length) {
        updated[lineId] = {
          ...line,
          messageIds: filteredMessageIds,
          updated_at: updateTimestamp
        }
      }
    })
    return updated
  })

  clearAllCaches()
  setSelectedMessages(new Set())
  setShowBulkDeleteDialog(false)
  setIsSelectionMode(false)

  alert(`${deletedCount}件のメッセージを削除しました`)
}


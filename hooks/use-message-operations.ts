import { useState, useCallback } from 'react'
import { dataSourceManager } from '@/lib/data-source'
import type { Message } from '@/lib/types'
import type { MessageType } from '@/lib/constants'
import { TIMELINE_BRANCH_ID } from '@/lib/constants'
import type { ChatState } from './use-chat-state'
import type { ChatRepository } from '@/lib/repositories/chat-repository'
import { isValidImageUrl } from './helpers/message-validation'
import { getDefaultMetadataForType } from './helpers/message-metadata'
import { createNewBranch, createNewMessage, updateLocalStateAfterMessage } from './helpers/message-send'
import { saveMessageEdit, updateLocalMessageState } from './helpers/message-edit'
import { deleteMessageFromFirestore, updateLocalStateAfterDelete } from './helpers/message-delete'
import { createMessageWithTimestamp } from './helpers/message-timestamp-utils'
import { useImageOperations } from './helpers/use-image-operations'

interface MessageOperationsProps {
  chatState: ChatState
  onCacheInvalidate: () => void
  onScrollToBottom?: () => void
  chatRepository: ChatRepository
}

interface UpdateMessageParams {
  messages: Record<string, Message>
  setMessages: React.Dispatch<React.SetStateAction<Record<string, Message>>>
  setIsUpdating: React.Dispatch<React.SetStateAction<boolean>>
  onCacheInvalidate: () => void
}

function useHandleUpdateMessage({
  messages,
  setMessages,
  setIsUpdating,
  onCacheInvalidate
}: UpdateMessageParams): (messageId: string, updates: Partial<Message>) => Promise<void> {
  return useCallback(async (messageId: string, updates: Partial<Message>) => {
    const targetMessage = messages[messageId]
    if (!targetMessage) {
      return
    }

    const cleanedUpdates: Partial<Message> = { ...updates }

    if (cleanedUpdates.metadata) {
      const normalizedMetadata = { ...cleanedUpdates.metadata }
      Object.keys(normalizedMetadata).forEach((key) => {
        if (normalizedMetadata[key] === undefined) {
          delete normalizedMetadata[key]
        }
      })
      cleanedUpdates.metadata = normalizedMetadata
    }

    setIsUpdating(true)
    try {
      await dataSourceManager.updateMessage(messageId, cleanedUpdates)

      setMessages(prev => {
        const updated = { ...prev }
        if (updated[messageId]) {
          const nextMessage = { ...updated[messageId] }

          if (cleanedUpdates.content !== undefined) {
            nextMessage.content = cleanedUpdates.content as string
          }

          if (cleanedUpdates.type !== undefined) {
            nextMessage.type = cleanedUpdates.type
          }

          if ('metadata' in cleanedUpdates) {
            const metadataUpdate = cleanedUpdates.metadata as Record<string, unknown> | undefined
            if (metadataUpdate && Object.keys(metadataUpdate).length > 0) {
              nextMessage.metadata = metadataUpdate
            } else {
              delete nextMessage.metadata
            }
          }

          nextMessage.updatedAt = new Date()
          updated[messageId] = nextMessage
        }
        return updated
      })

      onCacheInvalidate()

    } catch (error) {
      console.error('Failed to update message:', error)
      alert('メッセージの更新に失敗しました')
    } finally {
      setIsUpdating(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, setMessages, onCacheInvalidate, setIsUpdating])
}

interface DeleteConfirmationState {
  messageId: string
  message: Message
  isOpen: boolean
}

interface MessageOperations {
  // メッセージ送信・作成
  handleSendMessage: (
    inputValue: string,
    pendingImages: string[],
    selectedBaseMessage: string | null,
    targetLineId: string
  ) => Promise<void>
  
  // 挿入用メッセージ作成（タイムスタンプ調整可能）
  handleCreateMessageWithTimestamp: (
    content: string,
    images: string[],
    targetLineId: string,
    timestamp: Date
  ) => Promise<{ messageId: string; message: Message }>

  // メッセージ編集
  editingMessageId: string | null
  editingContent: string
  editingMessageType: MessageType | null
  editingMetadata: Record<string, unknown>
  hasSetCursorToEnd: string | null
  handleStartEdit: (messageId: string) => void
  handleSaveEdit: () => Promise<void>
  handleCancelEdit: () => void
  setEditingContent: React.Dispatch<React.SetStateAction<string>>
  setEditingMessageType: React.Dispatch<React.SetStateAction<MessageType | null>>
  setEditingMetadata: React.Dispatch<React.SetStateAction<Record<string, unknown>>>
  setHasSetCursorToEnd: React.Dispatch<React.SetStateAction<string | null>>

  // メッセージ削除
  deleteConfirmation: DeleteConfirmationState | null
  handleDeleteMessage: (messageId: string) => void
  handleConfirmDelete: () => Promise<void>
  setDeleteConfirmation: React.Dispatch<React.SetStateAction<DeleteConfirmationState | null>>

  // メッセージコピー
  copySuccessMessageId: string | null
  handleCopyMessage: (messageId: string) => Promise<void>

  // 画像処理
  handleImageFile: (file: File) => Promise<string>
  deleteImageFromStorage: (imageUrl: string) => Promise<void>
  handleDeleteImage: (messageId: string, imageIndex: number) => Promise<void>

  // ユーティリティ
  isUpdating: boolean
  isValidImageUrl: (url: string) => boolean
  getDefaultMetadataForType: (type: MessageType, content?: string) => Record<string, unknown> | undefined
  handleUpdateMessage: (messageId: string, updates: Partial<Message>) => Promise<void>
}

/**
 * Message operations hook
 *
 * Handles all message-related operations:
 * - Create, update, delete messages
 * - Image upload and deletion
 * - Message editing UI state
 * - Copy to clipboard
 *
 * @param props - Chat state and callbacks
 * @returns MessageOperations object
 */
export function useMessageOperations({
  chatState,
  onCacheInvalidate,
  onScrollToBottom,
  chatRepository
}: MessageOperationsProps): MessageOperations {
  const { messages, setMessages, lines, setLines } = chatState

  // 編集状態
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState("")
  const [editingMessageType, setEditingMessageType] = useState<MessageType | null>(null)
  const [editingMetadata, setEditingMetadata] = useState<Record<string, unknown>>({})
  const [hasSetCursorToEnd, setHasSetCursorToEnd] = useState<string | null>(null)

  // 削除状態
  const [deleteConfirmation, setDeleteConfirmation] = useState<DeleteConfirmationState | null>(null)

  // コピー状態
  const [copySuccessMessageId, setCopySuccessMessageId] = useState<string | null>(null)

  // 更新中フラグ
  const [isUpdating, setIsUpdating] = useState(false)

  // 画像操作フック
  const imageOps = useImageOperations({
    messages,
    setMessages,
    onCacheInvalidate,
    chatRepository
  })

  const handleUpdateMessage = useHandleUpdateMessage({
    messages,
    setMessages,
    setIsUpdating,
    onCacheInvalidate
  })

  /**
   * Send message or create branch
   */
  const handleSendMessage = useCallback(async (
    inputValue: string,
    pendingImages: string[],
    selectedBaseMessage: string | null,
    targetLineId: string
  ) => {
    if (!inputValue.trim() && pendingImages.length === 0) return

    let actualTargetLineId = targetLineId
    if (targetLineId === TIMELINE_BRANCH_ID) {
      const mainLine = Object.values(lines).find(line => line.id === 'main')
      if (!mainLine) {
        alert('メインラインが見つかりません')
        return
      }
      actualTargetLineId = mainLine.id
    }

    const currentLine = lines[actualTargetLineId]
    if (!currentLine) return

    const shouldCreateNewLine = selectedBaseMessage !== null

    setIsUpdating(true)
    try {
      if (shouldCreateNewLine) {
        const newLineName = inputValue.trim() || 'New Branch'

        // In new structure, branch is created by parent_line_id, not branchFromMessageId
        const parentLineId = selectedBaseMessage ? chatState.lines[Object.keys(chatState.lines).find(lid => {
          const lineMessages = Object.values(chatState.messages).filter(m => m.lineId === lid)
          return lineMessages.some(m => m.id === selectedBaseMessage)
        }) || '']?.id || null : null

        const newLineId = await createNewBranch(
          { name: newLineName, parent_line_id: parentLineId }
        )

        const currentTimestamp = new Date()
        const newLine = {
          id: newLineId,
          name: newLineName,
          parent_line_id: parentLineId,
          tagIds: [],
          created_at: currentTimestamp.toISOString(),
          updated_at: currentTimestamp.toISOString()
        }

        setLines((prev) => ({
          ...prev,
          [newLineId]: newLine
        }))

        chatState.setCurrentLineId(newLineId)
      } else {
        const { messageId: newMessageId, message: newMessage } = await createNewMessage({
          content: inputValue,
          images: pendingImages,
          targetLineId: actualTargetLineId
        })

        updateLocalStateAfterMessage(newMessageId, newMessage, setMessages, setLines)
      }

      // キャッシュの再検証をトリガー
      onCacheInvalidate()

      // メッセージ投稿後に最下部にスクロール
      if (onScrollToBottom) {
        setTimeout(() => {
          onScrollToBottom()
        }, 100)
      }

    } catch (error) {
      alert('メッセージの送信に失敗しました')
      throw error
    } finally {
      setIsUpdating(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, setMessages, setLines, chatState, onCacheInvalidate, onScrollToBottom])

  /**
   * Start editing message
   */
  const handleStartEdit = useCallback((messageId: string) => {
    const message = messages[messageId]
    if (message) {
      setEditingMessageId(messageId)
      setEditingContent(message.content)
      setEditingMessageType(message.type || 'text')
      setEditingMetadata(message.metadata || {})
      setHasSetCursorToEnd(null) // カーソル設定フラグをリセット
    }
  }, [messages])

  /**
   * Save edited message
   */
  const handleSaveEdit = useCallback(async () => {
    if (!editingMessageId || !editingContent.trim()) return

    setIsUpdating(true)
    try {
      const updateData = await saveMessageEdit({
        editingMessageId,
        editingContent,
        editingMessageType: editingMessageType || 'text',
        editingMetadata,
        messages
      })

      updateLocalMessageState(editingMessageId, updateData, editingContent, setMessages)
      onCacheInvalidate()

      setEditingMessageId(null)
      setEditingContent("")
      setEditingMessageType(null)
      setEditingMetadata({})
      setHasSetCursorToEnd(null)

    } catch {
      alert('メッセージの更新に失敗しました')
    } finally {
      setIsUpdating(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingMessageId, editingContent, editingMessageType, editingMetadata, setMessages, onCacheInvalidate])

  /**
   * Cancel message editing
   */
  const handleCancelEdit = useCallback(() => {
    setEditingMessageId(null)
    setEditingContent("")
    setEditingMessageType(null)
    setEditingMetadata({})
    setHasSetCursorToEnd(null)
  }, [])

  /**
   * Show delete confirmation dialog
   */
  const handleDeleteMessage = useCallback((messageId: string) => {
    const message = messages[messageId]
    if (message) {
      setDeleteConfirmation({
        messageId,
        message,
        isOpen: true
      })
    }
  }, [messages])

  /**
   * Confirm and execute message deletion
   */
  const handleConfirmDelete = useCallback(async () => {
    if (!deleteConfirmation) return

    const { messageId, message } = deleteConfirmation
    setIsUpdating(true)

    try {
      await deleteMessageFromFirestore({
        messageId,
        message,
        deleteImageFromStorage: imageOps.deleteImageFromStorage,
        isValidImageUrl
      })

      updateLocalStateAfterDelete(messageId, message, setMessages, setLines)
      onCacheInvalidate()
      setDeleteConfirmation(null)

    } catch (error) {
      console.error('Failed to delete message:', error)
      alert('メッセージの削除に失敗しました')
    } finally {
      setIsUpdating(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleteConfirmation, setMessages, setLines, imageOps.deleteImageFromStorage, onCacheInvalidate])

  /**
   * Copy message to clipboard
   */
  const handleCopyMessage = useCallback(async (messageId: string) => {
    const message = messages[messageId]
    if (message) {
      try {
        await navigator.clipboard.writeText(message.content)
        // 成功時の視覚的フィードバック
        setCopySuccessMessageId(messageId)
        setTimeout(() => {
          setCopySuccessMessageId(null)
        }, 2000)
      } catch (error) {
        console.error('Failed to copy message:', error)
        alert('クリップボードへのコピーに失敗しました')
      }
    }
  }, [messages])

  const handleCreateMessageWithTimestamp = useCallback(createMessageWithTimestamp, []);

  return {
    handleSendMessage,
    editingMessageId,
    editingContent,
    editingMessageType,
    editingMetadata,
    hasSetCursorToEnd,
    handleStartEdit,
    handleSaveEdit,
    handleCancelEdit,
    setEditingContent,
    setEditingMessageType,
    setEditingMetadata,
    setHasSetCursorToEnd,
    deleteConfirmation,
    handleDeleteMessage,
    handleConfirmDelete,
    setDeleteConfirmation,
    copySuccessMessageId,
    handleCopyMessage,
    handleImageFile: imageOps.handleImageFile,
    deleteImageFromStorage: imageOps.deleteImageFromStorage,
    handleDeleteImage: imageOps.handleDeleteImage,
    isUpdating: isUpdating || imageOps.isUpdating,
    isValidImageUrl,
    getDefaultMetadataForType,
    handleUpdateMessage,
    handleCreateMessageWithTimestamp
  }
}

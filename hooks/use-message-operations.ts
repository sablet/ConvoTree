import { useState, useCallback } from 'react'
import { dataSourceManager } from '@/lib/data-source'
import type { Message } from '@/lib/types'
import type { MessageType } from '@/lib/constants'
import { TIMELINE_BRANCH_ID } from '@/lib/constants'
import type { ChatState } from './use-chat-state'
import { isValidImageUrl } from './helpers/message-validation'
import { getDefaultMetadataForType } from './helpers/message-metadata'
import { createNewBranch, createNewMessage, updateLocalStateAfterMessage } from './helpers/message-send'
import { saveMessageEdit, updateLocalMessageState } from './helpers/message-edit'
import { deleteMessageFromFirestore, updateLocalStateAfterDelete } from './helpers/message-delete'
import { createMessageWithTimestamp } from './helpers/message-timestamp-utils'

interface MessageOperationsProps {
  chatState: ChatState
  onCacheInvalidate: () => void
  onScrollToBottom?: () => void
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
  }, [messages, setMessages, onCacheInvalidate, setIsUpdating])
}

interface DeleteConfirmationState {
  messageId: string
  message: Message
  isOpen: boolean
}

export interface MessageOperations {
  // メッセージ送信・作成
  handleSendMessage: (
    inputValue: string,
    pendingImages: string[],
    selectedBaseMessage: string | null,
    targetLineId: string,
    completeTimeline: { messages: Message[], transitions: Array<{ index: number, lineId: string, lineName: string }> }
  ) => Promise<void>
  
  // 挿入用メッセージ作成（タイムスタンプ調整可能）
  handleCreateMessageWithTimestamp: (
    content: string,
    images: string[],
    baseMessageId: string | undefined,
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
  onScrollToBottom
}: MessageOperationsProps): MessageOperations {
  const { messages, setMessages, lines, setLines, branchPoints } = chatState

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

  /**
   * Upload image file to Vercel Blob storage
   */
  const handleImageFile = useCallback(async (file: File): Promise<string> => {
    try {
      // Upload to Vercel Blob
      const filename = `${Date.now()}-${file.name}`
      const response = await fetch(`/api/upload?filename=${encodeURIComponent(filename)}`, {
        method: 'POST',
        body: file,
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Upload API error:', response.status, errorText)
        throw new Error(`Upload failed: ${response.status} ${errorText}`)
      }

      const result = await response.json()
      console.log('Upload successful:', result)
      return result.url
    } catch (error) {
      console.error('Failed to upload to Vercel Blob:', error)
      // Fallback to base64 if upload fails
      console.log('Falling back to base64 encoding')
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (e) => {
          const result = e.target?.result as string
          resolve(result)
        }
        reader.onerror = () => reject(new Error('Failed to read file'))
        reader.readAsDataURL(file)
      })
    }
  }, [])

  /**
   * Delete image from storage
   */
  const deleteImageFromStorage = useCallback(async (imageUrl: string): Promise<void> => {
    try {
      // base64データの場合は削除処理をスキップ
      if (imageUrl.startsWith('data:')) {
        console.log('Skipping deletion for base64 image data')
        return
      }

      // Vercel Blob URLの場合のみ削除API呼び出し
      const response = await fetch(`/api/delete-image?url=${encodeURIComponent(imageUrl)}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        console.error('Failed to delete image from Vercel Blob:', response.status, await response.text())
        throw new Error('Delete failed')
      }

      console.log('Successfully deleted image from Vercel Blob:', imageUrl)
    } catch (error) {
      console.error('Error deleting image:', error)
      // 削除に失敗してもメッセージ削除は続行する
    }
  }, [])

  /**
   * Delete specific image from message
   */
  const handleDeleteImage = useCallback(async (messageId: string, imageIndex: number) => {
    const message = messages[messageId]
    if (!message || !message.images || imageIndex >= message.images.length) return

    const imageUrl = message.images[imageIndex]
    setIsUpdating(true)

    try {
      // ストレージから画像を削除
      await deleteImageFromStorage(imageUrl)

      // 画像リストから該当画像を削除
      const updatedImages = message.images.filter((_, index) => index !== imageIndex)

      // Firestoreでメッセージを更新
      if (updatedImages.length > 0) {
        await dataSourceManager.updateMessage(messageId, {
          images: updatedImages
        })
      } else {
        // 画像がすべて削除された場合、imagesフィールドを完全に削除
        // nullを送信してdata-source側でdeleteField()に変換させる
        await dataSourceManager.updateMessage(messageId, {
          images: null as unknown as string[]
        })
      }

      // ローカル状態を更新
      setMessages(prev => {
        const updated = { ...prev }
        if (updated[messageId]) {
          const newMessage = {
            ...updated[messageId]
          }

          if (updatedImages.length > 0) {
            newMessage.images = updatedImages
          } else {
            // 画像がすべて削除された場合はプロパティを削除
            delete newMessage.images
          }

          newMessage.updatedAt = new Date()

          updated[messageId] = newMessage
        }
        return updated
      })

      // キャッシュをクリア
      onCacheInvalidate()

    } catch {
      alert('画像の削除に失敗しました')
    } finally {
      setIsUpdating(false)
    }
  }, [messages, setMessages, deleteImageFromStorage, onCacheInvalidate])

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
    targetLineId: string,
    completeTimeline: { messages: Message[], transitions: Array<{ index: number, lineId: string, lineName: string }> }
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

    const lastMessage = completeTimeline.messages[completeTimeline.messages.length - 1]
    const baseMessageId = selectedBaseMessage || lastMessage?.id
    const shouldCreateNewLine = selectedBaseMessage !== null

    setIsUpdating(true)
    try {
      if (shouldCreateNewLine) {
        const newLineName = inputValue.trim() || 'New Branch'
        const newLineId = await createNewBranch(
          { name: newLineName, branchFromMessageId: selectedBaseMessage },
          chatState.setBranchPoints
        )

        const currentTimestamp = new Date()
        const newLine = {
          id: newLineId,
          name: newLineName,
          messageIds: [],
          startMessageId: "",
          endMessageId: undefined,
          branchFromMessageId: selectedBaseMessage,
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
          targetLineId: actualTargetLineId,
          baseMessageId: baseMessageId || undefined
        })

        updateLocalStateAfterMessage(newMessageId, newMessage, baseMessageId || undefined, setMessages, setLines)
      }

      // キャッシュをクリア（構造が変わった可能性があるため）
      onCacheInvalidate()

      // メッセージ投稿後に最下部にスクロール
      if (onScrollToBottom) {
        setTimeout(() => {
          onScrollToBottom()
        }, 100)
      }

    } catch {
      alert('メッセージの送信に失敗しました')
    } finally {
      setIsUpdating(false)
    }
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
        branchPoints,
        deleteImageFromStorage,
        isValidImageUrl
      })

      updateLocalStateAfterDelete(messageId, message, setMessages, setLines)
      onCacheInvalidate()
      setDeleteConfirmation(null)

    } catch (error) {
      if (error instanceof Error && error.message !== 'Delete cancelled') {
        alert('メッセージの削除に失敗しました')
      }
      if (error instanceof Error && error.message === 'Delete cancelled') {
        setDeleteConfirmation(null)
      }
    } finally {
      setIsUpdating(false)
    }
  }, [deleteConfirmation, setMessages, setLines, branchPoints, deleteImageFromStorage, onCacheInvalidate])

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

  const handleCreateMessageWithTimestamp = useCallback(createMessageWithTimestamp as (content: string, images: string[], baseMessageId: string | undefined, targetLineId: string, timestamp: Date) => Promise<{ messageId: string; message: Message }>, []);

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
    handleImageFile,
    deleteImageFromStorage,
    handleDeleteImage,
    isUpdating,
    isValidImageUrl,
    getDefaultMetadataForType,
    handleUpdateMessage,
    handleCreateMessageWithTimestamp
  }
}

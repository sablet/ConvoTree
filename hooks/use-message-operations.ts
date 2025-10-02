import { useState, useCallback } from 'react'
import { dataSourceManager } from '@/lib/data-source'
import { parseSlashCommand } from '@/lib/slash-command-parser'
import type { Message } from '@/lib/types'
import type { MessageType } from '@/lib/constants'
import { MESSAGE_TYPE_TEXT, MESSAGE_TYPE_TASK, MESSAGE_TYPE_DOCUMENT, MESSAGE_TYPE_SESSION } from '@/lib/constants'
import type { ChatState } from './use-chat-state'

interface MessageOperationsProps {
  chatState: ChatState
  onCacheInvalidate: () => void
  onScrollToBottom?: () => void
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
   * Check if image URL is valid
   */
  const isValidImageUrl = (url: string): boolean => {
    if (!url || typeof url !== 'string') return false

    // 空文字列やプレースホルダーをチェック
    if (url.trim() === '' || url.includes('mockup_url') || url.includes('placeholder')) return false

    // 絶対URL（http/https）または相対パス（/で始まる）、またはdata URLをチェック
    return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/') || url.startsWith('data:')
  }

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

  /**
   * Get default metadata for message type
   */
  const getDefaultMetadataForType = useCallback((type: MessageType, content: string = ''): Record<string, unknown> | undefined => {
    switch (type) {
      case MESSAGE_TYPE_TASK:
        return {
          priority: 'medium' as const,
          completed: false,
          tags: []
        }
      case MESSAGE_TYPE_DOCUMENT:
        const wordCount = content.trim().length
        return {
          isCollapsed: false,
          wordCount,
          originalLength: wordCount
        }
      case MESSAGE_TYPE_SESSION:
        return {
          timeSpent: 0
          // checkedInAt, checkedOutAtは意図的に省略（undefinedを避ける）
        }
      case MESSAGE_TYPE_TEXT:
      default:
        return undefined
    }
  }, [])

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
    const TIMELINE_BRANCH_ID = '__timeline__'

    if (!inputValue.trim() && pendingImages.length === 0) return

    // タイムライン仮想ブランチの場合はメインラインに投稿
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
    if (!currentLine) {
      return
    }

    // 現在のタイムラインの最後のメッセージを取得
    const lastMessage = completeTimeline.messages[completeTimeline.messages.length - 1]
    const baseMessageId = selectedBaseMessage || lastMessage?.id

    // ベースメッセージが選択されている場合は常に新しいラインを作成
    const shouldCreateNewLine = selectedBaseMessage !== null

    setIsUpdating(true)
    try {
      if (shouldCreateNewLine) {
        // 新しい分岐を作成（テキストは分岐名として使用、メッセージは作成しない）
        const newLineName = inputValue.trim() || 'New Branch'
        const currentTimestamp = new Date()

        // 20文字以上の分岐名の場合は確認ダイアログを表示
        if (newLineName.length >= 20) {
          const confirmCreate = window.confirm(
            `分岐名が20文字以上です（${newLineName.length}文字）。\n\n「${newLineName}」\n\nこの名前で分岐を作成しますか？`
          )
          if (!confirmCreate) {
            setIsUpdating(false)
            return
          }
        }

        // 1. 新しいラインをFirestoreに作成（空の状態）
        const newLineId = await dataSourceManager.createLine({
          name: newLineName,
          messageIds: [],
          startMessageId: "",
          branchFromMessageId: selectedBaseMessage,
          tagIds: [],
          created_at: currentTimestamp.toISOString(),
          updated_at: currentTimestamp.toISOString()
        })

        // 2. 分岐点をFirestoreに作成/更新（自動で分岐点作成も含む）
        await dataSourceManager.addLineToBranchPoint(selectedBaseMessage, newLineId)

        // 3. ローカル状態を更新（空のライン）
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

        chatState.setBranchPoints((prev) => {
          const updated = { ...prev }
          if (updated[selectedBaseMessage]) {
            updated[selectedBaseMessage] = {
              ...updated[selectedBaseMessage],
              lines: [...updated[selectedBaseMessage].lines, newLineId]
            }
          } else {
            updated[selectedBaseMessage] = {
              messageId: selectedBaseMessage,
              lines: [newLineId]
            }
          }
          return updated
        })

        // 新しいラインに切り替え
        chatState.setCurrentLineId(newLineId)

        // Trigger onNewLineCreated callback if provided
        // Note: This should be passed from the parent component

      } else {
        // 既存のライン継続 - スラッシュコマンドを解析してメッセージを作成
        const parsedMessage = parseSlashCommand(inputValue)
        const currentTimestamp = new Date()

        const messageData = {
          content: parsedMessage.content,
          timestamp: currentTimestamp.toISOString(),
          lineId: actualTargetLineId,
          prevInLine: baseMessageId,
          author: "User",
          type: parsedMessage.type,
          ...(pendingImages.length > 0 && { images: [...pendingImages] }),
          ...(parsedMessage.metadata !== undefined && { metadata: parsedMessage.metadata }),
        }

        // アトミックなメッセージ作成（トランザクション）
        const newMessageId = await dataSourceManager.createMessageWithLineUpdate(
          messageData,
          actualTargetLineId,
          baseMessageId
        )

        // ローカル状態を更新（トランザクション成功後のため安全）
        const newMessage: Message = {
          id: newMessageId,
          content: parsedMessage.content,
          timestamp: currentTimestamp,
          lineId: actualTargetLineId,
          prevInLine: baseMessageId,
          author: "User",
          type: parsedMessage.type,
          ...(parsedMessage.metadata !== undefined && { metadata: parsedMessage.metadata }),
          ...(pendingImages.length > 0 && { images: [...pendingImages] }),
        }

        setMessages((prev) => {
          const updated = { ...prev }
          updated[newMessageId] = newMessage

          // 前のメッセージのnextInLineを更新
          if (baseMessageId && updated[baseMessageId]) {
            updated[baseMessageId] = {
              ...updated[baseMessageId],
              nextInLine: newMessageId,
            }
          }

          return updated
        })

        setLines((prev) => {
          const updated = { ...prev }
          if (updated[actualTargetLineId]) {
            const updatedMessageIds = [...updated[actualTargetLineId].messageIds, newMessageId]
            const isFirstMessage = updated[actualTargetLineId].messageIds.length === 0

            updated[actualTargetLineId] = {
              ...updated[actualTargetLineId],
              messageIds: updatedMessageIds,
              endMessageId: newMessageId,
              ...(isFirstMessage && { startMessageId: newMessageId }),
              updated_at: currentTimestamp.toISOString()
            }
          }
          return updated
        })
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
  }, [messages, lines, setMessages, setLines, chatState, onCacheInvalidate, onScrollToBottom])

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
      const currentMessage = messages[editingMessageId]
      const newType = editingMessageType || 'text'
      const typeChanged = currentMessage.type !== newType

      const updateData: Partial<Message> = {
        content: editingContent.trim()
      }

      // タイプが変更された場合
      if (typeChanged) {
        updateData.type = newType

        // 新しいタイプに適したメタデータを設定
        if (newType === 'text') {
          // textタイプに変更する場合、メタデータを削除
          updateData.metadata = null as unknown as Record<string, unknown>
        } else {
          // 他のタイプに変更する場合、編集されたメタデータまたはデフォルトメタデータを設定
          updateData.metadata = Object.keys(editingMetadata).length > 0
            ? editingMetadata
            : getDefaultMetadataForType(newType, editingContent.trim())
        }
      } else {
        // タイプが変更されていない場合、編集されたメタデータを使用
        if (Object.keys(editingMetadata).length > 0) {
          updateData.metadata = editingMetadata
        }
      }

      // timestamp以外の更新データを作成（data-sourceとの型整合性のため）
      const { timestamp, ...safeUpdateData } = updateData
      const dataSourceUpdateData = {
        ...safeUpdateData,
        ...(timestamp && { timestamp: timestamp instanceof Date ? timestamp.toISOString() : timestamp })
      }

      await dataSourceManager.updateMessage(editingMessageId, dataSourceUpdateData)

      // ローカル状態を強制的に更新（新しいオブジェクトを作成して確実に再レンダリング）
      setMessages(prev => {
        const newMessages = { ...prev }
        const updatedMessage = {
          ...prev[editingMessageId],
          content: editingContent.trim(),
          ...(typeChanged && { type: newType }),
          ...(updateData.metadata !== undefined && {
            metadata: updateData.metadata === null ? undefined : updateData.metadata
          })
        }

        // メタデータがnullの場合は削除
        if (updateData.metadata === null) {
          delete updatedMessage.metadata
        }

        newMessages[editingMessageId] = updatedMessage
        return newMessages
      })

      // キャッシュをクリアして確実に再計算
      onCacheInvalidate()

      // 編集状態をクリア
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
  }, [editingMessageId, editingContent, editingMessageType, editingMetadata, messages, setMessages, getDefaultMetadataForType, onCacheInvalidate])

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
      // 分岐の起点メッセージかどうかをチェック
      const isBranchPoint = branchPoints[messageId] && branchPoints[messageId].lines.length > 0

      if (isBranchPoint) {
        const confirmBranchDelete = window.confirm(
          'このメッセージは分岐の起点です。削除すると関連する分岐も影響を受けます。本当に削除しますか？'
        )
        if (!confirmBranchDelete) {
          setDeleteConfirmation(null)
          setIsUpdating(false)
          return
        }
      }

      // メッセージに関連する画像を削除
      if (message.images && message.images.length > 0) {
        const deletePromises = message.images
          .filter(imageUrl => isValidImageUrl(imageUrl))
          .map(imageUrl => deleteImageFromStorage(imageUrl))

        await Promise.allSettled(deletePromises)
      }

      await dataSourceManager.deleteMessage(messageId)

      // ローカル状態から削除
      setMessages(prev => {
        const updated = { ...prev }
        delete updated[messageId]
        return updated
      })

      // ラインからメッセージIDを削除
      const deleteTimestamp = new Date()
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

      // キャッシュをクリア
      onCacheInvalidate()

      setDeleteConfirmation(null)

    } catch {
      alert('メッセージの削除に失敗しました')
    } finally {
      setIsUpdating(false)
    }
  }, [deleteConfirmation, messages, setMessages, setLines, branchPoints, isValidImageUrl, deleteImageFromStorage, onCacheInvalidate])

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
    getDefaultMetadataForType
  }
}

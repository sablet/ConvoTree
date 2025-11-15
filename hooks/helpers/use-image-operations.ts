import { useState, useCallback } from 'react'
import { dataSourceManager } from '@/lib/data-source'
import type { Message } from '@/lib/types'
import type { ChatRepository } from '@/lib/repositories/chat-repository'

interface UseImageOperationsProps {
  messages: Record<string, Message>
  setMessages: React.Dispatch<React.SetStateAction<Record<string, Message>>>
  onCacheInvalidate: () => void
  chatRepository: ChatRepository
}

interface ImageOperations {
  handleImageFile: (file: File) => Promise<string>
  deleteImageFromStorage: (imageUrl: string) => Promise<void>
  handleDeleteImage: (messageId: string, imageIndex: number) => Promise<void>
  isUpdating: boolean
}

/**
 * Image operations hook
 *
 * Handles image upload, deletion, and storage management
 */
export function useImageOperations({
  messages,
  setMessages,
  onCacheInvalidate,
  chatRepository
}: UseImageOperationsProps): ImageOperations {
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
      await chatRepository.clearAllCache()

    } catch {
      alert('画像の削除に失敗しました')
    } finally {
      setIsUpdating(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, setMessages, deleteImageFromStorage, onCacheInvalidate])

  return {
    handleImageFile,
    deleteImageFromStorage,
    handleDeleteImage,
    isUpdating
  }
}

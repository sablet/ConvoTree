"use client"

import { useState, useRef, useEffect, useMemo, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Send, Zap, Edit3, Plus, X, GitBranch, Trash2, Check } from "lucide-react"
import Image from "next/image"
import { dataSourceManager } from "@/lib/data-source"
import { HamburgerMenu } from "@/components/hamburger-menu"
import { RecentLinesFooter } from "@/components/recent-lines-footer"

interface Message {
  id: string
  content: string
  timestamp: Date
  lineId: string // 所属するラインID
  prevInLine?: string // 同ライン内の前のメッセージ
  nextInLine?: string // 同ライン内の次のメッセージ
  branchFromMessageId?: string // 分岐元のメッセージID（このラインの最初のメッセージの場合）
  tags?: string[]
  hasBookmark?: boolean
  author?: string
  images?: string[]
}

interface Line {
  id: string
  name: string
  messageIds: string[] // このラインに属するメッセージのIDリスト
  startMessageId: string // ラインの開始メッセージ
  endMessageId?: string // ラインの終了メッセージ（まだ続いている場合はundefined）
  branchFromMessageId?: string // 分岐元のメッセージID（メインライン以外）
  tagIds?: string[] // タグIDの配列
  created_at: string
  updated_at: string
}

interface Tag {
  id: string
  name: string
}

interface BranchPoint {
  messageId: string // 分岐点となるメッセージ
  lines: string[] // この分岐点から派生するラインのIDリスト
}

// Development logger for debugging
const DEV_LOG = {
  enabled: process.env.NODE_ENV === 'development',
  data: (message: string, data?: unknown) => {
    if (DEV_LOG.enabled) {
      console.log(`[BranchingChat] ${message}`, data || '')
    }
  },
  error: (message: string, error?: unknown) => {
    if (DEV_LOG.enabled) {
      console.error(`[BranchingChat] ${message}`, error || '')
    }
  }
}

interface BranchingChatUIProps {
  initialMessages?: Record<string, Message>
  initialLines?: Record<string, Line>
  initialBranchPoints?: Record<string, BranchPoint>
  initialTags?: Record<string, Tag>
  initialCurrentLineId?: string
  onLineChange?: (lineId: string) => void
  onNewLineCreated?: (lineId: string, lineName: string) => void
}

interface DeleteConfirmationState {
  messageId: string
  message: Message
  isOpen: boolean
}

export function BranchingChatUI({
  initialMessages = {},
  initialLines = {},
  initialBranchPoints = {},
  initialTags = {},
  initialCurrentLineId = '',
  onLineChange,
  onNewLineCreated
}: BranchingChatUIProps) {
  const [messages, setMessages] = useState<Record<string, Message>>(initialMessages)
  const [lines, setLines] = useState<Record<string, Line>>(initialLines)
  const [branchPoints, setBranchPoints] = useState<Record<string, BranchPoint>>(initialBranchPoints)
  const [tags, setTags] = useState<Record<string, Tag>>(initialTags)

  const [currentLineId, setCurrentLineId] = useState<string>(initialCurrentLineId)

  // パフォーマンス最適化: パスキャッシュとメモ化
  const [pathCache, setPathCache] = useState<Map<string, { messages: Message[], transitions: Array<{ index: number, lineId: string, lineName: string }> }>>(new Map())
  const [lineAncestryCache, setLineAncestryCache] = useState<Map<string, string[]>>(new Map())
  const [inputValue, setInputValue] = useState("")
  const [selectedBaseMessage, setSelectedBaseMessage] = useState<string | null>(null)
  const [pendingImages, setPendingImages] = useState<string[]>([])
  const [isEditingBranch, setIsEditingBranch] = useState(false)
  const [editingBranchData, setEditingBranchData] = useState<{
    name: string
    tagIds: string[]
    newTag: string
  }>({ name: "", tagIds: [], newTag: "" })

  // メッセージ編集・削除関連の状態
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState("")
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null)
  const [hoveredImageId, setHoveredImageId] = useState<string | null>(null)
  const [deleteConfirmation, setDeleteConfirmation] = useState<DeleteConfirmationState | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const [scrollPositions, setScrollPositions] = useState<Map<string, number>>(new Map())
  const [footerKey, setFooterKey] = useState(0) // フッター強制更新用

  // 画像URLが有効かどうかをチェックする関数
  const isValidImageUrl = (url: string): boolean => {
    if (!url || typeof url !== 'string') return false

    // 空文字列やプレースホルダーをチェック
    if (url.trim() === '' || url.includes('mockup_url') || url.includes('placeholder')) return false

    // 絶対URL（http/https）または相対パス（/で始まる）、またはdata URLをチェック
    return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/') || url.startsWith('data:')
  }

  const getRelativeTime = (dateString: string): string => {
    if (!dateString) return ""

    const now = new Date()
    const date = new Date(dateString)

    // 無効な日付をチェック
    if (isNaN(date.getTime())) return ""

    const diffMs = now.getTime() - date.getTime()
    const diffMinutes = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffMinutes < 1) return "今"
    if (diffMinutes < 60) return `${diffMinutes}分前`
    if (diffHours < 24) return `${diffHours}時間前`
    if (diffDays < 30) return `${diffDays}日前`

    const diffMonths = Math.floor(diffDays / 30)
    return `${diffMonths}ヶ月前`
  }

  // 日付フォーマット関数
  const formatDateForSeparator = (date: Date): string => {
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)

    const messageDate = new Date(date)

    // 今日の場合
    if (messageDate.toDateString() === today.toDateString()) {
      return "今日"
    }

    // 昨日の場合
    if (messageDate.toDateString() === yesterday.toDateString()) {
      return "昨日"
    }

    // その他の場合は "M/D(曜日)" 形式
    const month = messageDate.getMonth() + 1
    const day = messageDate.getDate()
    const weekdays = ["日", "月", "火", "水", "木", "金", "土"]
    const weekday = weekdays[messageDate.getDay()]

    return `${month}/${day}(${weekday})`
  }

  // 日付が変わったかどうかをチェック
  const isSameDay = (date1: Date, date2: Date): boolean => {
    return date1.toDateString() === date2.toDateString()
  }



  // 初期データの更新を監視（propsが変更されたら常に更新）
  useEffect(() => {
    setMessages(initialMessages)
    DEV_LOG.data('Messages updated from props', { count: Object.keys(initialMessages).length })
  }, [initialMessages])

  useEffect(() => {
    setLines(initialLines)
    DEV_LOG.data('Lines updated from props', { count: Object.keys(initialLines).length })
  }, [initialLines])

  useEffect(() => {
    setBranchPoints(initialBranchPoints)
    DEV_LOG.data('BranchPoints updated from props', { count: Object.keys(initialBranchPoints).length })
  }, [initialBranchPoints])

  useEffect(() => {
    setTags(initialTags)
    DEV_LOG.data('Tags updated from props', { count: Object.keys(initialTags).length })
  }, [initialTags])

  useEffect(() => {
    if (initialCurrentLineId) {
      setCurrentLineId(initialCurrentLineId)
    }
  }, [initialCurrentLineId])


  // ブランチ選択時の自動スクロールを無効化
  // useEffect(() => {
  //   scrollToBottom()
  // }, [currentLineId])

  const handleImageFile = async (file: File): Promise<string> => {
    try {
      // Upload to Vercel Blob
      const filename = `${Date.now()}-${file.name}`
      const response = await fetch(`/api/upload?filename=${encodeURIComponent(filename)}`, {
        method: 'POST',
        body: file,
      })

      if (!response.ok) {
        throw new Error('Upload failed')
      }

      const { url } = await response.json()
      return url
    } catch (error) {
      console.error('Failed to upload image:', error)
      // Fallback to base64 if upload fails
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
  }

  // 画像を削除する関数
  const deleteImageFromStorage = async (imageUrl: string): Promise<void> => {
    try {
      const response = await fetch(`/api/delete-image?url=${encodeURIComponent(imageUrl)}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Delete failed')
      }

      DEV_LOG.data('Image deleted from storage', { imageUrl })
    } catch (error) {
      DEV_LOG.error('Failed to delete image from storage', { imageUrl, error })
      // 削除に失敗してもメッセージ削除は続行する
    }
  }

  // メッセージから特定の画像のみを削除する関数
  const handleDeleteImage = async (messageId: string, imageIndex: number) => {
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

      DEV_LOG.data('Image deleted from message', { messageId, imageIndex, imageUrl })
    } catch (error) {
      DEV_LOG.error('Failed to delete image from message', error)
      alert('画像の削除に失敗しました')
    } finally {
      setIsUpdating(false)
    }
  }

  const handlePaste = useCallback(async (e: ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return

    const imageFiles: File[] = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) {
          imageFiles.push(file)
        }
      }
    }

    if (imageFiles.length > 0) {
      e.preventDefault()
      try {
        const imageUrls = await Promise.all(
          imageFiles.map(file => handleImageFile(file))
        )
        setPendingImages(prev => [...prev, ...imageUrls])
      } catch (error) {
        console.error('Failed to process images:', error)
      }
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
        // Clipboard paste will be handled by handlePaste
      }
    }

    document.addEventListener('paste', handlePaste)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('paste', handlePaste)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [handlePaste])

  // 新しいライン構造に対応した分岐取得
  const getBranchingLines = (messageId: string): Line[] => {
    const branchPoint = branchPoints[messageId]
    if (!branchPoint || !branchPoint.lines.length) return []

    return branchPoint.lines.map(lineId => lines[lineId]).filter(Boolean)
  }

  // ラインの祖先チェーンをメモ化で取得
  const getLineAncestry = useCallback((lineId: string): string[] => {
    // キャッシュチェック
    if (lineAncestryCache.has(lineId)) {
      return lineAncestryCache.get(lineId)!
    }

    const line = lines[lineId]
    if (!line) {
      return []
    }

    let ancestry: string[] = []

    // 分岐元がある場合は親ラインの祖先を取得
    if (line.branchFromMessageId) {
      const branchFromMessage = messages[line.branchFromMessageId]
      if (branchFromMessage) {
        const parentLineId = branchFromMessage.lineId
        const parentAncestry = getLineAncestry(parentLineId)
        ancestry = [...parentAncestry, parentLineId]
      }
    }

    // キャッシュに保存
    lineAncestryCache.set(lineId, ancestry)
    return ancestry
  }, [lines, messages, lineAncestryCache])

  // パフォーマンス最適化されたパス取得
  const getOptimizedPath = useCallback((lineId: string): { messages: Message[], transitions: Array<{ index: number, lineId: string, lineName: string }> } => {
    // キャッシュチェック
    if (pathCache.has(lineId)) {
      return pathCache.get(lineId)!
    }

    const ancestry = getLineAncestry(lineId)
    const fullLineChain = [...ancestry, lineId]

    const allMessages: Message[] = []
    const transitions: Array<{ index: number, lineId: string, lineName: string }> = []

    for (let i = 0; i < fullLineChain.length; i++) {
      const currentLineInChain = lines[fullLineChain[i]]
      if (!currentLineInChain) continue

      // ライン切り替えポイントを記録
      if (i > 0) {
        transitions.push({
          index: allMessages.length,
          lineId: currentLineInChain.id,
          lineName: currentLineInChain.name
        })
      }

      // メッセージを追加
      if (i < fullLineChain.length - 1) {
        // 中間ライン: 分岐点までのメッセージのみ
        const nextLine = lines[fullLineChain[i + 1]]
        if (nextLine?.branchFromMessageId) {
          const branchPointIndex = currentLineInChain.messageIds.indexOf(nextLine.branchFromMessageId)
          if (branchPointIndex >= 0) {
            const segmentMessages = currentLineInChain.messageIds
              .slice(0, branchPointIndex + 1)
              .map(msgId => messages[msgId])
              .filter(Boolean)
            allMessages.push(...segmentMessages)
          }
        }
      } else {
        // 最終ライン: 全メッセージ
        const lineMessages = currentLineInChain.messageIds
          .map(msgId => messages[msgId])
          .filter(Boolean)
        allMessages.push(...lineMessages)
      }
    }

    const result = { messages: allMessages, transitions }

    // キャッシュに保存
    pathCache.set(lineId, result)
    return result
  }, [getLineAncestry, lines, messages, pathCache])

  // メモ化されたタイムライン取得
  const getCompleteTimeline = useCallback(() => {
    if (!currentLineId || !lines[currentLineId]) {
      DEV_LOG.data('No current line found', {
        currentLineId,
        availableLines: Object.keys(lines)
      })
      return { messages: [], transitions: [] }
    }

    const result = getOptimizedPath(currentLineId)
    return result
  }, [currentLineId, lines, getOptimizedPath])

  // useMemoでメモ化されたタイムラインを取得（messagesの変更も監視）
  const completeTimeline = useMemo(() => {
    return getCompleteTimeline()
  }, [getCompleteTimeline, messages, lines])

  // スクロール位置を保存する関数
  const saveScrollPosition = useCallback((lineId: string) => {
    if (messagesContainerRef.current) {
      const scrollTop = messagesContainerRef.current.scrollTop
      setScrollPositions(prev => new Map(prev).set(lineId, scrollTop))
    }
  }, [])

  // スクロール位置を復元する関数
  const restoreScrollPosition = useCallback((lineId: string) => {
    const savedPosition = scrollPositions.get(lineId)
    if (savedPosition !== undefined && messagesContainerRef.current) {
      // 少し遅延させてDOMの更新を待つ
      setTimeout(() => {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTop = savedPosition
        }
      }, 50)
    }
  }, [scrollPositions])

  // ラインの切り替え（スクロール位置保持機能付き）
  const switchToLine = (lineId: string) => {
    if (lines[lineId]) {
      // 現在のラインのスクロール位置を保存
      if (currentLineId) {
        saveScrollPosition(currentLineId)
      }

      setCurrentLineId(lineId)

      // 外部コールバックを呼び出し
      if (onLineChange) {
        onLineChange(lineId)
      }

      // 新しいラインのスクロール位置を復元
      restoreScrollPosition(lineId)
    }
  }

  // メッセージのライン情報を取得（表示用）
  const getMessageLineInfo = (messageIndex: number, timeline: { messages: Message[], transitions: Array<{ index: number, lineId: string, lineName: string }> }) => {
    const { transitions } = timeline
    const message = timeline.messages[messageIndex]

    if (!message) {
      return {
        isLineStart: false,
        isCurrentLine: false,
        lineInfo: null,
        transitionInfo: null
      }
    }

    // このメッセージがラインの開始点かどうかをチェック
    const transitionAtThisIndex = transitions.find(t => t.index === messageIndex)
    const isLineStart = transitionAtThisIndex !== undefined

    // 現在ラインかどうかをチェック
    const isCurrentLine = message.lineId === currentLineId

    return {
      isLineStart,
      isCurrentLine,
      lineInfo: lines[message.lineId],
      transitionInfo: transitionAtThisIndex || null
    }
  }

  // 現在のラインオブジェクトを取得
  const getCurrentLine = (): Line | null => {
    return lines[currentLineId] || null
  }

  const handleSendMessage = async () => {
    if (!inputValue.trim() && pendingImages.length === 0) return

    const currentLine = lines[currentLineId]
    if (!currentLine) {
      DEV_LOG.error('No current line found for message sending', { currentLineId })
      return
    }

    // 現在のタイムラインの最後のメッセージを取得
    const timeline = completeTimeline
    const lastMessage = timeline.messages[timeline.messages.length - 1]
    const baseMessageId = selectedBaseMessage || lastMessage?.id

    DEV_LOG.data('Sending message', {
      lineId: currentLine.id,
      baseMessageId,
      isNewBranch: selectedBaseMessage !== null
    })

    // ベースメッセージが選択されている場合は常に新しいラインを作成
    const shouldCreateNewLine = selectedBaseMessage !== null

    setIsUpdating(true)
    try {
      if (shouldCreateNewLine) {
        // 新しい分岐を作成（テキストは分岐名として使用、メッセージは作成しない）
        const newLineName = inputValue.trim() || 'New Branch'

        // 1. 新しいラインをFirestoreに作成（空の状態）
        const newLineId = await dataSourceManager.createLine({
          name: newLineName,
          messageIds: [],
          startMessageId: "",
          branchFromMessageId: selectedBaseMessage,
          tagIds: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })

        // 2. 分岐点をFirestoreに作成/更新（自動で分岐点作成も含む）
        await dataSourceManager.addLineToBranchPoint(selectedBaseMessage!, newLineId)

        // 3. ローカル状態を更新（空のライン）
        const newLine: Line = {
          id: newLineId,
          name: newLineName,
          messageIds: [],
          startMessageId: "",
          endMessageId: undefined,
          branchFromMessageId: selectedBaseMessage,
          tagIds: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }

        setLines((prev) => ({
          ...prev,
          [newLineId]: newLine
        }))

        setBranchPoints((prev) => {
          const updated = { ...prev }
          if (updated[selectedBaseMessage!]) {
            updated[selectedBaseMessage!] = {
              ...updated[selectedBaseMessage!],
              lines: [...updated[selectedBaseMessage!].lines, newLineId]
            }
          } else {
            updated[selectedBaseMessage!] = {
              messageId: selectedBaseMessage!,
              lines: [newLineId]
            }
          }
          return updated
        })

        // 新しいラインに切り替え
        setCurrentLineId(newLineId)

        // 新しいライン作成時専用のコールバックを呼び出し（URL更新のため）
        if (onNewLineCreated) {
          DEV_LOG.data('Calling onNewLineCreated', { newLineId, newLineName })
          onNewLineCreated(newLineId, newLineName)
        } else {
          DEV_LOG.error('onNewLineCreated callback not provided')
        }

        // フッターを強制更新
        setFooterKey(prev => prev + 1)

      } else {
        // 既存のライン継続 - Firestoreにメッセージを作成
        const newMessageId = await dataSourceManager.createMessage({
          content: inputValue,
          timestamp: new Date().toISOString(),
          lineId: currentLineId,
          prevInLine: baseMessageId,
          author: "User",
          ...(pendingImages.length > 0 && { images: [...pendingImages] }),
        })

        // 前のメッセージのnextInLineを更新（Firestore）
        if (baseMessageId) {
          await dataSourceManager.updateMessage(baseMessageId, {
            nextInLine: newMessageId
          })
        }

        // ラインのメッセージリストを更新（Firestore）
        const updatedMessageIds = [...currentLine.messageIds, newMessageId]
        const isFirstMessage = currentLine.messageIds.length === 0

        await dataSourceManager.updateLine(currentLineId, {
          messageIds: updatedMessageIds,
          endMessageId: newMessageId,
          ...(isFirstMessage && { startMessageId: newMessageId }), // 最初のメッセージの場合はstartMessageIdも設定
          updated_at: new Date().toISOString()
        })

        // ローカル状態を更新
        const newMessage: Message = {
          id: newMessageId,
          content: inputValue,
          timestamp: new Date(),
          lineId: currentLineId,
          prevInLine: baseMessageId,
          author: "User",
          ...(pendingImages.length > 0 && { images: [...pendingImages] }),
        }

        setMessages((prev) => {
          const updated = { ...prev }
          updated[newMessageId] = newMessage

          // 前のメッセージのnextInLineを更新
          if (updated[baseMessageId]) {
            updated[baseMessageId] = {
              ...updated[baseMessageId],
              nextInLine: newMessageId,
            }
          }

          return updated
        })

        setLines((prev) => {
          const updated = { ...prev }
          if (updated[currentLineId]) {
            updated[currentLineId] = {
              ...updated[currentLineId],
              messageIds: updatedMessageIds,
              endMessageId: newMessageId,
              ...(isFirstMessage && { startMessageId: newMessageId }), // 最初のメッセージの場合はstartMessageIdも設定
              updated_at: new Date().toISOString()
            }
          }
          return updated
        })
      }

      // キャッシュをクリア（構造が変わった可能性があるため）
      setPathCache(new Map())
      setLineAncestryCache(new Map())

      setInputValue("")
      setPendingImages([])
      setSelectedBaseMessage(null)

      DEV_LOG.data('Message sent successfully')

      // メッセージ投稿時はローカル状態が既に更新されているため、
      // 親のデータリロードは不要（リロードすると画面が上部に戻されてしまう）
    } catch (error) {
      DEV_LOG.error('Failed to send message', error)
      alert('メッセージの送信に失敗しました')
    } finally {
      setIsUpdating(false)
    }
  }

  // メッセージ編集開始
  const handleStartEdit = (messageId: string) => {
    const message = messages[messageId]
    if (message) {
      setEditingMessageId(messageId)
      setEditingContent(message.content)
    }
  }

  // メッセージ編集保存
  const handleSaveEdit = async () => {
    if (!editingMessageId || !editingContent.trim()) return

    setIsUpdating(true)
    try {
      await dataSourceManager.updateMessage(editingMessageId, {
        content: editingContent.trim()
      })

      // ローカル状態を強制的に更新（新しいオブジェクトを作成して確実に再レンダリング）
      setMessages(prev => {
        const newMessages = { ...prev }
        newMessages[editingMessageId] = {
          ...prev[editingMessageId],
          content: editingContent.trim()
        }
        return newMessages
      })

      // キャッシュをクリアして確実に再計算
      setPathCache(new Map())
      setLineAncestryCache(new Map())

      // 編集状態をクリア
      setEditingMessageId(null)
      setEditingContent("")

      DEV_LOG.data('Message updated successfully', { messageId: editingMessageId, newContent: editingContent.trim() })

      // メッセージ編集時はローカル状態が既に更新されているため、
      // 親のデータリロードは不要（リロードすると画面が上部に戻されてしまう）
    } catch (error) {
      DEV_LOG.error('Failed to update message', error)
      alert('メッセージの更新に失敗しました')
    } finally {
      setIsUpdating(false)
    }
  }

  // メッセージ編集キャンセル
  const handleCancelEdit = () => {
    setEditingMessageId(null)
    setEditingContent("")
  }

  // メッセージ削除確認ダイアログを開く
  const handleDeleteMessage = (messageId: string) => {
    const message = messages[messageId]
    if (message) {
      setDeleteConfirmation({
        messageId,
        message,
        isOpen: true
      })
    }
  }

  // メッセージ削除確認
  const handleConfirmDelete = async () => {
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
      setLines(prev => {
        const updated = { ...prev }
        const lineId = message.lineId
        if (updated[lineId]) {
          updated[lineId] = {
            ...updated[lineId],
            messageIds: updated[lineId].messageIds.filter(id => id !== messageId),
            updated_at: new Date().toISOString()
          }
        }
        return updated
      })

      // キャッシュをクリア
      setPathCache(new Map())
      setLineAncestryCache(new Map())

      setDeleteConfirmation(null)
      DEV_LOG.data('Message deleted successfully', { messageId })

      // メッセージ削除時はローカル状態が既に更新されているため、
      // 親のデータリロードは不要（リロードすると画面が上部に戻されてしまう）
    } catch (error) {
      DEV_LOG.error('Failed to delete message', error)
      alert('メッセージの削除に失敗しました')
    } finally {
      setIsUpdating(false)
    }
  }

  const handleMessageTap = (messageId: string) => {
    // If the clicked message is already selected, deselect it
    if (selectedBaseMessage === messageId) {
      setSelectedBaseMessage(null)
    } else {
      // Otherwise, select it
      setSelectedBaseMessage(messageId)
    }
  }

  const handleEditLine = () => {
    const currentLineInfo = getCurrentLine()
    if (currentLineInfo) {
      setEditingBranchData({
        name: currentLineInfo.name,
        tagIds: [...(currentLineInfo.tagIds || [])],
        newTag: ""
      })
      setIsEditingBranch(true)
    }
  }

  const handleSaveLineEdit = () => {
    const currentLineInfo = getCurrentLine()
    if (currentLineInfo) {
      setLines((prev) => {
        const updated = { ...prev }
        if (updated[currentLineId]) {
          updated[currentLineId] = {
            ...updated[currentLineId],
            name: editingBranchData.name,
            tagIds: editingBranchData.tagIds,
            updated_at: new Date().toISOString()
          }
        }
        return updated
      })
      setIsEditingBranch(false)
    }
  }

  const handleAddTag = () => {
    if (editingBranchData.newTag.trim()) {
      // 新しいタグを作成
      const newTagId = `tag_${Date.now()}`
      const newTag: Tag = {
        id: newTagId,
        name: editingBranchData.newTag.trim()
      }

      // タグを追加
      setTags(prev => ({
        ...prev,
        [newTagId]: newTag
      }))

      // 編集データを更新
      setEditingBranchData(prev => ({
        ...prev,
        tagIds: [...prev.tagIds, newTagId],
        newTag: ""
      }))
    }
  }

  const handleRemoveTag = (tagIndex: number) => {
    setEditingBranchData(prev => ({
      ...prev,
      tagIds: prev.tagIds.filter((_, index) => index !== tagIndex)
    }))
  }

  const currentLineInfo = getCurrentLine()
  // completeTimelineは既にuseMemoで定義済み

  // Development state logging (minimal)
  if (DEV_LOG.enabled && currentLineId && !currentLineInfo) {
    DEV_LOG.data('Render state mismatch', {
      currentLineId,
      hasLineInfo: !!currentLineInfo,
      timelineCount: completeTimeline.messages.length
    })
  }

  const renderTimelineMinimap = () => {
    if (!completeTimeline.messages.length) return null

    // 現在のラインの祖先チェーンを取得
    const ancestry = getLineAncestry(currentLineId)
    const breadcrumbPath = [...ancestry, currentLineId]

    return (
      <div className="px-4 py-2 border-b border-gray-200 bg-white">
        {/* パンくずリスト */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {breadcrumbPath.map((lineId, index) => {
            const line = lines[lineId]
            if (!line) return null

            const isCurrentLine = lineId === currentLineId
            const isLast = index === breadcrumbPath.length - 1

            return (
              <div key={`breadcrumb-${lineId}-${index}`} className="flex items-center gap-1 flex-shrink-0">
                <button
                  className={`px-2 py-1 rounded-md text-xs font-medium transition-all duration-200 whitespace-nowrap ${
                    isCurrentLine
                      ? 'bg-blue-500 text-white shadow-sm'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-700 hover:text-gray-900'
                  }`}
                  onClick={() => switchToLine(lineId)}
                >
                  {line.name}
                </button>
                {!isLast && (
                  <div className="text-gray-400 text-xs font-medium px-1">
                    &gt;
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Timeline Minimap */}
      {renderTimelineMinimap()}

      {/* Current Line Header */}
      {currentLineInfo && (
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          {!isEditingBranch ? (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-medium text-gray-800">{currentLineInfo.name}</h2>
                  {currentLineInfo.branchFromMessageId && (
                    <p className="text-xs text-blue-500">分岐元: {messages[currentLineInfo.branchFromMessageId]?.content.slice(0, 20)}...</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleEditLine}
                  className="h-8 px-2 text-gray-400 hover:text-gray-600"
                >
                  <Edit3 className="h-4 w-4" />
                </Button>
              </div>
              {currentLineInfo.tagIds && currentLineInfo.tagIds.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {currentLineInfo.tagIds.map((tagId, tagIndex) => {
                    const tag = tags[tagId]
                    if (!tag) return null
                    return (
                      <Badge key={`current-line-tag-${tagIndex}`} variant="secondary" className="text-xs bg-emerald-100 text-emerald-700">
                        {tag.name}
                      </Badge>
                    )
                  })}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-3">
              {/* タイトル編集 */}
              <div>
                <Input
                  value={editingBranchData.name}
                  onChange={(e) => setEditingBranchData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="ラインタイトル"
                  className="text-sm font-medium"
                />
              </div>

              {/* タグ編集 */}
              <div>
                <div className="flex flex-wrap gap-1 mb-2">
                  {editingBranchData.tagIds.map((tagId, tagIndex) => {
                    const tag = tags[tagId]
                    if (!tag) return null
                    return (
                      <div key={tagIndex} className="flex items-center">
                        <Badge variant="secondary" className="text-xs bg-emerald-100 text-emerald-700 pr-1">
                          {tag.name}
                          <button
                            onClick={() => handleRemoveTag(tagIndex)}
                            className="ml-1 text-emerald-500 hover:text-emerald-700"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      </div>
                    )
                  })}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={editingBranchData.newTag}
                    onChange={(e) => setEditingBranchData(prev => ({ ...prev, newTag: e.target.value }))}
                    placeholder="新しいタグ"
                    className="text-xs flex-1"
                    onKeyPress={(e) => e.key === "Enter" && handleAddTag()}
                  />
                  <Button
                    onClick={handleAddTag}
                    size="sm"
                    variant="outline"
                    className="px-2"
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {/* 保存・キャンセルボタン */}
              <div className="flex gap-2 justify-end">
                <Button
                  onClick={() => setIsEditingBranch(false)}
                  size="sm"
                  variant="outline"
                  className="text-xs"
                >
                  キャンセル
                </Button>
                <Button
                  onClick={handleSaveLineEdit}
                  size="sm"
                  className="text-xs bg-emerald-500 hover:bg-emerald-600"
                >
                  保存
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-4 py-6 pb-60 space-y-8">
        {completeTimeline.messages.map((message, index) => {
          const branchingLines = getBranchingLines(message.id)
          const isSelected = selectedBaseMessage === message.id
          const messageLineInfo = getMessageLineInfo(index, completeTimeline)
          const isLineTransition = messageLineInfo.isLineStart && index > 0

          // 日付が変わったかどうかをチェック
          const previousMessage = index > 0 ? completeTimeline.messages[index - 1] : null
          const shouldShowDateSeparator =
            index === 0 || // 最初のメッセージの場合は必ず表示
            (previousMessage && !isSameDay(previousMessage.timestamp, message.timestamp))

          return (
            <div key={`${message.id}-${index}`} className="space-y-4">
              {/* 日付セパレーター */}
              {shouldShowDateSeparator && (
                <div className="flex items-center justify-center py-4">
                  <div className="bg-gray-100 text-gray-600 px-4 py-2 rounded-full text-sm font-medium border">
                    {formatDateForSeparator(message.timestamp)}
                  </div>
                </div>
              )}
              {/* ライン切り替わりインジケーター */}
              {isLineTransition && (
                <div className="flex items-center gap-3 py-3 -mx-4 px-4 bg-gradient-to-r from-blue-50 to-transparent border-l-4 border-blue-400">
                  <GitBranch className="w-4 h-4 text-blue-600" />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-blue-800">
                      → {messageLineInfo.transitionInfo?.lineName}
                    </div>
                  </div>
                  {messageLineInfo.lineInfo?.tagIds && messageLineInfo.lineInfo.tagIds.length > 0 && (
                    <div className="flex gap-1">
                      {messageLineInfo.lineInfo.tagIds.slice(0, 2).map((tagId, tagIndex) => {
                        const tag = tags[tagId]
                        if (!tag) return null
                        return (
                          <Badge key={tagIndex} variant="secondary" className="text-xs bg-blue-100 text-blue-700">
                            {tag.name}
                          </Badge>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              <div
                id={`message-${message.id}`}
                className={`group relative transition-all duration-200 ${
                  isSelected ? "bg-gray-100 -mx-2 px-2 py-2 rounded-lg border-2 border-green-600" : ""
                } ${
                  !messageLineInfo.isCurrentLine ? "border-l-2 border-blue-200 pl-3 ml-1" : ""
                }`}
                onMouseEnter={() => setHoveredMessageId(message.id)}
                onMouseLeave={() => setHoveredMessageId(null)}
                onDoubleClick={() => handleMessageTap(message.id)}
              >
                <div className="flex gap-3">
                  {/* 時刻表示 */}
                  <div className={`text-xs font-mono min-w-[35px] pt-0.5 leading-relaxed ${
                    !messageLineInfo.isCurrentLine ? 'text-blue-400' : 'text-gray-400'
                  }`}>
                    {new Date(message.timestamp).toLocaleTimeString("ja-JP", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>

                  {/* メッセージ内容 */}
                  <div className="flex-1">
                    <div className="flex items-start gap-2">
                      {message.hasBookmark && <div className="w-3 h-3 border border-gray-300 mt-1 flex-shrink-0" />}

                      {editingMessageId === message.id ? (
                        /* 編集モード */
                        <div className="flex-1 space-y-3">
                          <textarea
                            value={editingContent}
                            onChange={(e) => setEditingContent(e.target.value)}
                            className="w-full min-h-[80px] p-2 border border-blue-300 rounded-md resize-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none text-sm"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                                e.preventDefault()
                                handleSaveEdit()
                              } else if (e.key === "Escape") {
                                e.preventDefault()
                                handleCancelEdit()
                              }
                            }}
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <Button
                              onClick={handleSaveEdit}
                              disabled={!editingContent.trim() || isUpdating}
                              size="sm"
                              className="h-8 px-3 bg-blue-500 hover:bg-blue-600 text-white"
                            >
                              <Check className="h-3 w-3 mr-1" />
                              保存
                            </Button>
                            <Button
                              onClick={handleCancelEdit}
                              disabled={isUpdating}
                              variant="outline"
                              size="sm"
                              className="h-8 px-3"
                            >
                              キャンセル
                            </Button>
                          </div>
                        </div>
                      ) : (
                        /* 表示モード */
                        <div className="flex-1 relative">
                          <div
                            className={`leading-relaxed whitespace-pre-wrap text-sm cursor-pointer ${
                              !messageLineInfo.isCurrentLine
                                ? "text-gray-600"
                                : isSelected
                                ? "text-gray-900"
                                : "text-gray-900"
                            }`}
                          >
                            {message.content}
                          </div>

                          {/* 編集・削除ボタン（ホバー時のみ表示） */}
                          {hoveredMessageId === message.id && messageLineInfo.isCurrentLine && (
                            <div className="absolute top-0 right-0 flex gap-1 bg-white shadow-md border border-gray-200 rounded-md p-1">
                              <Button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleStartEdit(message.id)
                                }}
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 hover:bg-blue-50"
                                title="編集"
                              >
                                <Edit3 className="h-3 w-3 text-blue-600" />
                              </Button>
                              <Button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDeleteMessage(message.id)
                                }}
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 hover:bg-red-50"
                                title="削除"
                              >
                                <Trash2 className="h-3 w-3 text-red-600" />
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 画像表示 - 有効なURLのみレンダリング */}
                    {message.images && message.images.length > 0 && (
                      <div className="mt-2 space-y-2">
                        {message.images
                          .filter(imageUrl => isValidImageUrl(imageUrl))
                          .map((imageUrl, imageIndex) => {
                            const imageId = `${message.id}-image-${imageIndex}`
                            const isImageHovered = hoveredImageId === imageId
                            return (
                              <div
                                key={imageId}
                                className="relative group"
                                onMouseEnter={() => setHoveredImageId(imageId)}
                                onMouseLeave={() => setHoveredImageId(null)}
                              >
                                <Image
                                  src={imageUrl}
                                  alt={`Image ${imageIndex + 1}`}
                                  width={300}
                                  height={200}
                                  className={`max-w-xs h-auto rounded-lg border shadow-sm cursor-pointer hover:shadow-md transition-shadow ${
                                    !messageLineInfo.isCurrentLine ? 'border-blue-200 opacity-80' : 'border-gray-200'
                                  }`}
                                  onClick={() => {
                                    window.open(imageUrl, '_blank')
                                  }}
                                />
                                {/* 画像削除ボタン（ホバー時のみ表示、メッセージ編集時のみ） */}
                                {isImageHovered && editingMessageId === message.id && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleDeleteImage(message.id, imageIndex)
                                    }}
                                    disabled={isUpdating}
                                    className="absolute top-2 right-2 w-6 h-6 bg-red-500 text-white rounded-full text-xs hover:bg-red-600 transition-colors shadow-md disabled:opacity-50"
                                    title="画像を削除"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            )
                          })}
                        {/* 無効な画像URLがある場合の警告（開発モード時のみ） */}
                        {DEV_LOG.enabled && message.images.some(url => !isValidImageUrl(url)) && (
                          <div className="text-xs text-orange-500 bg-orange-50 p-2 rounded border border-orange-200">
                            一部の画像が無効なURLのため表示されていません
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                </div>
              </div>

              {/* Line Branch indicator */}
              {branchingLines.length > 0 && (
                <div className="ml-4 space-y-2 border-l-2 border-gray-200 pl-3">
                  <div className="flex items-center gap-2 mb-3">
                    <Zap className="h-3 w-3 text-emerald-500" />
                    <span className="text-xs text-gray-500">分岐しました（{branchingLines.length}ライン）</span>
                  </div>
                  <div className="space-y-1">
                    {branchingLines.map((line) => {
                      const isCurrentLine = line.id === currentLineId
                      const lastMessageId = line.endMessageId || line.messageIds[line.messageIds.length - 1]
                      const lastMessage = lastMessageId ? messages[lastMessageId] : null
                      const lastMessagePreview = lastMessage?.content ? lastMessage.content.slice(0, 18) + (lastMessage.content.length > 18 ? "..." : "") : ""
                      const firstTagId = line.tagIds?.[0]
                      const firstTag = firstTagId ? tags[firstTagId] : null
                      // 更新日時を優先表示
                      const relativeTime = line.updated_at ? getRelativeTime(line.updated_at) : (line.created_at ? getRelativeTime(line.created_at) : "")

                      return (
                        <div
                          key={`${message.id}-line-${line.id}`}
                          className={`w-full text-left rounded-lg transition-all duration-200 relative group ${
                            isCurrentLine
                              ? 'bg-emerald-100 border-2 border-emerald-300 text-emerald-800'
                              : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent text-gray-700 hover:text-gray-900'
                          }`}
                        >
                          <div
                            onClick={(e) => {
                              e.stopPropagation()
                            }}
                            onDoubleClick={(e) => {
                              e.stopPropagation()
                              switchToLine(line.id)
                            }}
                            className="px-3 py-2 w-full cursor-pointer"
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <div className={`w-1.5 h-1.5 rounded-full border flex-shrink-0 ${
                                isCurrentLine ? 'bg-emerald-500 border-emerald-500' : 'border-gray-400'
                              }`}></div>
                              <span className={`font-medium text-sm truncate ${isCurrentLine ? 'text-emerald-700' : 'text-gray-900'}`}>
                                {line.name}
                              </span>
                              {firstTag && (
                                <span className={`text-xs px-1.5 py-0.5 rounded ${
                                  isCurrentLine ? 'bg-emerald-200 text-emerald-600' : 'bg-gray-200 text-gray-500'
                                }`}>
                                  {firstTag.name}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center justify-between ml-3">
                              <span className="text-xs text-gray-500 truncate flex-1 pr-2">
                                {lastMessagePreview && relativeTime
                                  ? `${lastMessage?.content.slice(0, 18)}... • ${relativeTime}`
                                  : lastMessagePreview || relativeTime
                                }
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Hamburger Menu - 右上に配置 */}
      <HamburgerMenu>
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">ライン管理</h3>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {Object.values(lines).map((line) => {
                const isActive = line.id === currentLineId
                return (
                  <button
                    key={line.id}
                    onClick={() => switchToLine(line.id)}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                      isActive
                        ? 'bg-blue-100 text-blue-900 border border-blue-200'
                        : 'hover:bg-gray-100 text-gray-700'
                    }`}
                  >
                    <div className="font-medium truncate">{line.name}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {line.messageIds.length}件のメッセージ
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </HamburgerMenu>

      {/* Composer */}
      <div className="fixed bottom-20 left-0 right-0 p-4 border-t border-gray-100 bg-white z-10">
        {selectedBaseMessage ? (
          <div className="mb-3 p-3 bg-emerald-50 rounded-lg text-sm border border-emerald-200">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700 flex-shrink-0">
                  🌿 新しい分岐を作成
                </span>
                <span className="text-xs text-gray-400">
                  {(() => {
                    const message = messages[selectedBaseMessage]
                    if (!message) return ""
                    return getRelativeTime(message.timestamp.toISOString())
                  })()}
                </span>
                <span className="font-medium text-gray-800 truncate">
                  {(() => {
                    const message = messages[selectedBaseMessage]
                    if (!message) return ""
                    const content = message.content.slice(0, 18)
                    return `${content}${message.content.length > 18 ? "..." : ""}`
                  })()}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-gray-400 hover:text-gray-600 hover:bg-emerald-100 flex-shrink-0"
                onClick={() => setSelectedBaseMessage(null)}
              >
                ✕
              </Button>
            </div>
          </div>
        ) : (
          <div className="mb-3 p-3 bg-gray-50 rounded-lg text-sm border border-gray-200">
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-1 rounded bg-gray-200 text-gray-700">
                📝 現在のラインに追加
              </span>
              <span className="text-gray-500">
                {currentLineInfo?.name || "メインの流れ"}
              </span>
            </div>
          </div>
        )}

        {/* 添付画像プレビュー */}
        {pendingImages.length > 0 && (
          <div className="mb-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-blue-800">画像 ({pendingImages.length})</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-blue-400 hover:text-blue-600 hover:bg-blue-100"
                onClick={() => setPendingImages([])}
              >
                すべて削除
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {pendingImages.map((imageUrl, index) => (
                <div key={index} className="relative group">
                  <Image
                    src={imageUrl}
                    alt={`Preview ${index + 1}`}
                    width={60}
                    height={60}
                    className="w-15 h-15 object-cover rounded border border-blue-300"
                  />
                  <button
                    onClick={() => setPendingImages(prev => prev.filter((_, i) => i !== index))}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs hover:bg-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <div className="flex-1">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="メッセージを入力..."
              className="min-h-[80px] max-h-40 resize-none border border-gray-300 rounded-md px-3 py-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none w-full"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  handleSendMessage()
                }
              }}
            />
          </div>
          <Button
            onClick={handleSendMessage}
            disabled={(!inputValue.trim() && pendingImages.length === 0) || isUpdating}
            className="h-11 px-4 bg-blue-500 hover:bg-blue-600 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {isUpdating && <span className="ml-2 text-xs">送信中...</span>}
          </Button>
        </div>
      </div>

      {/* Recent Lines Footer */}
      <RecentLinesFooter
        key={footerKey}
        lines={lines}
        messages={messages}
        currentLineId={currentLineId}
        branchPoints={branchPoints}
        onLineSelect={switchToLine}
      />

      {/* 削除確認ダイアログ */}
      {deleteConfirmation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <Trash2 className="h-6 w-6 text-red-600" />
                <h3 className="text-lg font-semibold text-gray-900">メッセージを削除</h3>
              </div>

              <p className="text-gray-600 mb-4">
                このメッセージを削除してもよろしいですか？
              </p>

              <div className="bg-gray-50 rounded-md p-3 mb-4">
                <p className="text-sm text-gray-700 line-clamp-3">
                  {deleteConfirmation.message.content}
                </p>
              </div>

              {branchPoints[deleteConfirmation.messageId] && branchPoints[deleteConfirmation.messageId].lines.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-md p-3 mb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <GitBranch className="h-4 w-4 text-amber-600" />
                    <span className="text-sm font-medium text-amber-800">分岐の起点</span>
                  </div>
                  <p className="text-xs text-amber-700">
                    このメッセージは {branchPoints[deleteConfirmation.messageId].lines.length} 個の分岐の起点です。削除すると関連する分岐構造に影響があります。
                  </p>
                </div>
              )}

              <div className="flex gap-3 justify-end">
                <Button
                  onClick={() => setDeleteConfirmation(null)}
                  variant="outline"
                  disabled={isUpdating}
                >
                  キャンセル
                </Button>
                <Button
                  onClick={handleConfirmDelete}
                  disabled={isUpdating}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {isUpdating ? '削除中...' : '削除'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
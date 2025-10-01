"use client"

import { useState, useRef, useEffect, useMemo, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Send, Zap, Edit3, Plus, X, GitBranch, Trash2, Check, Copy, CheckCircle, Search, Filter } from "lucide-react"
import Image from "next/image"
import { dataSourceManager } from "@/lib/data-source"
import { HamburgerMenu } from "@/components/hamburger-menu"
import { RecentLinesFooter } from "@/components/recent-lines-footer"
import { SlashCommandButtons } from "@/components/slash-command-buttons"
import { parseSlashCommand } from "@/lib/slash-command-parser"
import { MessageTypeRenderer } from "@/components/message-types/message-type-renderer"
import { MESSAGE_TYPE_TEXT, MESSAGE_TYPE_TASK, MESSAGE_TYPE_DOCUMENT, MESSAGE_TYPE_SESSION, type MessageType } from "@/lib/constants"
import { FILTER_ALL, FILTER_TEXT, FILTER_TASK, FILTER_DOCUMENT, FILTER_SESSION, RELATIVE_TIME_NOW, DATE_TODAY, DATE_YESTERDAY, WEEKDAY_NAMES } from "@/lib/ui-strings"

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
  type?: MessageType
  metadata?: Record<string, unknown>
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
    if (DEV_LOG.enabled && message.includes('current line found')) {
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
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set())
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [showMoveDialog, setShowMoveDialog] = useState(false)
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
  const [editingMessageType, setEditingMessageType] = useState<MessageType | null>(null)
  const [editingMetadata, setEditingMetadata] = useState<Record<string, unknown>>({})
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null)
  const [hoveredImageId, setHoveredImageId] = useState<string | null>(null)
  const [deleteConfirmation, setDeleteConfirmation] = useState<DeleteConfirmationState | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const [hasSetCursorToEnd, setHasSetCursorToEnd] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [scrollPositions, setScrollPositions] = useState<Map<string, number>>(new Map())
  const [footerKey, setFooterKey] = useState(0) // フッター強制更新用
  const [copySuccessMessageId, setCopySuccessMessageId] = useState<string | null>(null)

  // フィルター・検索関連の状態
  const [filterMessageType, setFilterMessageType] = useState<MessageType | 'all'>('all')
  const [filterTag, setFilterTag] = useState<string>('')
  const [searchKeyword, setSearchKeyword] = useState<string>('')

  // テキストエリアの高さを自動調整する関数
  const adjustTextareaHeight = useCallback(() => {
    if (textareaRef.current) {
      const textarea = textareaRef.current
      // 高さをリセットして正確な scrollHeight を取得
      textarea.style.height = 'auto'
      // 最小高さ80px、最大高さ128px（max-h-32）に制限
      const newHeight = Math.min(Math.max(textarea.scrollHeight, 80), 128)
      textarea.style.height = `${newHeight}px`
    }
  }, [])

  // inputValue が変更されたときに高さを調整
  useEffect(() => {
    adjustTextareaHeight()
  }, [inputValue, adjustTextareaHeight])

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

    if (diffMinutes < 1) return RELATIVE_TIME_NOW
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
      return DATE_TODAY
    }

    // 昨日の場合
    if (messageDate.toDateString() === yesterday.toDateString()) {
      return DATE_YESTERDAY
    }

    // その他の場合は "M/D(曜日)" 形式
    const month = messageDate.getMonth() + 1
    const day = messageDate.getDate()
    const weekday = WEEKDAY_NAMES[messageDate.getDay()]

    return `${month}/${day}(${weekday})`
  }

  // 日付が変わったかどうかをチェック
  const isSameDay = (date1: Date, date2: Date): boolean => {
    return date1.toDateString() === date2.toDateString()
  }



  // 初期データの更新を監視（propsが変更されたら常に更新）
  useEffect(() => {
    setMessages(initialMessages)
  }, [initialMessages])

  useEffect(() => {
    setLines(initialLines)
  }, [initialLines])

  useEffect(() => {
    setBranchPoints(initialBranchPoints)
  }, [initialBranchPoints])

  useEffect(() => {
    setTags(initialTags)
  }, [initialTags])

  useEffect(() => {
    if (initialCurrentLineId) {
      setCurrentLineId(initialCurrentLineId)
    }
  }, [initialCurrentLineId])


  // 最下部への即座のスクロール（アニメーションなし）
  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current && messagesContainerRef.current) {
      // スムーズスクロールではなく、即座に移動
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
    }
  }, [])

  const handleImageFile = async (file: File): Promise<string> => {
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
  }

  // 画像を削除する関数
  const deleteImageFromStorage = async (imageUrl: string): Promise<void> => {
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

      // キャッシュをクリア
      setPathCache(new Map())
      setLineAncestryCache(new Map())

    } catch {
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
      const cached = lineAncestryCache.get(lineId)
      if (cached) return cached
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
      const cached = pathCache.get(lineId)
      if (cached) return cached
    }

    const ancestry = getLineAncestry(lineId)
    const fullLineChain = [...ancestry, lineId]

    console.log('[Debug] getOptimizedPath:', {
      lineId,
      ancestry,
      fullLineChain,
      lineData: lines[lineId]
    })

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
    const TIMELINE_BRANCH_ID = '__timeline__'

    // タイムライン仮想ブランチの場合
    if (currentLineId === TIMELINE_BRANCH_ID) {
      const allMessages = Object.values(messages).sort((a, b) => {
        return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      })

      // ライン切り替わり情報を生成
      const transitions: Array<{ index: number, lineId: string, lineName: string }> = []
      let prevLineId: string | null = null

      allMessages.forEach((msg, index) => {
        if (msg.lineId !== prevLineId) {
          const line = lines[msg.lineId]
          transitions.push({
            index,
            lineId: msg.lineId,
            lineName: line?.name || msg.lineId
          })
          prevLineId = msg.lineId
        }
      })

      return { messages: allMessages, transitions }
    }

    // 通常のライン表示
    if (!currentLineId || !lines[currentLineId]) {
      return { messages: [], transitions: [] }
    }

    const result = getOptimizedPath(currentLineId)
    return result
  }, [currentLineId, lines, messages, getOptimizedPath])

  // useMemoでメモ化されたタイムラインを取得（messagesの変更も監視）
  const completeTimeline = useMemo(() => {
    return getCompleteTimeline()
  }, [getCompleteTimeline])

  // フィルタリング済みタイムライン
  const filteredTimeline = useMemo(() => {
    const filtered = completeTimeline.messages.filter(message => {
      // メッセージタイプフィルター
      if (filterMessageType !== 'all' && message.type !== filterMessageType) {
        return false
      }

      // タグフィルター（部分一致）
      if (filterTag) {
        const messageTags = message.tags || []
        const hasMatchingTag = messageTags.some(tag =>
          tag.toLowerCase().includes(filterTag.toLowerCase())
        )
        if (!hasMatchingTag) {
          return false
        }
      }

      // キーワード検索（部分一致）
      if (searchKeyword) {
        const contentMatch = message.content.toLowerCase().includes(searchKeyword.toLowerCase())
        const authorMatch = message.author?.toLowerCase().includes(searchKeyword.toLowerCase()) || false
        if (!contentMatch && !authorMatch) {
          return false
        }
      }

      return true
    })

    return {
      messages: filtered,
      transitions: completeTimeline.transitions
    }
  }, [completeTimeline, filterMessageType, filterTag, searchKeyword])

  // 初回データ読み込み時とメッセージ投稿時に最下部にスクロール
  useEffect(() => {
    // 初回起動時（メッセージがある場合のみ）
    if (completeTimeline.messages.length > 0) {
      scrollToBottom()
    }
  }, [completeTimeline.messages.length, scrollToBottom])

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
    // タイムライン仮想ブランチの場合は特別な処理
    const TIMELINE_BRANCH_ID = '__timeline__'

    if (lineId === TIMELINE_BRANCH_ID || lines[lineId]) {
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
        isEditable: false,
        lineInfo: null,
        transitionInfo: null
      }
    }

    // このメッセージがラインの開始点かどうかをチェック
    const transitionAtThisIndex = transitions.find(t => t.index === messageIndex)
    const isLineStart = transitionAtThisIndex !== undefined

    // 現在ラインかどうかをチェック
    const isCurrentLine = message.lineId === currentLineId

    // 編集可能かどうかをチェック（現在のタイムラインに表示されているメッセージは全て編集可能）
    const isEditable = true

    return {
      isLineStart,
      isCurrentLine,
      isEditable,
      lineInfo: lines[message.lineId],
      transitionInfo: transitionAtThisIndex || null
    }
  }

  // 現在のラインオブジェクトを取得
  const getCurrentLine = (): Line | null => {
    const TIMELINE_BRANCH_ID = '__timeline__'

    // タイムライン仮想ブランチの場合
    if (currentLineId === TIMELINE_BRANCH_ID) {
      const allMessages = Object.values(messages)
      return {
        id: TIMELINE_BRANCH_ID,
        name: '全メッセージ (時系列)',
        messageIds: allMessages.map(m => m.id).sort((a, b) => {
          const msgA = messages[a]
          const msgB = messages[b]
          return new Date(msgA.timestamp).getTime() - new Date(msgB.timestamp).getTime()
        }),
        startMessageId: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    }

    return lines[currentLineId] || null
  }

  const handleSendMessage = async () => {
    const TIMELINE_BRANCH_ID = '__timeline__'

    if (!inputValue.trim() && pendingImages.length === 0) return

    // タイムライン仮想ブランチの場合はメインラインに投稿
    let targetLineId = currentLineId
    if (currentLineId === TIMELINE_BRANCH_ID) {
      const mainLine = Object.values(lines).find(line => line.id === 'main')
      if (!mainLine) {
        alert('メインラインが見つかりません')
        return
      }
      targetLineId = mainLine.id
    }

    const currentLine = lines[targetLineId]
    if (!currentLine) {
      return
    }

    // 現在のタイムラインの最後のメッセージを取得
    const timeline = completeTimeline
    const lastMessage = timeline.messages[timeline.messages.length - 1]
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
        const newLine: Line = {
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

        setBranchPoints((prev) => {
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
        setCurrentLineId(newLineId)

        // 新しいライン作成時専用のコールバックを呼び出し（URL更新のため）
        if (onNewLineCreated) {
          onNewLineCreated(newLineId, newLineName)
        }

        // フッターを強制更新
        setFooterKey(prev => prev + 1)

      } else {
        // 既存のライン継続 - スラッシュコマンドを解析してメッセージを作成
        const parsedMessage = parseSlashCommand(inputValue)
        const currentTimestamp = new Date()

        const messageData = {
          content: parsedMessage.content,
          timestamp: currentTimestamp.toISOString(),
          lineId: targetLineId,
          prevInLine: baseMessageId,
          author: "User",
          type: parsedMessage.type,
          ...(pendingImages.length > 0 && { images: [...pendingImages] }),
          ...(parsedMessage.metadata !== undefined && { metadata: parsedMessage.metadata }),
        }

        // アトミックなメッセージ作成（トランザクション）
        const newMessageId = await dataSourceManager.createMessageWithLineUpdate(
          messageData,
          targetLineId,
          baseMessageId
        )

        // ローカル状態を更新（トランザクション成功後のため安全）
        const newMessage: Message = {
          id: newMessageId,
          content: parsedMessage.content,
          timestamp: currentTimestamp,
          lineId: targetLineId,
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
          if (updated[targetLineId]) {
            const updatedMessageIds = [...updated[targetLineId].messageIds, newMessageId]
            const isFirstMessage = updated[targetLineId].messageIds.length === 0

            updated[targetLineId] = {
              ...updated[targetLineId],
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
      setPathCache(new Map())
      setLineAncestryCache(new Map())

      setInputValue("")
      setPendingImages([])
      setSelectedBaseMessage(null)

      // テキストエリアの高さをリセット
      if (textareaRef.current) {
        textareaRef.current.style.height = '80px'
      }


      // メッセージ投稿後に最下部にスクロール
      setTimeout(() => {
        scrollToBottom()
      }, 100)

      // メッセージ投稿時はローカル状態が既に更新されているため、
      // 親のデータリロードは不要（リロードすると画面が上部に戻されてしまう）
    } catch {
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
      setEditingMessageType(message.type || 'text')
      setEditingMetadata(message.metadata || {})
      setHasSetCursorToEnd(null) // カーソル設定フラグをリセット

      // 編集開始後に該当メッセージまでスクロール
      setTimeout(() => {
        const messageElement = document.getElementById(`message-${messageId}`)
        if (messageElement && messagesContainerRef.current) {
          // メッセージ要素の位置を取得
          const messageOffsetTop = messageElement.offsetTop
          const containerHeight = messagesContainerRef.current.clientHeight

          // メッセージを画面中央に配置するためのスクロール位置を計算
          const targetScrollTop = messageOffsetTop - (containerHeight / 2)

          // 即座にスクロール（アニメーションなし）
          messagesContainerRef.current.scrollTop = Math.max(0, targetScrollTop)
        }
      }, 100)
    }
  }

  // メッセージタイプに応じたデフォルトメタデータを生成
  const getDefaultMetadataForType = (type: MessageType, content: string = ''): Record<string, unknown> | undefined => {
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
  }

  // メッセージ編集保存
  const handleSaveEdit = async () => {
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
      setPathCache(new Map())
      setLineAncestryCache(new Map())

      // 編集状態をクリア
      setEditingMessageId(null)
      setEditingContent("")
      setEditingMessageType(null)
      setEditingMetadata({})
      setHasSetCursorToEnd(null)


      // メッセージ編集時はローカル状態が既に更新されているため、
      // 親のデータリロードは不要（リロードすると画面が上部に戻されてしまう）
    } catch {
      alert('メッセージの更新に失敗しました')
    } finally {
      setIsUpdating(false)
    }
  }

  // メッセージ編集キャンセル
  const handleCancelEdit = () => {
    setEditingMessageId(null)
    setEditingContent("")
    setEditingMessageType(null)
    setEditingMetadata({})
    setHasSetCursorToEnd(null)
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

  // メッセージをクリップボードにコピー
  const handleCopyMessage = async (messageId: string) => {
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
      setPathCache(new Map())
      setLineAncestryCache(new Map())

      setDeleteConfirmation(null)

      // メッセージ削除時はローカル状態が既に更新されているため、
      // 親のデータリロードは不要（リロードすると画面が上部に戻されてしまう）
    } catch {
      alert('メッセージの削除に失敗しました')
    } finally {
      setIsUpdating(false)
    }
  }

  const handleMessageTap = (messageId: string) => {
    if (isSelectionMode) {
      // 複数選択モード
      setSelectedMessages(prev => {
        const newSet = new Set(prev)
        if (newSet.has(messageId)) {
          newSet.delete(messageId)
        } else {
          newSet.add(messageId)
        }
        return newSet
      })
    } else {
      // 通常の分岐作成モード
      if (selectedBaseMessage === messageId) {
        setSelectedBaseMessage(null)
      } else {
        setSelectedBaseMessage(messageId)
      }
    }
  }

  const handleToggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode)
    if (isSelectionMode) {
      // 選択モードを終了する際は選択をクリア
      setSelectedMessages(new Set())
    } else {
      // 選択モードに入る際は分岐作成を無効化
      setSelectedBaseMessage(null)
    }
  }

  const handleMoveMessages = () => {
    if (selectedMessages.size > 0) {
      setShowMoveDialog(true)
    }
  }

  const handleConfirmMove = async (targetLineId: string) => {
    if (selectedMessages.size === 0) return

    setIsUpdating(true)
    try {
      // 選択されたメッセージIDを配列として取得
      const selectedMessageIds = Array.from(selectedMessages)
      const updateTimestamp = new Date().toISOString()

      // 元のライン別にメッセージをグループ化
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

      // 一括更新用のPromise配列を準備
      const updatePromises: Promise<unknown>[] = []

      // 全メッセージのlineIdを一括更新
      for (const messageId of selectedMessageIds) {
        updatePromises.push(
          dataSourceManager.updateMessage(messageId, {
            lineId: targetLineId
          })
        )
      }

      // 各元ラインからメッセージIDを一括削除
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

      // ターゲットラインに全メッセージIDを一括追加
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

      // 全ての更新を並列実行
      await Promise.all(updatePromises)

      // ローカル状態を更新
      setMessages(prev => {
        const updated = { ...prev }
        Array.from(selectedMessages).forEach(messageId => {
          if (updated[messageId]) {
            updated[messageId] = {
              ...updated[messageId],
              lineId: targetLineId
            }
          }
        })
        return updated
      })

      setLines(prev => {
        const updated = { ...prev }

        // 各メッセージの元のラインから削除
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

        // ターゲットラインに追加
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

      // キャッシュをクリア
      setPathCache(new Map())
      setLineAncestryCache(new Map())

      // 選択をクリアしてダイアログを閉じる
      const movedCount = selectedMessages.size
      setSelectedMessages(new Set())
      setShowMoveDialog(false)

      alert(`${movedCount}件のメッセージを移動しました`)

    } catch (error) {
      console.error('Failed to move messages:', error)
      alert('メッセージの移動に失敗しました')
    } finally {
      setIsUpdating(false)
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

  const handleSaveLineEdit = async () => {
    const currentLineInfo = getCurrentLine()
    if (currentLineInfo) {
      const currentTimestamp = new Date()
      const updatedLineData = {
        name: editingBranchData.name,
        tagIds: editingBranchData.tagIds,
        updated_at: currentTimestamp.toISOString()
      }

      setIsUpdating(true)
      try {
        // Firestoreのデータを更新
        await dataSourceManager.updateLine(currentLineId, updatedLineData)

        // ローカルのstateを更新
        setLines((prev) => {
          const updated = { ...prev }
          if (updated[currentLineId]) {
            updated[currentLineId] = {
              ...updated[currentLineId],
              ...updatedLineData
            }
          }
          return updated
        })

        // キャッシュをクリアしてUIを更新
        setPathCache(new Map())
        setLineAncestryCache(new Map())

        setIsEditingBranch(false)
      } catch (error) {
        console.error("Failed to save line edit:", error)
        alert("ラインの保存に失敗しました。")
      } finally {
        setIsUpdating(false)
      }
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

  const renderTimelineMinimap = (): JSX.Element | null => {
    if (!completeTimeline.messages.length) return null

    const TIMELINE_BRANCH_ID = '__timeline__'

    // 現在のラインの祖先チェーンを取得
    const ancestry = getLineAncestry(currentLineId)
    const breadcrumbPath = [...ancestry, currentLineId]

    return (
      <div className="px-2 sm:px-4 py-2 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between gap-3 overflow-x-auto">
          {/* パンくずリスト */}
          <div className="flex items-center gap-1 flex-shrink-0" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {breadcrumbPath.map((lineId, index) => {
              // タイムライン仮想ブランチの特別処理
              if (lineId === TIMELINE_BRANCH_ID) {
                return (
                  <div key={`breadcrumb-${lineId}-${index}`} className="flex items-center gap-1 flex-shrink-0">
                    <button
                      className="px-2 py-1 rounded-md text-xs font-medium transition-all duration-200 whitespace-nowrap bg-blue-500 text-white shadow-sm"
                      onClick={() => switchToLine(lineId)}
                    >
                      全メッセージ
                    </button>
                  </div>
                )
              }

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

          {/* 検索・フィルター */}
          <div className="flex items-center gap-2 flex-shrink-0 mr-16 sm:mr-20">
            {/* 検索キーワード */}
            <div className="relative">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-gray-400" />
              <Input
                type="text"
                placeholder="検索..."
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                className="pl-7 text-xs h-7 w-32"
              />
            </div>

            {/* タイプフィルター */}
            <select
              value={filterMessageType}
              onChange={(e) => setFilterMessageType(e.target.value as MessageType | 'all')}
              className="text-xs border border-gray-200 rounded px-2 h-7 bg-white"
            >
              <option value="all">{FILTER_ALL}</option>
              <option value={MESSAGE_TYPE_TEXT}>{FILTER_TEXT}</option>
              <option value={MESSAGE_TYPE_TASK}>{FILTER_TASK}</option>
              <option value={MESSAGE_TYPE_DOCUMENT}>{FILTER_DOCUMENT}</option>
              <option value={MESSAGE_TYPE_SESSION}>{FILTER_SESSION}</option>
            </select>

            {/* タグフィルター */}
            <div className="relative">
              <Filter className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-gray-400" />
              <Input
                type="text"
                placeholder="タグ..."
                value={filterTag}
                onChange={(e) => setFilterTag(e.target.value)}
                className="pl-7 text-xs h-7 w-24"
              />
            </div>
          </div>
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
        <div className="px-2 sm:px-4 py-3 border-b border-gray-100 bg-gray-50">
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
                  onClick={() => handleSaveLineEdit()}
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
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden px-2 sm:px-4 py-6 pb-80 space-y-8" style={{ width: '100%', maxWidth: '100vw', boxSizing: 'border-box' }}>
        {filteredTimeline.messages.map((message, index) => {
          const branchingLines = getBranchingLines(message.id)
          const isSelected = selectedBaseMessage === message.id
          const messageLineInfo = getMessageLineInfo(index, filteredTimeline)
          const isLineTransition = messageLineInfo.isLineStart && index > 0

          // 日付が変わったかどうかをチェック
          const previousMessage = index > 0 ? filteredTimeline.messages[index - 1] : null
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
                  selectedMessages.has(message.id) ? "bg-blue-100 -mx-2 px-2 py-2 rounded-lg border-2 border-blue-500" : ""
                } ${
                  !messageLineInfo.isCurrentLine ? "border-l-2 border-blue-200 pl-3 ml-1" : ""
                }`}
                onMouseEnter={() => setHoveredMessageId(message.id)}
                onMouseLeave={() => setHoveredMessageId(null)}
                onClick={() => {
                  if (isSelectionMode) {
                    handleMessageTap(message.id)
                  }
                }}
                onDoubleClick={() => {
                  if (!isSelectionMode) {
                    handleMessageTap(message.id)
                  }
                }}
              >
                <div className="flex gap-3">
                  {/* 選択チェックボックス（選択モード時のみ表示） */}
                  {isSelectionMode && (
                    <div
                      className="flex items-center pt-0.5 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleMessageTap(message.id)
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedMessages.has(message.id)}
                        onChange={() => {}}
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2 pointer-events-none"
                      />
                    </div>
                  )}

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
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2">
                      {message.hasBookmark && <div className="w-3 h-3 border border-gray-300 mt-1 flex-shrink-0" />}

                      {editingMessageId === message.id ? (
                        /* 統合編集モード */
                        <div className="flex-1 space-y-4">
                          {/* メッセージタイプ選択 */}
                          <div className="flex items-center gap-2">
                            <label className="text-xs font-medium text-gray-600">タイプ:</label>
                            <select
                              value={editingMessageType || message.type || 'text'}
                              onChange={(e) => setEditingMessageType(e.target.value as MessageType)}
                              className="text-xs border border-gray-300 rounded px-2 py-1 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                            >
                              <option value={MESSAGE_TYPE_TEXT}>{FILTER_TEXT}</option>
                              <option value={MESSAGE_TYPE_TASK}>{FILTER_TASK}</option>
                              <option value={MESSAGE_TYPE_DOCUMENT}>{FILTER_DOCUMENT}</option>
                              <option value={MESSAGE_TYPE_SESSION}>{FILTER_SESSION}</option>
                            </select>
                          </div>

                          {/* テキスト内容編集と保存ボタン */}
                          <div className="flex gap-2">
                            <textarea
                              value={editingContent}
                              onChange={(e) => setEditingContent(e.target.value)}
                              className="flex-1 min-h-[80px] p-2 border border-blue-300 rounded-md resize-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none text-sm"
                              placeholder="メッセージ内容"
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                                  e.preventDefault()
                                  handleSaveEdit()
                                } else if (e.key === "Escape") {
                                  e.preventDefault()
                                  handleCancelEdit()
                                }
                              }}
                              ref={(textarea) => {
                                if (textarea && editingMessageId && hasSetCursorToEnd !== editingMessageId) {
                                  textarea.focus()
                                  // カーソルを文末に移動（初回のみ）
                                  textarea.setSelectionRange(textarea.value.length, textarea.value.length)
                                  setHasSetCursorToEnd(editingMessageId)
                                }
                              }}
                            />
                            {/* 保存・キャンセルボタン（メッセージと同じ高さ） */}
                            <div className="flex flex-col gap-1">
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

                          {/* タイプ別プロパティ編集 */}
                          {(editingMessageType === MESSAGE_TYPE_TASK || (editingMessageType === null && message.type === MESSAGE_TYPE_TASK)) && (
                            <div className="bg-orange-50 p-3 rounded-md border border-orange-200">
                              <h4 className="text-xs font-medium text-orange-800 mb-2">タスクプロパティ</h4>
                              <div>
                                <label className="text-xs text-gray-600">優先度</label>
                                <select
                                  className="w-full text-xs border border-gray-300 rounded px-2 py-1"
                                  value={(editingMetadata.priority as string) || (message.metadata?.priority as string) || 'medium'}
                                  onChange={(e) => setEditingMetadata(prev => ({ ...prev, priority: e.target.value }))}
                                >
                                  <option value="low">低</option>
                                  <option value="medium">中</option>
                                  <option value="high">高</option>
                                </select>
                              </div>
                              <div className="mt-2">
                                <label className="flex items-center gap-2 text-xs">
                                  <input
                                    type="checkbox"
                                    checked={(editingMetadata.completed as boolean) ?? (message.metadata?.completed as boolean) ?? false}
                                    onChange={(e) => setEditingMetadata(prev => ({ ...prev, completed: e.target.checked }))}
                                    className="rounded"
                                  />
                                  完了
                                </label>
                              </div>
                            </div>
                          )}

                          {(editingMessageType === MESSAGE_TYPE_SESSION || (editingMessageType === null && message.type === MESSAGE_TYPE_SESSION)) && (
                            <div className="bg-purple-50 p-3 rounded-md border border-purple-200">
                              <h4 className="text-xs font-medium text-purple-800 mb-2">セッションプロパティ</h4>
                              <div className="space-y-2">
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-xs text-gray-600">開始日時</label>
                                    <input
                                      type="datetime-local"
                                      className="w-full text-xs border border-gray-300 rounded px-2 py-1"
                                      value={(() => {
                                        const checkedInAt = (editingMetadata.checkedInAt as string) ?? (message.metadata?.checkedInAt as string) ?? ''
                                        if (!checkedInAt) return ''
                                        // ISO文字列をローカル日時に変換
                                        const date = new Date(checkedInAt)
                                        const year = date.getFullYear()
                                        const month = String(date.getMonth() + 1).padStart(2, '0')
                                        const day = String(date.getDate()).padStart(2, '0')
                                        const hours = String(date.getHours()).padStart(2, '0')
                                        const minutes = String(date.getMinutes()).padStart(2, '0')
                                        return `${year}-${month}-${day}T${hours}:${minutes}`
                                      })()}
                                      onChange={(e) => {
                                        const isoString = e.target.value ? new Date(e.target.value).toISOString() : ''
                                        setEditingMetadata(prev => {
                                          const newMetadata: Record<string, unknown> = { ...prev, checkedInAt: isoString }
                                          // 経過分数が設定されている場合は終了日時を自動計算
                                          const timeSpent = prev.timeSpent as number || 0
                                          if (isoString && timeSpent > 0) {
                                            const endDate = new Date(isoString)
                                            endDate.setMinutes(endDate.getMinutes() + timeSpent)
                                            newMetadata.checkedOutAt = endDate.toISOString()
                                          }
                                          return newMetadata
                                        })
                                      }}
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs text-gray-600">経過分数</label>
                                    <input
                                      type="number"
                                      min="0"
                                      step="1"
                                      className="w-full text-xs border border-gray-300 rounded px-2 py-1"
                                      value={(editingMetadata.timeSpent as number) ?? (message.metadata?.timeSpent as number) ?? 0}
                                      onChange={(e) => {
                                        const minutes = parseInt(e.target.value) || 0
                                        setEditingMetadata(prev => {
                                          const newMetadata: Record<string, unknown> = { ...prev, timeSpent: minutes }
                                          // 開始日時が設定されている場合は終了日時を自動計算
                                          const checkedInAt = prev.checkedInAt as string || message.metadata?.checkedInAt as string
                                          if (checkedInAt && minutes > 0) {
                                            const endDate = new Date(checkedInAt)
                                            endDate.setMinutes(endDate.getMinutes() + minutes)
                                            newMetadata.checkedOutAt = endDate.toISOString()
                                          } else if (minutes === 0) {
                                            // 経過分数が0の場合は終了日時をクリア
                                            newMetadata.checkedOutAt = ''
                                          }
                                          return newMetadata
                                        })
                                      }}
                                      onKeyDown={(e) => {
                                        // 数字、Backspace、Delete、Arrow keys、Tab、Enterを許可
                                        if (
                                          !((e.key >= '0' && e.key <= '9') ||
                                            e.key === 'Backspace' ||
                                            e.key === 'Delete' ||
                                            e.key === 'ArrowLeft' ||
                                            e.key === 'ArrowRight' ||
                                            e.key === 'ArrowUp' ||
                                            e.key === 'ArrowDown' ||
                                            e.key === 'Tab' ||
                                            e.key === 'Enter' ||
                                            (e.ctrlKey && (e.key === 'a' || e.key === 'c' || e.key === 'v' || e.key === 'x')))
                                        ) {
                                          e.preventDefault()
                                        }
                                      }}
                                    />
                                  </div>
                                </div>
                                {/* 計算結果の終了日時を表示 */}
                                {(() => {
                                  const checkedInAt = (editingMetadata.checkedInAt as string) ?? (message.metadata?.checkedInAt as string) ?? ''
                                  const timeSpent = (editingMetadata.timeSpent as number) ?? (message.metadata?.timeSpent as number) ?? 0
                                  const checkedOutAt = (editingMetadata.checkedOutAt as string) ?? (message.metadata?.checkedOutAt as string) ?? ''

                                  if (checkedInAt && timeSpent > 0 && checkedOutAt) {
                                    const endDate = new Date(checkedOutAt)
                                    const year = endDate.getFullYear()
                                    const month = String(endDate.getMonth() + 1).padStart(2, '0')
                                    const day = String(endDate.getDate()).padStart(2, '0')
                                    const hours = String(endDate.getHours()).padStart(2, '0')
                                    const minutes = String(endDate.getMinutes()).padStart(2, '0')
                                    const formattedEndTime = `${year}-${month}-${day} ${hours}:${minutes}`

                                    return (
                                      <div className="mt-2 p-2 bg-purple-100 rounded text-xs">
                                        <span className="text-purple-700 font-medium">終了日時: </span>
                                        <span className="text-purple-800">{formattedEndTime}</span>
                                      </div>
                                    )
                                  }
                                  return null
                                })()}
                              </div>
                            </div>
                          )}

                          {(editingMessageType === MESSAGE_TYPE_DOCUMENT || (editingMessageType === null && message.type === MESSAGE_TYPE_DOCUMENT)) && (
                            <div className="bg-blue-50 p-3 rounded-md border border-blue-200">
                              <h4 className="text-xs font-medium text-blue-800 mb-2">ドキュメントプロパティ</h4>
                              <div>
                                <label className="flex items-center gap-2 text-xs">
                                  <input
                                    type="checkbox"
                                    checked={(editingMetadata.isCollapsed as boolean) ?? (message.metadata?.isCollapsed as boolean) ?? false}
                                    onChange={(e) => setEditingMetadata(prev => ({ ...prev, isCollapsed: e.target.checked }))}
                                    className="rounded"
                                  />
                                  折りたたみ表示
                                </label>
                              </div>
                            </div>
                          )}

                        </div>
                      ) : (
                        /* 表示モード */
                        <div className="flex-1 min-w-0">
                          <div
                            className={`break-words message-content ${
                                !messageLineInfo.isCurrentLine
                                  ? "text-gray-600"
                                  : isSelected
                                  ? "text-gray-900"
                                  : "text-gray-900"
                              }`}
                            style={{
                              wordWrap: 'break-word',
                              overflowWrap: 'anywhere',
                              wordBreak: 'break-word',
                              whiteSpace: 'pre-wrap'
                            }}
                          >
                            <MessageTypeRenderer
                              message={message}
                              onUpdate={(messageId, updates) => {
                                // メッセージの更新処理（通常のメッセージ編集と同じパターンを使用）
                                setMessages(prev => {
                                  const newMessages = { ...prev }
                                  newMessages[messageId] = {
                                    ...prev[messageId],
                                    ...updates
                                  }
                                  return newMessages
                                })

                                // キャッシュをクリアして確実に再計算
                                setPathCache(new Map())
                                setLineAncestryCache(new Map())

                                // データソースにも反映
                                if (dataSourceManager.getCurrentSource() === 'firestore') {
                                  // timestamp以外の更新データを作成
                                  const { timestamp, ...otherUpdates } = updates
                                  const updateData = {
                                    ...otherUpdates,
                                    ...(timestamp && { timestamp: timestamp instanceof Date ? timestamp.toISOString() : timestamp })
                                  }
                                  dataSourceManager.updateMessage(messageId, updateData)
                                    .then(() => {
                                      console.log('Message updated successfully in Firestore')
                                    })
                                    .catch((error: Error) => {
                                      console.error('Failed to update message in Firestore:', error)
                                    })
                                }
                              }}
                              isEditable={messageLineInfo.isEditable}
                            />
                          </div>

                          {/* コピー成功フィードバック */}
                          {copySuccessMessageId === message.id && (
                            <div className="absolute -top-8 right-0 flex items-center gap-1 bg-gray-100 text-gray-700 px-2 py-1 rounded-md text-xs border border-gray-200 shadow-sm animate-in fade-in slide-in-from-top-1 duration-300">
                              <CheckCircle className="h-3 w-3" />
                              <span>コピーしました</span>
                            </div>
                          )}

                          {/* 編集・削除・コピーボタン（ホバー時のみ表示） */}
                          {hoveredMessageId === message.id && messageLineInfo.isEditable && editingMessageId !== message.id && (
                            <div className="absolute bottom-0 right-0 flex gap-1 bg-white shadow-md border border-gray-200 rounded-md p-1">
                              <Button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleCopyMessage(message.id)
                                }}
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 hover:bg-gray-50"
                                title="コピー"
                                data-copy-message-id={message.id}
                              >
                                <Copy className="h-3 w-3 text-gray-600" />
                              </Button>
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
                                  className={`max-w-sm md:max-w-md lg:max-w-lg h-auto rounded-lg border shadow-sm cursor-pointer hover:shadow-md transition-shadow ${
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
          {/* メッセージ選択ツール */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">メッセージ操作</h3>
            <div className="space-y-2">
              <Button
                onClick={handleToggleSelectionMode}
                variant={isSelectionMode ? "default" : "outline"}
                size="sm"
                className="w-full justify-start"
                disabled={isUpdating}
              >
                {isSelectionMode ? '選択モード終了' : 'メッセージ選択モード'}
              </Button>
              {selectedMessages.size > 0 && (
                <div className="space-y-1">
                  <Button
                    onClick={handleMoveMessages}
                    size="sm"
                    className="w-full justify-start bg-blue-500 hover:bg-blue-600 text-white"
                    disabled={isUpdating}
                  >
                    {selectedMessages.size}件を別ラインに移動
                  </Button>
                  <Button
                    onClick={() => setSelectedMessages(new Set())}
                    size="sm"
                    variant="outline"
                    className="w-full justify-start"
                    disabled={isUpdating}
                  >
                    選択解除
                  </Button>
                </div>
              )}
            </div>
          </div>

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

      {/* Composer または メッセージ選択・移動ツールバー */}
      <div className="fixed bottom-28 left-0 right-0 p-2 sm:p-4 border-t border-gray-100 bg-white z-10">
        {(isSelectionMode || selectedMessages.size > 0) ? (
          /* メッセージ選択・移動ツールバー */
          <div className="bg-yellow-50 -m-2 sm:-m-4 p-2 sm:p-4 border-t border-yellow-200">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-700">
                  {selectedMessages.size > 0 ? `${selectedMessages.size}件選択中` : '選択モード'}
                </span>
                {selectedMessages.size > 0 && (
                  <Button
                    onClick={handleMoveMessages}
                    size="sm"
                    className="bg-blue-500 hover:bg-blue-600 text-white"
                    disabled={isUpdating}
                  >
                    別ラインに移動
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                {selectedMessages.size > 0 && (
                  <Button
                    onClick={() => setSelectedMessages(new Set())}
                    size="sm"
                    variant="outline"
                    disabled={isUpdating}
                  >
                    選択解除
                  </Button>
                )}
                <Button
                  onClick={handleToggleSelectionMode}
                  size="sm"
                  variant={isSelectionMode ? "default" : "outline"}
                  disabled={isUpdating}
                >
                  {isSelectionMode ? '選択完了' : '選択モード'}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <>

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
                  ref={textareaRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onInput={adjustTextareaHeight}
                  placeholder="メッセージを入力... (/task_high, /document, /session などのコマンドが使用できます)"
                  className="min-h-[80px] max-h-32 resize-none border border-gray-300 rounded-md px-3 py-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none w-full overflow-y-auto"
                  style={{ height: '80px' }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault()
                      handleSendMessage()
                    }
                  }}
                />
              </div>
              <div className="flex flex-col gap-2">
                <SlashCommandButtons
                  onCommandSelect={(command) => {
                    setInputValue(prevValue => {
                      // カーソル位置に挿入するか、先頭に追加
                      if (prevValue.trim() === '') {
                        return command
                      }
                      return command + prevValue
                    })
                  }}
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={(!inputValue.trim() && pendingImages.length === 0) || isUpdating}
                  className="h-9 px-3 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 [&_svg]:!size-3"
                >
                  <Send className="h-3 w-3" />
                  {isUpdating && <span className="ml-2 text-xs">送信中...</span>}
                </Button>
              </div>
            </div>
          </>
        )}
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

      {/* メッセージ移動ダイアログ */}
      {showMoveDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <GitBranch className="h-6 w-6 text-blue-600" />
                <h3 className="text-lg font-semibold text-gray-900">メッセージを移動</h3>
              </div>

              <p className="text-gray-600 mb-4">
                {selectedMessages.size}件のメッセージを移動先のラインを選択してください：
              </p>

              <div className="max-h-60 overflow-y-auto space-y-2 mb-4">
                {Object.values(lines)
                  .filter(line => line.id !== currentLineId) // 現在のラインは除外
                  .map(line => (
                    <button
                      key={line.id}
                      onClick={() => handleConfirmMove(line.id)}
                      disabled={isUpdating}
                      className="w-full text-left p-3 border border-gray-200 rounded-md hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-50"
                    >
                      <div className="font-medium text-gray-900">{line.name}</div>
                      <div className="text-sm text-gray-500">
                        {line.messageIds.length}件のメッセージ
                        {line.tagIds && line.tagIds.length > 0 && (
                          <span className="ml-2">
                            {line.tagIds.slice(0, 2).map(tagId => {
                              const tag = tags[tagId]
                              return tag ? `#${tag.name}` : ''
                            }).filter(Boolean).join(' ')}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
              </div>

              <div className="flex gap-3 justify-end">
                <Button
                  onClick={() => setShowMoveDialog(false)}
                  variant="outline"
                  disabled={isUpdating}
                >
                  キャンセル
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

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
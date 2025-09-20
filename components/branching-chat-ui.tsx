"use client"

import { useState, useRef, useEffect, useMemo, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Send, Zap, Edit3, Plus, X, Circle, GitBranch } from "lucide-react"
import Image from "next/image"

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
  description: string
  messageIds: string[] // このラインに属するメッセージのIDリスト
  startMessageId: string // ラインの開始メッセージ
  endMessageId?: string // ラインの終了メッセージ（まだ続いている場合はundefined）
  branchFromMessageId?: string // 分岐元のメッセージID（メインライン以外）
  tags?: string[]
  created_at: string
  updated_at: string
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
  initialCurrentLineId?: string
  onLineChange?: (lineId: string) => void
}

export function BranchingChatUI({
  initialMessages = {},
  initialLines = {},
  initialBranchPoints = {},
  initialCurrentLineId = '',
  onLineChange
}: BranchingChatUIProps) {
  const [messages, setMessages] = useState<Record<string, Message>>(initialMessages)
  const [lines, setLines] = useState<Record<string, Line>>(initialLines)
  const [branchPoints, setBranchPoints] = useState<Record<string, BranchPoint>>(initialBranchPoints)

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
    tags: string[]
    newTag: string
  }>({ name: "", tags: [], newTag: "" })
  const messagesEndRef = useRef<HTMLDivElement>(null)

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

  // 新しいデータ構造をそのまま使用（変換不要）
  const loadNewDataStructure = (data: {
    messages?: Record<string, Omit<Message, 'timestamp'> & { timestamp: string }>;
    lines?: Line[];
    branchPoints?: Record<string, BranchPoint>;
  }) => {
    const newMessages: Record<string, Message> = {}
    const newLines: Record<string, Line> = {}
    const newBranchPoints: Record<string, BranchPoint> = {}

    // メッセージデータをそのまま使用
    if (data.messages) {
      Object.entries(data.messages).forEach(([id, msg]) => {
        newMessages[id] = {
          ...msg,
          timestamp: new Date(msg.timestamp)
        }
      })
    }

    // ラインデータをRecord形式に変換
    if (data.lines && Array.isArray(data.lines)) {
      data.lines.forEach((line) => {
        newLines[line.id] = line
      })
    }

    // 分岐点データをそのまま使用
    if (data.branchPoints) {
      Object.entries(data.branchPoints).forEach(([id, branchPoint]) => {
        newBranchPoints[id] = branchPoint
      })
    }

    return { messages: newMessages, lines: newLines, branchPoints: newBranchPoints }
  }


  // 初期データの更新を監視
  useEffect(() => {
    if (Object.keys(initialMessages).length > 0) {
      setMessages(initialMessages)
    }
  }, [initialMessages])

  useEffect(() => {
    if (Object.keys(initialLines).length > 0) {
      setLines(initialLines)
    }
  }, [initialLines])

  useEffect(() => {
    if (Object.keys(initialBranchPoints).length > 0) {
      setBranchPoints(initialBranchPoints)
    }
  }, [initialBranchPoints])

  useEffect(() => {
    if (initialCurrentLineId) {
      setCurrentLineId(initialCurrentLineId)
    }
  }, [initialCurrentLineId])

  useEffect(() => {
    // 初期データが空の場合のみローカルファイルから読み込み
    if (Object.keys(initialMessages).length === 0) {
      const loadChatData = async () => {
        try {
          const response = await fetch('/data/chat-sample.json')
          const data = await response.json()

          DEV_LOG.data('Chat data loaded successfully', {
            messagesCount: Object.keys(data.messages || {}).length,
            linesCount: data.lines?.length || 0,
            branchPointsCount: Object.keys(data.branchPoints || {}).length
          })

          // 新しいデータ構造をそのまま使用
          const loaded = loadNewDataStructure(data)
          setMessages(loaded.messages)
          setLines(loaded.lines)
          setBranchPoints(loaded.branchPoints)

          // キャッシュをクリア
          setPathCache(new Map())
          setLineAncestryCache(new Map())

          // デフォルトラインを設定（メインラインまたは最初のライン）
          const mainLine = loaded.lines['main'] || Object.values(loaded.lines)[0]
          if (mainLine) {
            setCurrentLineId(mainLine.id)
            DEV_LOG.data('Default line set', mainLine.id)
          }
        } catch (error) {
          DEV_LOG.error('Failed to load chat data', error)
        }
      }

      loadChatData()
    }
  }, [initialMessages])

  // ブランチ選択時の自動スクロールを無効化
  // useEffect(() => {
  //   scrollToBottom()
  // }, [currentLineId])

  const handleImageFile = (file: File): Promise<string> => {
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

  // useMemoでメモ化されたタイムラインを取得
  const completeTimeline = useMemo(() => {
    return getCompleteTimeline()
  }, [getCompleteTimeline])

  // ラインの切り替え（キャッシュクリアあり）
  const switchToLine = (lineId: string) => {
    if (lines[lineId]) {
      setCurrentLineId(lineId)
      // 外部コールバックを呼び出し
      if (onLineChange) {
        onLineChange(lineId)
      }
      // 新しいラインに切り替えたらキャッシュをクリアしない（再利用可能）
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

  const handleSendMessage = () => {
    if (!inputValue.trim() && pendingImages.length === 0) return

    const newMessageId = `msg${Date.now()}`
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

    if (shouldCreateNewLine) {
      // 新しいラインを作成
      const newLineId = `line-${Date.now()}`
      // メッセージ内容をブランチ名に使用（50文字まで）
      const newLineName = inputValue.slice(0, 50) + (inputValue.length > 50 ? '...' : '')

      // 新しいラインを作成（空のメッセージリストで開始）
      const newLine: Line = {
        id: newLineId,
        name: newLineName,
        description: "",
        messageIds: [],
        startMessageId: "",
        endMessageId: undefined,
        branchFromMessageId: selectedBaseMessage,
        tags: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      // ラインを追加
      setLines((prev) => ({
        ...prev,
        [newLineId]: newLine
      }))

      // 分岐点を更新
      setBranchPoints((prev) => {
        const updated = { ...prev }
        if (updated[selectedBaseMessage!]) {
          // 既存の分岐点に新しいラインを追加
          updated[selectedBaseMessage!] = {
            ...updated[selectedBaseMessage!],
            lines: [...updated[selectedBaseMessage!].lines, newLineId]
          }
        } else {
          // 新しい分岐点を作成
          updated[selectedBaseMessage!] = {
            messageId: selectedBaseMessage!,
            lines: [newLineId]
          }
        }
        return updated
      })

      // 新しいラインに切り替え
      setCurrentLineId(newLineId)

    } else {
      // 既存のライン継続
      const newMessage: Message = {
        id: newMessageId,
        content: inputValue,
        timestamp: new Date(),
        lineId: currentLineId,
        prevInLine: baseMessageId,
        author: "User",
        ...(pendingImages.length > 0 && { images: [...pendingImages] }),
      }

      // メッセージを追加
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

      // ラインにメッセージを追加
      setLines((prev) => {
        const updated = { ...prev }
        if (updated[currentLineId]) {
          updated[currentLineId] = {
            ...updated[currentLineId],
            messageIds: [...updated[currentLineId].messageIds, newMessageId],
            endMessageId: newMessageId,
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
        tags: [...(currentLineInfo.tags || [])],
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
            tags: editingBranchData.tags,
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
      setEditingBranchData(prev => ({
        ...prev,
        tags: [...prev.tags, prev.newTag.trim()],
        newTag: ""
      }))
    }
  }

  const handleRemoveTag = (tagIndex: number) => {
    setEditingBranchData(prev => ({
      ...prev,
      tags: prev.tags.filter((_, index) => index !== tagIndex)
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

    return (
      <div className="px-4 py-2 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between">
          <div className="flex gap-1 overflow-x-auto pb-1 flex-1" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {completeTimeline.messages.map((message, index) => {
            const hasBranches = branchPoints[message.id]?.lines.length > 0
            const isLast = index === completeTimeline.messages.length - 1
            const messageLineInfo = getMessageLineInfo(index, completeTimeline)
            const isLineTransition = messageLineInfo.isLineStart && index > 0

            return (
              <div key={`${message.id}-${index}`} className="flex items-center gap-1 flex-shrink-0">
                {isLineTransition && (
                  <div className="flex items-center gap-1 mx-1">
                    <div className="w-1 h-1 bg-blue-500 rounded-full"></div>
                    <div className="text-xs text-blue-600 font-medium whitespace-nowrap">
                      {messageLineInfo.transitionInfo?.lineName}
                    </div>
                    <div className="w-1 h-1 bg-blue-500 rounded-full"></div>
                    <div className="w-2 h-0.5 bg-blue-400"></div>
                  </div>
                )}
                <button
                  className={`relative flex items-center justify-center transition-all duration-200 ${
                    hasBranches
                      ? 'w-6 h-6 bg-emerald-100 hover:bg-emerald-200 border-2 border-emerald-300 rounded-full'
                      : messageLineInfo.isCurrentLine
                      ? 'w-4 h-4 bg-gray-200 hover:bg-gray-300 rounded-full'
                      : 'w-4 h-4 bg-blue-100 hover:bg-blue-200 border border-blue-200 rounded-full'
                  }`}
                  onClick={() => {
                    const element = document.getElementById(`message-${message.id}`)
                    element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                  }}
                >
                  {hasBranches ? (
                    <GitBranch className="w-3 h-3 text-emerald-600" />
                  ) : (
                    <Circle className={`w-2 h-2 fill-current ${
                      messageLineInfo.isCurrentLine ? 'text-gray-500' : 'text-blue-500'
                    }`} />
                  )}
                </button>
                {!isLast && (
                  <div className={`w-3 h-0.5 ${
                    messageLineInfo.isCurrentLine ? 'bg-gray-300' : 'bg-blue-300'
                  }`}></div>
                )}
              </div>
            )
          })}
          </div>
          <span className="text-xs text-gray-400 ml-3 flex-shrink-0">
            {completeTimeline.messages.length}メッセージ
            {completeTimeline.transitions.length > 0 && (
              <span className="text-blue-600 ml-1">
                ({completeTimeline.transitions.length}ライン)
              </span>
            )}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen max-w-md mx-auto bg-white pb-20">
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
                  <p className="text-xs text-gray-500">{currentLineInfo.description}</p>
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
              {currentLineInfo.tags && currentLineInfo.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {currentLineInfo.tags.map((tag, tagIndex) => (
                    <Badge key={`current-line-tag-${tagIndex}`} variant="secondary" className="text-xs bg-emerald-100 text-emerald-700">
                      {tag}
                    </Badge>
                  ))}
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
                  {editingBranchData.tags.map((tag, tagIndex) => (
                    <div key={tagIndex} className="flex items-center">
                      <Badge variant="secondary" className="text-xs bg-emerald-100 text-emerald-700 pr-1">
                        {tag}
                        <button
                          onClick={() => handleRemoveTag(tagIndex)}
                          className="ml-1 text-emerald-500 hover:text-emerald-700"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    </div>
                  ))}
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
      <div className="flex-1 overflow-y-auto px-4 py-6 pb-24 space-y-8">
        {completeTimeline.messages.map((message, index) => {
          const branchingLines = getBranchingLines(message.id)
          const isSelected = selectedBaseMessage === message.id
          const messageLineInfo = getMessageLineInfo(index, completeTimeline)
          const isLineTransition = messageLineInfo.isLineStart && index > 0

          return (
            <div key={`${message.id}-${index}`} className="space-y-4">
              {/* ライン切り替わりインジケーター */}
              {isLineTransition && (
                <div className="flex items-center gap-3 py-3 -mx-4 px-4 bg-gradient-to-r from-blue-50 to-transparent border-l-4 border-blue-400">
                  <GitBranch className="w-4 h-4 text-blue-600" />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-blue-800">
                      → {messageLineInfo.transitionInfo?.lineName}
                    </div>
                    <div className="text-xs text-blue-600">
                      {messageLineInfo.lineInfo?.description}
                    </div>
                  </div>
                  {messageLineInfo.lineInfo?.tags && messageLineInfo.lineInfo.tags.length > 0 && (
                    <div className="flex gap-1">
                      {messageLineInfo.lineInfo.tags.slice(0, 2).map((tag, tagIndex) => (
                        <Badge key={tagIndex} variant="secondary" className="text-xs bg-blue-100 text-blue-700">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div
                id={`message-${message.id}`}
                className={`cursor-pointer transition-all duration-200 ${
                  isSelected ? "bg-gray-100 -mx-2 px-2 py-2 rounded-lg border-2 border-green-600" : ""
                } ${
                  !messageLineInfo.isCurrentLine ? "border-l-2 border-blue-200 pl-3 ml-1" : ""
                }`}
                onClick={() => handleMessageTap(message.id)}
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
                      <div className={`leading-relaxed whitespace-pre-wrap text-sm ${
                        !messageLineInfo.isCurrentLine
                          ? "text-gray-600"
                          : isSelected
                          ? "text-gray-900"
                          : "text-gray-900"
                      }`}>
                        {message.content}
                      </div>
                    </div>

                    {/* 画像表示 - 有効なURLのみレンダリング */}
                    {message.images && message.images.length > 0 && (
                      <div className="mt-2 space-y-2">
                        {message.images
                          .filter(imageUrl => isValidImageUrl(imageUrl))
                          .map((imageUrl, imageIndex) => (
                          <div key={`${message.id}-image-${imageIndex}`} className="relative">
                            <Image
                              src={imageUrl}
                              alt={`Image ${imageIndex + 1}`}
                              width={500}
                              height={300}
                              className={`max-w-full h-auto rounded-lg border shadow-sm cursor-pointer hover:shadow-md transition-shadow ${
                                !messageLineInfo.isCurrentLine ? 'border-blue-200 opacity-80' : 'border-gray-200'
                              }`}
                              onClick={() => {
                                window.open(imageUrl, '_blank')
                              }}
                            />
                          </div>
                        ))}
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
                      const lastMessagePreview = lastMessage?.content ? lastMessage.content.slice(0, 25) + (lastMessage.content.length > 25 ? "..." : "") : ""
                      const firstTag = line.tags?.[0]
                      // 更新日時を優先表示
                      const relativeTime = line.updated_at ? getRelativeTime(line.updated_at) : (line.created_at ? getRelativeTime(line.created_at) : "")

                      return (
                        <div
                          key={`${message.id}-line-${line.id}`}
                          className={`w-full text-left rounded-lg transition-all duration-200 cursor-pointer relative group ${
                            isCurrentLine
                              ? 'bg-emerald-100 border-2 border-emerald-300 text-emerald-800'
                              : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent text-gray-700 hover:text-gray-900'
                          }`}
                        >
                          <div
                            onClick={() => switchToLine(line.id)}
                            className="px-3 py-2 w-full"
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
                                  {firstTag}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center justify-between ml-3">
                              <span className="text-xs text-gray-500 truncate max-w-[120px]">
                                {lastMessagePreview}
                              </span>
                              {relativeTime && (
                                <span className="text-xs text-gray-400 font-medium">
                                  {relativeTime}
                                </span>
                              )}
                            </div>
                          </div>
                          {/* 編集ボタン */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              // 編集機能は今後実装
                              console.log('Edit line:', line.id)
                            }}
                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-white hover:shadow-sm"
                          >
                            <Edit3 className="h-3 w-3 text-gray-400 hover:text-gray-600" />
                          </button>
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

      {/* Composer */}
      <div className="p-4 border-t border-gray-100 bg-white">
        {selectedBaseMessage ? (
          <div className="mb-3 p-3 bg-emerald-50 rounded-lg text-sm border border-emerald-200">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <span className="text-gray-500">分岐基点: </span>
                <span className="font-medium text-gray-800">
                  {messages[selectedBaseMessage]?.content.slice(0, 30)}
                  {messages[selectedBaseMessage]?.content.length > 30 ? "..." : ""}
                </span>
                <div className="mt-1">
                  <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700">
                    🌿 新しい分岐を作成
                  </span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-gray-400 hover:text-gray-600 hover:bg-emerald-100"
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
                {currentLineInfo?.name || "メインライン"}
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
              placeholder={selectedBaseMessage ? "新規ブランチ名を入力" : "新規メッセージを入力"}
              className="min-h-[44px] max-h-32 resize-none border border-gray-300 rounded-md px-3 py-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none w-full"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  handleSendMessage()
                }
              }}
            />
          </div>
          <Button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() && pendingImages.length === 0}
            className="h-11 px-4 bg-blue-500 hover:bg-blue-600 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
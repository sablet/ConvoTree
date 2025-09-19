"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Send, Zap, Tag, Edit3, Plus, X, Circle, GitBranch } from "lucide-react"

interface Message {
  id: string
  content: string
  timestamp: Date
  parentId?: string
  children: string[]
  tags?: string[]
  hasBookmark?: boolean
  author?: string
  images?: string[]
}

interface Branch {
  id: string
  name: string
  description: string
  messageIds: string[]
  tags?: string[]
  created_at: string
  updated_at: string
}

export function BranchingChatUI() {
  const [messages, setMessages] = useState<Record<string, Message>>({})
  const [chatData, setChatData] = useState<any>(null)

  const [currentBranch, setCurrentBranch] = useState<string[]>([])
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
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

  useEffect(() => {
    const loadChatData = async () => {
      try {
        const response = await fetch('/data/chat-sample.json')
        const data = await response.json()
        setChatData(data)
        setMessages(data.messages)

        // デフォルトブランチを設定
        if (data.branches && data.branches.length > 0) {
          const defaultBranch = data.branches.find((b: any) => b.id === 'main') || data.branches[0]
          setCurrentBranch(defaultBranch.messageIds)
        }
      } catch (error) {
        console.error('Failed to load chat data:', error)
      }
    }

    loadChatData()
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [currentBranch])

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

  const handlePaste = async (e: ClipboardEvent) => {
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
  }

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
  }, [])

  const getBranches = (messageId: string): Branch[] => {
    const message = messages[messageId]
    if (!message || message.children.length <= 1) return []

    // 各子メッセージに対応するブランチを見つける
    return message.children.map((childId) => {
      // このchildIdを含むブランチを探す
      const matchingBranch = chatData?.branches?.find((branch: any) =>
        branch.messageIds.includes(childId)
      )

      if (matchingBranch) {
        return matchingBranch
      }

      // ブランチが見つからない場合は、動的に作成
      const pathFromRoot = getPathFromRoot(childId)
      const endMessage = messages[childId]
      const now = new Date().toISOString()
      return {
        id: childId,
        name: `分岐 ${childId}`,
        description: endMessage ? endMessage.content.slice(0, 30) + (endMessage.content.length > 30 ? "..." : "") : "",
        messageIds: pathFromRoot,
        tags: [],
        created_at: now,
        updated_at: now
      }
    }).filter(Boolean)
  }

  const getPathToEnd = (startId: string): string[] => {
    const path = [startId]
    let current = messages[startId]

    while (current && current.children.length > 0) {
      // 最初の子を選択（実際のアプリでは最新のメッセージを選択する可能性がある）
      const nextId = current.children[0]
      path.push(nextId)
      current = messages[nextId]
    }

    return path
  }

  const switchToBranch = (branchId: string) => {
    // まず既存のブランチから探す
    const branch = chatData?.branches.find((b: any) => b.id === branchId)
    if (branch) {
      setCurrentBranch(branch.messageIds)
      return
    }

    // 動的ブランチの場合：branchIdはchildIdと同じなので、そこからパスを生成
    if (messages[branchId]) {
      const path = getPathFromRoot(branchId)
      setCurrentBranch(path)
    }
  }

  const getPathFromRoot = (messageId: string): string[] => {
    const path = []
    let current = messages[messageId]

    while (current) {
      path.unshift(current.id)
      if (current.parentId) {
        current = messages[current.parentId]
      } else {
        break
      }
    }

    return path
  }

  const getCurrentBranch = (): Branch | null => {
    if (!currentBranch.length) return null

    // 既存のブランチから探す
    if (chatData?.branches) {
      const existingBranch = chatData.branches.find((branch: any) =>
        JSON.stringify(branch.messageIds) === JSON.stringify(currentBranch)
      )
      if (existingBranch) return existingBranch
    }

    // 既存ブランチが見つからない場合は動的に作成
    const lastMessageId = currentBranch[currentBranch.length - 1]
    const lastMessage = messages[lastMessageId]
    const now = new Date()
    const isoTimestamp = now.toISOString()

    return {
      id: `dynamic-${currentBranch.join('-')}`,
      name: `branch_${isoTimestamp.slice(0, 19).replace(/[-:]/g, '').replace('T', '')}`,
      description: lastMessage ? `${lastMessage.content.slice(0, 30)}...` : "",
      messageIds: currentBranch,
      tags: [],
      created_at: isoTimestamp,
      updated_at: isoTimestamp
    }
  }

  const handleSendMessage = () => {
    if (!inputValue.trim() && pendingImages.length === 0) return

    const newMessageId = `msg${Date.now()}`
    const baseMessageId = selectedBaseMessage || currentBranch[currentBranch.length - 1]

    const newMessage: Message = {
      id: newMessageId,
      content: inputValue,
      timestamp: new Date(),
      parentId: baseMessageId,
      children: [],
      author: "User",
      ...(pendingImages.length > 0 && { images: [...pendingImages] }),
    }

    setMessages((prev) => {
      const updated = { ...prev }
      updated[newMessageId] = newMessage

      // 親メッセージの子リストに追加
      if (updated[baseMessageId]) {
        updated[baseMessageId] = {
          ...updated[baseMessageId],
          children: [...updated[baseMessageId].children, newMessageId],
        }
      }

      return updated
    })

    // 新しいメッセージを含むブランチに切り替え
    const pathToBase = getPathFromRoot(baseMessageId)
    setCurrentBranch([...pathToBase, newMessageId])

    setInputValue("")
    setPendingImages([])
    setSelectedBaseMessage(null)
  }

  const handleMessageTap = (messageId: string) => {
    setSelectedBaseMessage(messageId)
  }

  const handleEditBranch = () => {
    const currentBranchInfo = getCurrentBranch()
    if (currentBranchInfo) {
      setEditingBranchData({
        name: currentBranchInfo.name,
        tags: [...(currentBranchInfo.tags || [])],
        newTag: ""
      })
      setIsEditingBranch(true)
    }
  }

  const handleSaveBranchEdit = () => {
    const currentBranchInfo = getCurrentBranch()
    if (currentBranchInfo && chatData) {
      let updatedBranches

      // 既存のブランチかどうかチェック
      const existingBranchIndex = chatData.branches.findIndex((branch: any) =>
        branch.id === currentBranchInfo.id
      )

      if (existingBranchIndex >= 0) {
        // 既存ブランチの更新
        updatedBranches = chatData.branches.map((branch: any) => {
          if (branch.id === currentBranchInfo.id) {
            return {
              ...branch,
              name: editingBranchData.name,
              description: branch.description, // 既存の説明を保持
              tags: editingBranchData.tags,
              updated_at: new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
            }
          }
          return branch
        })
      } else {
        // 新しいブランチの追加
        const now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
        const newBranch = {
          id: `branch-${Date.now()}`,
          name: editingBranchData.name,
          description: currentBranchInfo.description,
          messageIds: currentBranch,
          tags: editingBranchData.tags,
          created_at: now,
          updated_at: now
        }
        updatedBranches = [...chatData.branches, newBranch]
      }

      setChatData({
        ...chatData,
        branches: updatedBranches
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

  const currentBranchInfo = getCurrentBranch()

  const renderTimelineMinimap = () => {
    if (currentBranch.length === 0) return null

    return (
      <div className="px-4 py-2 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between">
          <div className="flex gap-1 overflow-x-auto pb-1 flex-1" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {currentBranch.map((messageId, index) => {
            const message = messages[messageId]
            const hasBranches = message && message.children.length > 1
            const isLast = index === currentBranch.length - 1

            return (
              <div key={messageId} className="flex items-center gap-1 flex-shrink-0">
                <button
                  className={`relative flex items-center justify-center transition-all duration-200 ${
                    hasBranches
                      ? 'w-6 h-6 bg-emerald-100 hover:bg-emerald-200 border-2 border-emerald-300 rounded-full'
                      : 'w-4 h-4 bg-gray-200 hover:bg-gray-300 rounded-full'
                  }`}
                  onClick={() => {
                    const element = document.getElementById(`message-${messageId}`)
                    element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                  }}
                >
                  {hasBranches ? (
                    <GitBranch className="w-3 h-3 text-emerald-600" />
                  ) : (
                    <Circle className="w-2 h-2 text-gray-500 fill-current" />
                  )}
                </button>
                {!isLast && (
                  <div className="w-3 h-0.5 bg-gray-300"></div>
                )}
              </div>
            )
          })}
          </div>
          <span className="text-xs text-gray-400 ml-3 flex-shrink-0">{currentBranch.length}メッセージ</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen max-w-md mx-auto bg-white">
      {/* Timeline Minimap */}
      {renderTimelineMinimap()}

      {/* Current Branch Header */}
      {currentBranchInfo && (
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          {!isEditingBranch ? (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-medium text-gray-800">{currentBranchInfo.name}</h2>
                  <p className="text-xs text-gray-500">{currentBranchInfo.description}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleEditBranch}
                  className="h-8 px-2 text-gray-400 hover:text-gray-600"
                >
                  <Edit3 className="h-4 w-4" />
                </Button>
              </div>
              {currentBranchInfo.tags && currentBranchInfo.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {currentBranchInfo.tags.map((tag, tagIndex) => (
                    <Badge key={`current-branch-tag-${tagIndex}`} variant="secondary" className="text-xs bg-emerald-100 text-emerald-700">
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
                  placeholder="ブランチタイトル"
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
                  onClick={handleSaveBranchEdit}
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
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-8">
        {currentBranch.map((messageId, index) => {
          const message = messages[messageId]
          const branches = getBranches(messageId)
          const isSelected = selectedBaseMessage === messageId

          return (
            <div key={messageId} className="space-y-4">
              <div
                id={`message-${messageId}`}
                className={`cursor-pointer transition-all duration-200 ${
                  isSelected ? "bg-gray-100 -mx-2 px-2 py-2 rounded-lg border-2 border-green-600" : ""
                }`}
                onClick={() => handleMessageTap(messageId)}
              >
                <div className="flex gap-3">
                  {/* 時刻表示 */}
                  <div className="text-xs text-gray-400 font-mono min-w-[35px] pt-0.5 leading-relaxed">
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
                        isSelected
                          ? "text-gray-900"
                          : "text-gray-900"
                      }`}>
                        {message.content}
                      </div>
                    </div>

                    {/* 画像表示 */}
                    {message.images && message.images.length > 0 && (
                      <div className="mt-2 space-y-2">
                        {message.images.map((imageUrl, imageIndex) => (
                          <div key={`${messageId}-image-${imageIndex}`} className="relative">
                            <img
                              src={imageUrl}
                              alt={`Image ${imageIndex + 1}`}
                              className="max-w-full h-auto rounded-lg border border-gray-200 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                              onClick={() => {
                                // 画像をフルサイズで表示するロジックを後で追加
                                window.open(imageUrl, '_blank')
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    )}

                  </div>
                </div>
              </div>

              {/* Branch indicator */}
              {branches.length > 0 && (
                <div className="ml-10 space-y-2">
                  <div className="flex items-center gap-2 mb-3">
                    <Zap className="h-3 w-3 text-emerald-500" />
                    <span className="text-xs text-gray-500">分岐しました（{branches.length}流れ）</span>
                  </div>
                  <div className="space-y-1">
                    {branches.map((branch, branchIndex) => {
                      const isCurrentBranch = JSON.stringify(branch.messageIds) === JSON.stringify(currentBranch)
                      const lastMessageId = branch.messageIds[branch.messageIds.length - 1]
                      const lastMessage = messages[lastMessageId]
                      const lastMessagePreview = lastMessage?.content.slice(0, 25) + (lastMessage?.content.length > 25 ? "..." : "")
                      const firstTag = branch.tags?.[0]
                      const relativeTime = branch.created_at ? getRelativeTime(branch.created_at) : ""

                      return (
                        <button
                          key={`${messageId}-branch-${branch.id}`}
                          onClick={() => switchToBranch(branch.id)}
                          className={`w-full text-left px-3 py-2 rounded-lg transition-all duration-200 ${
                            isCurrentBranch
                              ? 'bg-emerald-100 border-2 border-emerald-300 text-emerald-800'
                              : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent text-gray-700 hover:text-gray-900'
                          }`}
                        >
                          <div className="flex items-center justify-between w-full">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <span className={`font-medium text-sm truncate ${isCurrentBranch ? 'text-emerald-700' : 'text-gray-900'}`}>
                                {branch.name}
                              </span>
                              {firstTag && (
                                <span className={`text-xs px-1.5 py-0.5 rounded ${
                                  isCurrentBranch ? 'bg-emerald-200 text-emerald-600' : 'bg-gray-200 text-gray-500'
                                }`}>
                                  {firstTag}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-xs text-gray-400 truncate max-w-[60px]">
                                {lastMessagePreview}
                              </span>
                              {relativeTime && (
                                <span className="text-xs text-gray-400">
                                  {relativeTime}
                                </span>
                              )}
                              {isCurrentBranch && (
                                <Circle className="w-3 h-3 text-emerald-500 fill-current" />
                              )}
                            </div>
                          </div>
                        </button>
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
        {selectedBaseMessage && (
          <div className="mb-3 p-3 bg-emerald-50 rounded-lg text-sm border border-emerald-200">
            <span className="text-gray-500">基点: </span>
            <span className="font-medium text-gray-800">
              {messages[selectedBaseMessage]?.content.slice(0, 30)}
              {messages[selectedBaseMessage]?.content.length > 30 ? "..." : ""}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-2 h-6 px-2 text-gray-400 hover:text-gray-600 hover:bg-emerald-100"
              onClick={() => setSelectedBaseMessage(null)}
            >
              ✕
            </Button>
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
                <div key={index} className="relative">
                  <img
                    src={imageUrl}
                    alt={`Preview ${index + 1}`}
                    className="w-16 h-16 object-cover rounded border border-blue-300"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute -top-1 -right-1 w-5 h-5 p-0 bg-red-500 hover:bg-red-600 text-white rounded-full"
                    onClick={() => setPendingImages(prev => prev.filter((_, i) => i !== index))}
                  >
                    ✕
                  </Button>
                </div>
              ))}
            </div>
            <div className="text-xs text-blue-600 mt-2">
              Cmd+V でクリップボードから画像をペースト
            </div>
          </div>
        )}
        <div className="flex gap-3">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="メモを追加..."
            className="flex-1 border-gray-200 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 text-sm"
            onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
          />
          <Button
            onClick={handleSendMessage}
            size="sm"
            className="bg-emerald-500 hover:bg-emerald-600 px-3"
            disabled={!inputValue.trim() && pendingImages.length === 0}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

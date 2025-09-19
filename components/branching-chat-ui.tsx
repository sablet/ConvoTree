"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Send, Zap, Tag } from "lucide-react"

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
  messages: string[]
  endMessage: string
}

export function BranchingChatUI() {
  const [messages, setMessages] = useState<Record<string, Message>>({
    msg1: {
      id: "msg1",
      content:
        "今日の午前中はしっかり作業に連続して取り組みできてた。しかしだいぶストレスフルではあったんだろうな。あんな高々ゲームでイライラが募ったのは久々だったような。",
      timestamp: new Date("2024-01-15T20:26:00"),
      children: ["msg2"],
      author: "User1",
    },
    msg2: {
      id: "msg2",
      content:
        "直近のメッセージラインがあり、その末尾がリストにある。その中の誰かを選んで新しいメッセージを足していくイメージ。\n\n実際にはラインの途中から分岐したくなるケースもあるだろうけど、大半はライン作っておけばグルーピングできそう。\n\nまたは後からここからここまでは特定のトピックのラインだったと気づくことも。\n\nこの小ラインをグループみたいなものとみなして良いはず",
      timestamp: new Date("2024-01-15T20:38:00"),
      parentId: "msg1",
      children: ["msg3"],
      hasBookmark: true,
      author: "User2",
    },
    msg3: {
      id: "msg3",
      content:
        "了解です！\nここまでの議論を整理して、Slack風の直線タイムラインを基本にしつつ、分岐が出たときだけ工夫するモバイルUIワイヤーフレーム案をまとめます。\n\n━━━━\n\n📱 分岐対応チャットUIワイヤーフレーム案（モバイル）\n\n1. 通常表示（分岐なし＝Slack同等）",
      timestamp: new Date("2024-01-15T21:15:00"),
      parentId: "msg2",
      children: [],
      author: "User3",
    },
  })

  const [currentBranch, setCurrentBranch] = useState<string[]>(["msg1", "msg2", "msg3"])
  const [inputValue, setInputValue] = useState("")
  const [selectedBaseMessage, setSelectedBaseMessage] = useState<string | null>(null)
  const [pendingImages, setPendingImages] = useState<string[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

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

    return message.children.map((childId) => {
      const path = getPathToEnd(childId)
      const endMessage = messages[path[path.length - 1]]
      return {
        id: childId,
        messages: path,
        endMessage: endMessage.content.slice(0, 30) + (endMessage.content.length > 30 ? "..." : ""),
      }
    })
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
    // 分岐点を見つける
    const branchPoint = Object.values(messages).find((msg) => msg.children.includes(branchId))

    if (branchPoint) {
      const pathToBranch = getPathFromRoot(branchPoint.id)
      const branchPath = getPathToEnd(branchId)
      setCurrentBranch([...pathToBranch, ...branchPath])
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

  const getBreadcrumb = (): string[] => {
    return currentBranch.map((msgId) => {
      const msg = messages[msgId]
      return `${msg.author}: ${msg.content.slice(0, 15)}${msg.content.length > 15 ? "..." : ""}`
    })
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

  return (
    <div className="flex flex-col h-screen max-w-md mx-auto bg-white">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-8">
        {currentBranch.map((messageId, index) => {
          const message = messages[messageId]
          const branches = getBranches(messageId)
          const isSelected = selectedBaseMessage === messageId

          return (
            <div key={messageId} className="space-y-4">
              <div
                className={`cursor-pointer transition-all duration-200 ${
                  isSelected ? "bg-gray-100 -mx-2 px-2 py-2 rounded-lg border-2 border-green-600" : ""
                }`}
                onClick={() => handleMessageTap(messageId)}
              >
                <div className="flex gap-3">
                  {/* 時刻表示 */}
                  <div className="text-xs text-gray-400 font-mono min-w-[35px] pt-0.5 leading-relaxed">
                    {message.timestamp.toLocaleTimeString("ja-JP", {
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

                    {/* タグ表示 */}
                    {message.tags && message.tags.length > 0 && (
                      <div className="flex items-center gap-2 mt-3">
                        <div className="flex items-center gap-1 text-gray-400">
                          <Tag className="h-3 w-3" />
                          <span className="text-xs">タグを追加</span>
                        </div>
                        {message.tags.map((tag, tagIndex) => (
                          <Badge key={`${messageId}-tag-${tagIndex}`} variant="secondary" className="text-xs bg-gray-100 text-gray-600">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Branch indicator */}
              {branches.length > 0 && (
                <div className="flex items-center gap-2 ml-10">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2 bg-white border-emerald-200 hover:bg-emerald-50"
                      >
                        <Zap className="h-3 w-3 text-emerald-500" />
                        <span className="text-xs text-gray-700">分岐しました（{branches.length}流れ）</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-64">
                      <div className="p-2 text-sm font-medium text-gray-600">この分岐からの流れを選択:</div>
                      {branches.map((branch, branchIndex) => (
                        <DropdownMenuItem
                          key={`${messageId}-branch-${branch.id}`}
                          onClick={() => switchToBranch(branch.id)}
                          className="flex flex-col items-start gap-1 p-3"
                        >
                          <div className="font-medium">枝{branchIndex + 1}</div>
                          <div className="text-xs text-gray-500">末尾: {branch.endMessage}</div>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
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

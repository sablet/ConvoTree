"use client"

import { useState, useEffect } from "react"
import { BranchStructure } from "@/components/branch-structure"
import { FooterNavigation } from "@/components/footer-navigation"
import { useRouter } from "next/navigation"

interface Message {
  id: string
  content: string
  timestamp: Date
  lineId: string
  prevInLine?: string
  nextInLine?: string
  branchFromMessageId?: string
  tags?: string[]
  hasBookmark?: boolean
  author?: string
  images?: string[]
}

interface Line {
  id: string
  name: string
  description: string
  messageIds: string[]
  startMessageId: string
  endMessageId?: string
  branchFromMessageId?: string
  tagIds?: string[]
  created_at: string
  updated_at: string
}

interface Tag {
  id: string
  name: string
}

interface BranchPoint {
  messageId: string
  lines: string[]
}

export default function BranchListPage() {
  const router = useRouter()
  const [currentView, setCurrentView] = useState<'chat' | 'management' | 'branches'>('branches')
  const [messages, setMessages] = useState<Record<string, Message>>({})
  const [lines, setLines] = useState<Record<string, Line>>({})
  const [branchPoints, setBranchPoints] = useState<Record<string, BranchPoint>>({})
  const [tags, setTags] = useState<Record<string, Tag>>({})
  const [currentLineId, setCurrentLineId] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)

  // データローディング
  useEffect(() => {
    const loadChatData = async () => {
      try {
        setIsLoading(true)
        const response = await fetch('/data/chat-sample.json')
        const data = await response.json()

        const newMessages: Record<string, Message> = {}
        const newLines: Record<string, Line> = {}
        const newBranchPoints: Record<string, BranchPoint> = {}
        const newTags: Record<string, Tag> = {}

        // メッセージデータ変換
        if (data.messages) {
          Object.entries(data.messages as Record<string, Omit<Message, 'timestamp'> & { timestamp: string }>).forEach(([id, msg]) => {
            newMessages[id] = {
              ...msg,
              timestamp: new Date(msg.timestamp)
            }
          })
        }

        // ラインデータ変換
        if (data.lines && Array.isArray(data.lines)) {
          data.lines.forEach((line: Line) => {
            newLines[line.id] = line
          })
        }

        // 分岐点データ
        if (data.branchPoints) {
          Object.entries(data.branchPoints as Record<string, BranchPoint>).forEach(([id, branchPoint]) => {
            newBranchPoints[id] = branchPoint
          })
        }

        // タグデータ
        if (data.tags) {
          Object.entries(data.tags as Record<string, Tag>).forEach(([id, tag]) => {
            newTags[id] = tag
          })
        }

        setMessages(newMessages)
        setLines(newLines)
        setBranchPoints(newBranchPoints)
        setTags(newTags)

        // デフォルトライン設定
        const mainLine = newLines['main'] || Object.values(newLines)[0]
        if (mainLine) {
          setCurrentLineId(mainLine.id)
        }
      } catch (error) {
        console.error('Failed to load chat data:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadChatData()
  }, [])

  // ライン切り替えハンドラー（URLルーティング付き）
  const handleLineSwitch = (lineId: string) => {
    const targetLine = lines[lineId]
    if (targetLine) {
      setCurrentLineId(lineId)
      // チャットページにリダイレクト
      const encodedLineName = encodeURIComponent(targetLine.name)
      router.push(`/chat/${encodedLineName}`)
    }
  }

  // ライン編集ハンドラー
  const handleLineEdit = (lineId: string, updates: Partial<Line>) => {
    setLines(prev => {
      const updated = { ...prev }
      if (updated[lineId]) {
        updated[lineId] = {
          ...updated[lineId],
          ...updates,
          updated_at: new Date().toISOString()
        }
      }
      return updated
    })
  }

  // ビューが変更されたときのハンドラー
  const handleViewChange = (newView: 'chat' | 'management' | 'branches') => {
    setCurrentView(newView)

    // ビューに応じてルーティング
    if (newView === 'chat') {
      // 現在のラインのチャットページにリダイレクト
      const currentLine = lines[currentLineId]
      if (currentLine) {
        const encodedLineName = encodeURIComponent(currentLine.name)
        router.push(`/chat/${encodedLineName}`)
      } else {
        router.push('/')
      }
    } else if (newView === 'management') {
      router.push('/management')
    }
    // branchesの場合は現在のページに留まる
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">ブランチデータを読み込み中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white pb-16">
      <div className="p-4">
        <BranchStructure
          messages={messages}
          lines={lines}
          branchPoints={branchPoints}
          tags={tags}
          currentLineId={currentLineId}
          onLineSwitch={handleLineSwitch}
          onLineEdit={handleLineEdit}
          onViewChange={setCurrentView}
        />
      </div>
      <FooterNavigation
        currentView={currentView}
        onViewChange={handleViewChange}
      />
    </div>
  )
}
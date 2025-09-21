"use client"

import { useState, useEffect } from "react"
import { BranchStructure } from "@/components/branch-structure"
import { FooterNavigation } from "@/components/footer-navigation"
import { useRouter } from "next/navigation"
import { dataSourceManager } from "@/lib/data-source"

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
  color?: string
  groupId?: string
}

interface TagGroup {
  id: string
  name: string
  color: string
  order: number
}

interface BranchPoint {
  messageId: string
  lines: string[]
}

export default function BranchListPage() {
  const router = useRouter()
  const [currentView, setCurrentView] = useState<'chat' | 'management' | 'branches'>('branches')
  const [messages, setMessages] = useState<Record<string, Message>>({})
  const [lines, setLines] = useState<Line[]>([])
  const [branchPoints, setBranchPoints] = useState<Record<string, BranchPoint>>({})
  const [tags, setTags] = useState<Record<string, Tag>>({})
  const [tagGroups, setTagGroups] = useState<Record<string, TagGroup>>({})
  const [currentLineId, setCurrentLineId] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)

  // データローディング
  useEffect(() => {
    const loadChatData = async () => {
      try {
        setIsLoading(true)
        const data = await dataSourceManager.loadChatData()

        // メッセージデータ変換（timestampをDateオブジェクトに変換）
        const newMessages: Record<string, Message> = {}
        Object.entries(data.messages).forEach(([id, msg]) => {
          newMessages[id] = {
            ...msg,
            timestamp: new Date(msg.timestamp)
          }
        })

        setMessages(newMessages)
        setLines(data.lines)
        setBranchPoints(data.branchPoints)
        setTags(data.tags)
        setTagGroups(data.tagGroups)

        // デフォルトライン設定
        const mainLine = data.lines.find(line => line.id === 'main') || data.lines[0]
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
    const targetLine = lines.find(line => line.id === lineId)
    if (targetLine) {
      setCurrentLineId(lineId)
      // チャットページにリダイレクト
      const encodedLineName = encodeURIComponent(targetLine.name)
      router.push(`/chat?line=${encodedLineName}`)
    }
  }

  // ライン編集ハンドラー
  const handleLineEdit = async (lineId: string, updates: Partial<Line>) => {
    try {
      // DataSourceManagerを使用してライン更新
      if (dataSourceManager.getCurrentSource() === 'firestore') {
        await dataSourceManager.updateLine(lineId, updates)
      }

      // ローカル状態も更新
      setLines(prev => {
        return prev.map(line => {
          if (line.id === lineId) {
            return {
              ...line,
              ...updates,
              updated_at: new Date().toISOString()
            }
          }
          return line
        })
      })
    } catch (error) {
      console.error('Failed to update line:', error)
    }
  }

  // ビューが変更されたときのハンドラー
  const handleViewChange = (newView: 'chat' | 'management' | 'branches') => {
    setCurrentView(newView)

    // ビューに応じてルーティング
    if (newView === 'chat') {
      // 現在のラインのチャットページにリダイレクト
      const currentLine = lines.find(line => line.id === currentLineId)
      if (currentLine) {
        const encodedLineName = encodeURIComponent(currentLine.name)
        router.push(`/chat?line=${encodedLineName}`)
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
          tagGroups={tagGroups}
          currentLineId={currentLineId}
          onLineSwitch={handleLineSwitch}
          onLineEdit={handleLineEdit}
          onViewChange={handleViewChange}
        />
      </div>
      <FooterNavigation
        currentView={currentView}
        onViewChange={handleViewChange}
      />
    </div>
  )
}
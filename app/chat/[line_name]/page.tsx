"use client"

import { useState, useEffect, useCallback } from "react"
import { BranchingChatUI } from "@/components/branching-chat-ui"
import { FooterNavigation } from "@/components/footer-navigation"
import { TagProvider } from "@/lib/tag-context"
import { dataSourceManager } from "@/lib/data-source"
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

interface PageProps {
  params: {
    line_name: string
  }
}

export default function ChatLinePage({ params }: PageProps) {
  const router = useRouter()
  const { line_name } = params
  const decodedLineName = decodeURIComponent(line_name)

  const [currentView, setCurrentView] = useState<'chat' | 'management' | 'branches'>('chat')
  const [messages, setMessages] = useState<Record<string, Message>>({})
  const [lines, setLines] = useState<Record<string, Line>>({})
  const [branchPoints, setBranchPoints] = useState<Record<string, BranchPoint>>({})
  const [tags, setTags] = useState<Record<string, Tag>>({})
  const [currentLineId, setCurrentLineId] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [lineNotFound, setLineNotFound] = useState(false)

  // データローディング関数
  const loadChatData = useCallback(async () => {
    try {
      setIsLoading(true)
      const data = await dataSourceManager.loadChatData()

      const newMessages: Record<string, Message> = {}
      const newLines: Record<string, Line> = {}
      const newBranchPoints: Record<string, BranchPoint> = {}
      const newTags: Record<string, Tag> = {}

      // メッセージデータ変換
      if (data.messages) {
        Object.entries(data.messages).forEach(([id, msg]) => {
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
        Object.entries(data.branchPoints).forEach(([id, branchPoint]) => {
          newBranchPoints[id] = branchPoint
        })
      }

      // タグデータ
      if (data.tags) {
        Object.entries(data.tags).forEach(([id, tag]) => {
          newTags[id] = tag
        })
      }

      setMessages(newMessages)
      setLines(newLines)
      setBranchPoints(newBranchPoints)
      setTags(newTags)

      // 指定されたライン名でラインを検索
      const targetLine = Object.values(newLines).find(
        line => line.name === decodedLineName || line.id === decodedLineName
      )

      if (targetLine) {
        setCurrentLineId(targetLine.id)
        setLineNotFound(false)
      } else {
        // ラインが見つからない場合、メインラインにフォールバック
        const mainLine = newLines['main'] || Object.values(newLines)[0]
        if (mainLine) {
          setCurrentLineId(mainLine.id)
        }
        setLineNotFound(true)
      }
    } catch (error) {
      console.error('Failed to load chat data:', error)
      // Firestoreエラー時は空の状態を維持（自動フォールバックしない）
      setMessages({})
      setLines({})
      setBranchPoints({})
      setTags({})
      setCurrentLineId('')
    } finally {
      setIsLoading(false)
    }
  }, [decodedLineName])

  // 初期データローディング
  useEffect(() => {
    loadChatData()
  }, [loadChatData])

  // ブラウザの戻る・進むボタンに対応
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (event.state?.lineId) {
        // 履歴から戻ってきた場合、そのラインに切り替え
        setCurrentLineId(event.state.lineId)
      } else {
        // stateがない場合は、URLからライン名を取得
        const path = window.location.pathname
        const match = path.match(/^\/chat\/(.+)$/)
        if (match) {
          const currentDecodedLineName = decodeURIComponent(match[1])
          const targetLine = Object.values(lines).find(
            line => line.name === currentDecodedLineName || line.id === currentDecodedLineName
          )
          if (targetLine) {
            setCurrentLineId(targetLine.id)
          }
        }
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [lines])

  // ライン切り替えハンドラー（URL更新、履歴あり）
  const handleLineChange = useCallback((lineId: string) => {
    console.log('handleLineChange called with:', lineId)
    const targetLine = lines[lineId]
    console.log('targetLine found:', targetLine)
    if (targetLine) {
      setCurrentLineId(lineId)
      // URLを履歴ありで更新（ページ遷移せず）
      const encodedLineName = encodeURIComponent(targetLine.name)
      console.log('Updating URL to:', `/chat/${encodedLineName}`)
      window.history.pushState({ lineId }, '', `/chat/${encodedLineName}`)
    } else {
      console.log('targetLine not found, available lines:', Object.keys(lines))
    }
  }, [lines])

  // 新しいライン作成時専用のハンドラー（ライン名が既に分かっている）
  const handleNewLineCreated = useCallback((lineId: string, lineName: string) => {
    console.log('handleNewLineCreated called with:', lineId, lineName)
    setCurrentLineId(lineId)
    // URLを履歴ありで更新（ページ遷移せず）
    const encodedLineName = encodeURIComponent(lineName)
    console.log('Updating URL to:', `/chat/${encodedLineName}`)
    window.history.pushState({ lineId }, '', `/chat/${encodedLineName}`)
  }, [])


  // ビューが変更されたときのハンドラー
  const handleViewChange = (newView: 'chat' | 'management' | 'branches') => {
    setCurrentView(newView)

    // ビューに応じてルーティング
    if (newView === 'branches') {
      router.push('/branch_list')
    } else if (newView === 'management') {
      router.push('/management')
    }
    // chatの場合は現在のページに留まる
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">チャットデータを読み込み中...</p>
        </div>
      </div>
    )
  }

  return (
    <TagProvider>
      <div className="min-h-screen bg-white pb-16">
        {lineNotFound && (
          <div className="bg-yellow-100 border-l-4 border-yellow-500 p-4 mb-4">
            <div className="flex">
              <div className="ml-3">
                <p className="text-sm text-yellow-700">
                  ライン「{decodedLineName}」が見つかりませんでした。メインラインを表示しています。
                </p>
              </div>
            </div>
          </div>
        )}

        <BranchingChatUI
          initialMessages={messages}
          initialLines={lines}
          initialBranchPoints={branchPoints}
          initialTags={tags}
          initialCurrentLineId={currentLineId}
          onLineChange={handleLineChange}
          onNewLineCreated={handleNewLineCreated}
        />

        <FooterNavigation
          currentView={currentView}
          onViewChange={handleViewChange}
        />
      </div>
    </TagProvider>
  )
}
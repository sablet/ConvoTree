"use client"

import { useState, useEffect, useCallback, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { ChatContainer } from "@/components/chat/ChatContainer"
import { FooterNavigation } from "@/components/footer-navigation"
import { TagProvider } from "@/lib/tag-context"
import { ChatLayout } from "@/components/layouts/ChatLayout"
import { useChatData } from "@/hooks/use-chat-data"
import { MAIN_LINE_ID } from "@/lib/constants"
import { LOADING_CHAT_DATA } from "@/lib/ui-strings"
import { ROUTE_BRANCHES, ROUTE_MANAGEMENT } from "@/lib/routes"
import { LoadingFallback } from "@/components/LoadingFallback"

function ChatPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const lineName = searchParams.get('line') || MAIN_LINE_ID
  const decodedLineName = decodeURIComponent(lineName)

  const [currentView, setCurrentView] = useState<'chat' | 'management' | 'branches'>('chat')
  const [currentLineId, setCurrentLineId] = useState<string>('')
  const [lineNotFound, setLineNotFound] = useState(false)

  const { messages, lines, tags, loadChatData, chatRepository } = useChatData({})

  // 初期データローディング
  useEffect(() => {
    console.log('[ChatPage] Calling loadChatData')
    loadChatData()
  }, [loadChatData])

  // messages, lines, tags の変更を監視
  useEffect(() => {
    console.log('[ChatPage] Data state updated:', {
      messagesCount: Object.keys(messages).length,
      linesCount: Object.keys(lines).length,
      tagsCount: Object.keys(tags).length,
      currentLineId
    })
  }, [messages, lines, tags, currentLineId])

  // linesが更新されたときにcurrentLineIdを設定
  useEffect(() => {
    console.log('[ChatPage] Lines effect triggered:', {
      linesCount: Object.keys(lines).length,
      isEmpty: Object.keys(lines).length === 0
    })

    if (Object.keys(lines).length === 0) {
      console.log('[ChatPage] Lines is empty, skipping currentLineId setup')
      return
    }

    console.log('[ChatPage] Setting up currentLineId with decodedLineName:', decodedLineName)

    // 指定されたライン名でラインを検索
    const targetLine = Object.values(lines).find(
      line => line.name === decodedLineName || line.id === decodedLineName
    )

    if (targetLine) {
      console.log('[ChatPage] Target line found:', targetLine.id)
      setCurrentLineId(targetLine.id)
      setLineNotFound(false)
    } else {
      // ラインが見つからない場合、メインラインにフォールバック
      const mainLine = lines[MAIN_LINE_ID] || Object.values(lines)[0]
      if (mainLine) {
        console.log('[ChatPage] Using fallback line:', mainLine.id)
        setCurrentLineId(mainLine.id)
      }
      setLineNotFound(true)
    }
  }, [lines, decodedLineName])

  // ライン切り替えハンドラー（URL更新、履歴あり）
  const handleLineChange = useCallback((lineId: string) => {
    const targetLine = lines[lineId]
    if (targetLine) {
      setCurrentLineId(lineId)
      // URLクエリパラメータを更新
      const encodedLineName = encodeURIComponent(targetLine.name)
      router.push(`/chat?line=${encodedLineName}`)
    } else {
      // ライン切り替えに失敗した場合の処理は不要
    }
  }, [lines, router])


  // ビューが変更されたときのハンドラー
  const handleViewChange = (newView: 'chat' | 'management' | 'branches') => {
    setCurrentView(newView)

    // ビューに応じてルーティング
    if (newView === 'branches') {
      router.push(ROUTE_BRANCHES)
    } else if (newView === 'management') {
      router.push(ROUTE_MANAGEMENT)
    }
    // chatの場合は現在のページに留まる
  }

  // データが読み込まれるまで待つ
  const isDataReady = Object.keys(lines).length > 0
  console.log('[ChatPage] Render check:', {
    isDataReady,
    linesCount: Object.keys(lines).length,
    messagesCount: Object.keys(messages).length,
    currentLineId
  })

  if (!isDataReady) {
    console.log('[ChatPage] Showing loading screen')
    return (
      <ChatLayout>
        <div className="min-h-screen bg-white flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-600">{LOADING_CHAT_DATA}</p>
          </div>
        </div>
      </ChatLayout>
    )
  }

  console.log('[ChatPage] Rendering ChatContainer with data')

  return (
    <TagProvider>
      <ChatLayout
        footer={
          <FooterNavigation
            currentView={currentView}
            onViewChange={handleViewChange}
          />
        }
      >
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

        <ChatContainer
          messages={messages}
          lines={lines}
          tags={tags}
          currentLineId={currentLineId}
          onLineChange={handleLineChange}
          chatRepository={chatRepository}
        />
      </ChatLayout>
    </TagProvider>
  )
}

export default function ChatPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ChatPageContent />
    </Suspense>
  )
}

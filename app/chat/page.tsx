"use client"

import { useState, useEffect, useCallback, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { ChatContainer } from "@/components/chat"
import { FooterNavigation } from "@/components/footer-navigation"
import { TagProvider } from "@/lib/tag-context"
import { ChatLayout } from "@/components/layouts/ChatLayout"
import { useChatData } from "@/hooks/use-chat-data"
import { MAIN_LINE_ID } from "@/lib/constants"
import { LOADING_CHAT_DATA, LOADING_GENERIC } from "@/lib/ui-strings"
import { ROUTE_BRANCHES, ROUTE_MANAGEMENT } from "@/lib/routes"

function ChatPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const lineName = searchParams.get('line') || MAIN_LINE_ID
  const decodedLineName = decodeURIComponent(lineName)

  const [currentView, setCurrentView] = useState<'chat' | 'management' | 'branches'>('chat')
  const [currentLineId, setCurrentLineId] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [lineNotFound, setLineNotFound] = useState(false)

  const { messages, lines, branchPoints, tags, loadChatData } = useChatData({
    setIsLoading,
    onDataLoaded: (data) => {
      // 指定されたライン名でラインを検索
      const targetLine = Object.values(data.lines).find(
        line => line.name === decodedLineName || line.id === decodedLineName
      )

      if (targetLine) {
        setCurrentLineId(targetLine.id)
        setLineNotFound(false)
      } else {
        // ラインが見つからない場合、メインラインにフォールバック
        const mainLine = data.lines[MAIN_LINE_ID] || Object.values(data.lines)[0]
        if (mainLine) {
          setCurrentLineId(mainLine.id)
        }
        setLineNotFound(true)
      }
    }
  })

  // 初期データローディング
  useEffect(() => {
    loadChatData()
  }, [loadChatData])

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

  // 新しいライン作成時専用のハンドラー（ライン名が既に分かっている）
  const handleNewLineCreated = useCallback((lineId: string, lineName: string) => {
    setCurrentLineId(lineId)
    // URLクエリパラメータを更新
    const encodedLineName = encodeURIComponent(lineName)
    router.push(`/chat?line=${encodedLineName}`)
  }, [router])

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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">{LOADING_CHAT_DATA}</p>
        </div>
      </div>
    )
  }

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
          initialMessages={messages}
          initialLines={lines}
          initialBranchPoints={branchPoints}
          initialTags={tags}
          initialCurrentLineId={currentLineId}
          onLineChange={handleLineChange}
          onNewLineCreated={handleNewLineCreated}
        />
      </ChatLayout>
    </TagProvider>
  )
}

export default function ChatPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">{LOADING_GENERIC}</p>
        </div>
      </div>
    }>
      <ChatPageContent />
    </Suspense>
  )
}
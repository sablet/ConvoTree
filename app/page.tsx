"use client"

import { useState, useEffect, useCallback, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Image from "next/image"
import { ChatContainer } from "@/components/chat/ChatContainer"
import { PageLayout } from "@/components/layouts/PageLayout"
import { useChatData } from "@/hooks/use-chat-data"
import { MAIN_LINE_ID } from "@/lib/constants"
import { LoadingFallback } from "@/components/LoadingFallback"
import { useAuth } from "@/lib/auth-context"
import { useOnlineStatus } from "@/hooks/use-online-status"
import {
  AUTH_UNAUTHORIZED_TITLE,
  AUTH_UNAUTHORIZED_DESCRIPTION,
  AUTH_UNAUTHORIZED_LOGOUT,
} from "@/lib/ui-strings"

function HomeContent() {
  const searchParams = useSearchParams()
  const [currentLineId, setCurrentLineId] = useState<string>('')
  const [lineNotFound, setLineNotFound] = useState(false)
  const { user, signOut } = useAuth()
  const isOnline = useOnlineStatus()

  const { messages, lines, tags, error, loadChatData, chatRepository } = useChatData({})

  // 初期データローディング
  useEffect(() => {
    console.log('[HomePage] Calling loadChatData')
    loadChatData()
  }, [loadChatData])

  // messages, lines, tags の変更を監視
  useEffect(() => {
    console.log('[HomePage] Data state updated:', {
      messagesCount: Object.keys(messages).length,
      linesCount: Object.keys(lines).length,
      tagsCount: Object.keys(tags).length,
      currentLineId
    })
  }, [messages, lines, tags, currentLineId])

  // linesが更新されたときにcurrentLineIdを設定
  useEffect(() => {
    if (Object.keys(lines).length === 0) {
      console.log('[HomePage] Lines is empty, skipping currentLineId setup')
      return
    }

    console.log('[HomePage] Setting up currentLineId')

    // URLからライン名を取得
    const lineFromUrl = searchParams.get('line')
    const decodedLineName = lineFromUrl ? decodeURIComponent(lineFromUrl) : MAIN_LINE_ID

    // 指定されたライン名でラインを検索
    const targetLine = Object.values(lines).find(
      line => line.name === decodedLineName || line.id === decodedLineName
    )

    if (targetLine) {
      console.log('[HomePage] Target line found:', targetLine.id)
      setCurrentLineId(targetLine.id)
      setLineNotFound(false)
    } else {
      // ラインが見つからない場合、メインラインにフォールバック
      const mainLine = lines[MAIN_LINE_ID] || Object.values(lines)[0]
      if (mainLine) {
        console.log('[HomePage] Using fallback line:', mainLine.id)
        setCurrentLineId(mainLine.id)
      }
      setLineNotFound(lineFromUrl !== null)
    }
  }, [lines, searchParams])


  // ライン切り替えハンドラー（状態更新を優先し、URL更新は遅延実行）
  const handleLineChange = useCallback((lineId: string) => {
    const targetLine = lines[lineId]
    if (targetLine) {
      setCurrentLineId(lineId)
      // 状態更新が完了してからURL更新を実行（200ms遅延）
      setTimeout(() => {
        const encodedLineName = encodeURIComponent(targetLine.name)
        // History APIを直接使用してNext.jsの再レンダリングを回避
        window.history.replaceState(null, '', `/?line=${encodedLineName}`)
      }, 200)
    }
  }, [lines])

  // データが読み込まれるまで待つ
  const isDataReady = Object.keys(lines).length > 0
  console.log('[HomePage] Render check:', {
    isDataReady,
    linesCount: Object.keys(lines).length,
    messagesCount: Object.keys(messages).length,
    currentLineId
  })

  // Firestoreデータ取得エラー（オンライン時のみ権限不足エラーを表示）
  if (error && user && isOnline) {
    return (
      <PageLayout>
        <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-200 p-8 space-y-6">
            <div className="flex justify-center">
              <Image src="/icon-192.png" alt="Chat Line" width={64} height={64} className="rounded-2xl" />
            </div>
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-semibold text-slate-900">{AUTH_UNAUTHORIZED_TITLE}</h1>
              <p className="text-sm text-slate-600">{AUTH_UNAUTHORIZED_DESCRIPTION}</p>
            </div>
            <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
              <p className="font-medium">ログイン中のアカウント:</p>
              <p className="break-words">{user.email}</p>
            </div>
            <button
              onClick={() => signOut()}
              className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 transition-colors"
            >
              {AUTH_UNAUTHORIZED_LOGOUT}
            </button>
          </div>
        </div>
      </PageLayout>
    )
  }

  // データが読み込まれるまでローディング表示
  if (!isDataReady) {
    console.log('[HomePage] Showing loading screen')
    return (
      <PageLayout>
        <div className="min-h-screen bg-white flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-600">チャットデータを読み込み中...</p>
          </div>
        </div>
      </PageLayout>
    )
  }

  console.log('[HomePage] Rendering ChatContainer with data')

  return (
    <PageLayout>
      {lineNotFound && (
        <div className="bg-yellow-100 border-l-4 border-yellow-500 p-4 mb-4">
          <div className="flex">
            <div className="ml-3">
              <p className="text-sm text-yellow-700">
                指定されたラインが見つかりませんでした。メインラインを表示しています。
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
    </PageLayout>
  )
}

export default function Home() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <HomeContent />
    </Suspense>
  )
}

"use client"

import { useState, useEffect, useCallback, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Image from "next/image"
import { ChatContainer } from "@/components/chat"
import { TagProvider } from "@/lib/tag-context"
import { PageLayout } from "@/components/layouts/PageLayout"
import { useChatData } from "@/hooks/use-chat-data"
import { MAIN_LINE_ID } from "@/lib/constants"
import { LoadingFallback } from "@/components/LoadingFallback"
import { useAuth } from "@/lib/auth-context"
import {
  AUTH_UNAUTHORIZED_TITLE,
  AUTH_UNAUTHORIZED_DESCRIPTION,
  AUTH_UNAUTHORIZED_LOGOUT,
} from "@/lib/ui-strings"

function HomeContent() {
  const searchParams = useSearchParams()
  const [currentLineId, setCurrentLineId] = useState<string>('')
  const { user, signOut } = useAuth()

  const { messages, lines, branchPoints, tags, error, loadChatData } = useChatData({
    onDataLoaded: (data) => {
      // URLからライン名を取得
      const lineFromUrl = searchParams.get('line')

      if (lineFromUrl && !currentLineId) {
        // URLで指定されたライン名に一致するラインを検索
        const targetLine = Object.values(data.lines).find(line =>
          line.name === decodeURIComponent(lineFromUrl)
        )
        if (targetLine) {
          setCurrentLineId(targetLine.id)
          return
        }
      }

      // デフォルトライン設定（現在のラインIDが空の場合のみ）
      if (!currentLineId) {
        const mainLine = data.lines[MAIN_LINE_ID] || Object.values(data.lines)[0]
        if (mainLine) {
          setCurrentLineId(mainLine.id)
        }
      }
    }
  })

  // 初期データローディング（初回のみ）
  useEffect(() => {
    loadChatData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])


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

  // Firestoreデータ取得エラー（権限不足の可能性）
  if (error && user) {
    return (
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
    )
  }

  return (
    <TagProvider>
      <PageLayout>
        <ChatContainer
          initialMessages={messages}
          initialLines={lines}
          initialBranchPoints={branchPoints}
          initialTags={tags}
          initialCurrentLineId={currentLineId}
          onLineChange={handleLineChange}
        />
      </PageLayout>
    </TagProvider>
  )
}

export default function Home() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <HomeContent />
    </Suspense>
  )
}

"use client"

import { useState, useEffect, useCallback, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { ChatContainer } from "@/components/chat"
import { TagProvider } from "@/lib/tag-context"
import { PageLayout } from "@/components/layouts/PageLayout"
import { useChatData } from "@/hooks/use-chat-data"
import { MAIN_LINE_ID } from "@/lib/constants"
import { LoadingFallback } from "@/components/LoadingFallback"

function HomeContent() {
  const searchParams = useSearchParams()
  const [currentLineId, setCurrentLineId] = useState<string>('')

  const { messages, lines, branchPoints, tags, loadChatData } = useChatData({
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

  // 初期データローディング
  useEffect(() => {
    loadChatData()
  }, [loadChatData])


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

"use client"

import { useState, useEffect, useCallback } from "react"
import { BranchingChatUI } from "@/components/branching-chat-ui"
import { TagProvider } from "@/lib/tag-context"
import { useRouter } from "next/navigation"
import { PageLayout } from "@/components/layouts/PageLayout"
import { useChatData } from "@/hooks/use-chat-data"

export default function Home() {
  const router = useRouter()
  const [currentLineId, setCurrentLineId] = useState<string>('')

  const { messages, lines, branchPoints, tags, loadChatData } = useChatData({
    onDataLoaded: (data) => {
      // デフォルトライン設定
      const mainLine = data.lines.main || Object.values(data.lines)[0]
      if (mainLine) {
        setCurrentLineId(mainLine.id)
      }
    }
  })

  // 初期データローディング
  useEffect(() => {
    loadChatData()
  }, [loadChatData])


  // ライン切り替えハンドラー（URL更新、履歴なし、リロードなし）
  const handleLineChange = useCallback((lineId: string) => {
    const targetLine = lines[lineId]
    if (targetLine) {
      setCurrentLineId(lineId)
      // URLクエリパラメータを更新（リロードを防ぐためreplaceを使用）
      const encodedLineName = encodeURIComponent(targetLine.name)
      router.replace(`/?line=${encodedLineName}`)
    }
  }, [lines, router])

  // 新しいライン作成時専用のハンドラー（ライン名が既に分かっている）
  const handleNewLineCreated = useCallback((lineId: string, lineName: string) => {
    setCurrentLineId(lineId)
    // URLクエリパラメータを更新（リロードを防ぐためreplaceを使用）
    const encodedLineName = encodeURIComponent(lineName)
    router.replace(`/?line=${encodedLineName}`)
  }, [router])


  return (
    <TagProvider>
      <PageLayout>
        <BranchingChatUI
          initialMessages={messages}
          initialLines={lines}
          initialBranchPoints={branchPoints}
          initialTags={tags}
          initialCurrentLineId={currentLineId}
          onLineChange={handleLineChange}
          onNewLineCreated={handleNewLineCreated}
        />
      </PageLayout>
    </TagProvider>
  )
}

"use client"

import { useState, useEffect, useCallback } from "react"
import { BranchingChatUI } from "@/components/branching-chat-ui"
import { TagProvider } from "@/lib/tag-context"
import { PageLayout } from "@/components/layouts/PageLayout"
import { useChatData } from "@/hooks/use-chat-data"
import { MAIN_LINE_ID } from "@/lib/constants"

export default function Home() {
  const [currentLineId, setCurrentLineId] = useState<string>('')

  const { messages, lines, branchPoints, tags, loadChatData } = useChatData({
    onDataLoaded: (data) => {
      // URLからライン名を取得（クライアントサイド）
      const lineFromUrl = typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('line')
        : null

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

  // 新しいライン作成時専用のハンドラー（ライン名が既に分かっている）
  const handleNewLineCreated = useCallback((lineId: string, lineName: string) => {
    setCurrentLineId(lineId)
    // 状態更新が完了してからURL更新を実行（200ms遅延）
    setTimeout(() => {
      const encodedLineName = encodeURIComponent(lineName)
      // History APIを直接使用してNext.jsの再レンダリングを回避
      window.history.replaceState(null, '', `/?line=${encodedLineName}`)
    }, 200)
  }, [])


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

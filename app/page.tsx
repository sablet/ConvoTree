"use client"

import { useState, useEffect, useCallback } from "react"
import { BranchingChatUI } from "@/components/branching-chat-ui"
import { TagProvider } from "@/lib/tag-context"
import { dataSourceManager } from "@/lib/data-source"
import { useRouter } from "next/navigation"
import { PageLayout } from "@/components/layouts/PageLayout"
import { Message, Line, Tag, BranchPoint } from "@/lib/types"

export default function Home() {

  const router = useRouter()
  const [messages, setMessages] = useState<Record<string, Message>>({})
  const [lines, setLines] = useState<Record<string, Line>>({})
  const [branchPoints, setBranchPoints] = useState<Record<string, BranchPoint>>({})
  const [tags, setTags] = useState<Record<string, Tag>>({})
  const [currentLineId, setCurrentLineId] = useState<string>('')

  // データローディング関数
  const loadChatData = useCallback(async () => {
    try {
      const data = await dataSourceManager.loadChatData()

      const newMessages: Record<string, Message> = {}
      const newLines: Record<string, Line> = {}
      const newBranchPoints: Record<string, BranchPoint> = {}
      const newTags: Record<string, Tag> = {}

      // メッセージデータ変換
      if (data.messages) {
        Object.entries(data.messages).forEach(([id, msg]) => {
          newMessages[id] = {
            ...(msg as Message & { timestamp: string | number | Date }),
            timestamp: new Date((msg as Message & { timestamp: string | number | Date }).timestamp)
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
          newBranchPoints[id] = branchPoint as BranchPoint
        })
      }

      // タグデータ
      if (data.tags) {
        Object.entries(data.tags).forEach(([id, tag]) => {
          newTags[id] = tag as Tag
        })
      }

      setMessages(newMessages)
      setLines(newLines)
      setBranchPoints(newBranchPoints)
      setTags(newTags)

      // デフォルトライン設定
      const mainLine = newLines.main || Object.values(newLines)[0]
      if (mainLine) {
        setCurrentLineId(mainLine.id)
      }
    } catch (error) {
      console.error('Failed to load chat data:', error)
      // Firestoreエラー時は空の状態を維持（自動フォールバックしない）
      setMessages({})
      setLines({})
      setBranchPoints({})
      setTags({})
      setCurrentLineId('')
    }
  }, [])

  // 初期データローディング
  useEffect(() => {
    // 初期データローディング
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

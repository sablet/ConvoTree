import { useState, useCallback } from "react"
import { dataSourceManager } from "@/lib/data-source"
import { Message, Line, BranchPoint, Tag } from "@/lib/types"

interface ChatData {
  messages: Record<string, Message>
  lines: Record<string, Line>
  branchPoints: Record<string, BranchPoint>
  tags: Record<string, Tag>
}

interface UseChatDataOptions {
  onDataLoaded?: (data: ChatData) => void
  setIsLoading?: (loading: boolean) => void
}

export function useChatData(options: UseChatDataOptions = {}) {
  const [messages, setMessages] = useState<Record<string, Message>>({})
  const [lines, setLines] = useState<Record<string, Line>>({})
  const [branchPoints, setBranchPoints] = useState<Record<string, BranchPoint>>({})
  const [tags, setTags] = useState<Record<string, Tag>>({})
  const [error, setError] = useState<Error | null>(null)

  const loadChatData = useCallback(async () => {
    try {
      if (options.setIsLoading) {
        options.setIsLoading(true)
      }
      setError(null)

      const data = await dataSourceManager.loadChatData()

      const newMessages: Record<string, Message> = {}
      const newLines: Record<string, Line> = {}
      const newBranchPoints: Record<string, BranchPoint> = {}
      const newTags: Record<string, Tag> = {}

      // メッセージデータ変換
      if (data.messages) {
        Object.entries(data.messages).forEach(([id, msg]) => {
          const rawMessage = msg as Message & {
            timestamp: string | number | Date
            updatedAt?: string | number | Date
          }

          const { updatedAt, timestamp, ...rest } = rawMessage
          const timestampDate = new Date(timestamp)

          const normalizedMessage: Message = {
            ...(rest as Omit<Message, 'timestamp' | 'updatedAt'>),
            timestamp: Number.isNaN(timestampDate.getTime()) ? new Date() : timestampDate
          }

          if (updatedAt) {
            const updatedAtDate = new Date(updatedAt)
            if (!Number.isNaN(updatedAtDate.getTime())) {
              normalizedMessage.updatedAt = updatedAtDate
            }
          }

          newMessages[id] = normalizedMessage
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

      const chatData = { messages: newMessages, lines: newLines, branchPoints: newBranchPoints, tags: newTags }

      if (options.onDataLoaded) {
        options.onDataLoaded(chatData)
      }

      if (options.setIsLoading) {
        options.setIsLoading(false)
      }
    } catch (error) {
      console.error('Failed to load chat data:', error)
      // Firestoreエラー時は空の状態を維持（自動フォールバックしない）
      setMessages({})
      setLines({})
      setBranchPoints({})
      setTags({})
      setError(error instanceof Error ? error : new Error('データの読み込みに失敗しました'))

      if (options.setIsLoading) {
        options.setIsLoading(false)
      }
    }
  }, [options])

  return {
    messages,
    lines,
    branchPoints,
    tags,
    error,
    loadChatData
  }
}

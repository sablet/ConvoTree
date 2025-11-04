import { useState, useCallback } from "react"
import { dataSourceManager } from "@/lib/data-source"
import { useChatRepository } from "@/lib/chat-repository-context"
import type { ChatData as SourceChatData } from "@/lib/data-source/base"
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

const transformChatData = (data: SourceChatData): ChatData => {
  const newMessages: Record<string, Message> = {}
  const newLines: Record<string, Line> = {}
  const newBranchPoints: Record<string, BranchPoint> = {}
  const newTags: Record<string, Tag> = {}

  if (data.messages) {
    Object.entries(data.messages).forEach(([id, msg]) => {
      const rawMessage = msg as Message & {
        timestamp: string | number | Date
        updatedAt?: string | number | Date
        deletedAt?: string | number | Date
      }
      const { updatedAt, timestamp, deletedAt, ...rest } = rawMessage
      const timestampDate = new Date(timestamp)
      const normalizedMessage: Message = {
        ...(rest as Omit<Message, 'timestamp' | 'updatedAt' | 'deletedAt'>),
        timestamp: Number.isNaN(timestampDate.getTime()) ? new Date() : timestampDate
      }
      if (updatedAt) {
        const updatedAtDate = new Date(updatedAt)
        if (!Number.isNaN(updatedAtDate.getTime())) {
          normalizedMessage.updatedAt = updatedAtDate
        }
      }
      if (deletedAt) {
        const deletedAtDate = new Date(deletedAt)
        if (!Number.isNaN(deletedAtDate.getTime())) {
          normalizedMessage.deletedAt = deletedAtDate
        }
      }

      // deleted=true のメッセージは除外
      if (!normalizedMessage.deleted) {
        newMessages[id] = normalizedMessage
      }
    })
  }

  if (data.lines && Array.isArray(data.lines)) {
    data.lines.forEach((line: Line) => {
      newLines[line.id] = line
    })
  }

  if (data.branchPoints) {
    Object.entries(data.branchPoints).forEach(([id, branchPoint]) => {
      newBranchPoints[id] = branchPoint as BranchPoint
    })
  }

  if (data.tags) {
    Object.entries(data.tags).forEach(([id, tag]) => {
      newTags[id] = tag as Tag
    })
  }

  return { messages: newMessages, lines: newLines, branchPoints: newBranchPoints, tags: newTags }
}

interface DataSetters {
  setMessages: (messages: Record<string, Message>) => void
  setLines: (lines: Record<string, Line>) => void
  setBranchPoints: (branchPoints: Record<string, BranchPoint>) => void
  setTags: (tags: Record<string, Tag>) => void
}

const applyLoadedData = (
  chatData: ChatData,
  setters: DataSetters,
  onDataLoaded?: (data: ChatData) => void
) => {
  setters.setMessages(chatData.messages)
  setters.setLines(chatData.lines)
  setters.setBranchPoints(chatData.branchPoints)
  setters.setTags(chatData.tags)

  if (onDataLoaded) {
    onDataLoaded(chatData)
  }
}

const clearAllData = (setters: DataSetters) => {
  setters.setMessages({})
  setters.setLines({})
  setters.setBranchPoints({})
  setters.setTags({})
}

export function useChatData(options: UseChatDataOptions = {}) {
  const chatRepository = useChatRepository();
  const [messages, setMessages] = useState<Record<string, Message>>({})
  const [lines, setLines] = useState<Record<string, Line>>({})
  const [branchPoints, setBranchPoints] = useState<Record<string, BranchPoint>>({})
  const [tags, setTags] = useState<Record<string, Tag>>({})
  const [error, setError] = useState<Error | null>(null)

  const loadChatData = useCallback(async (clearCache = false) => {
    const setters: DataSetters = { setMessages, setLines, setBranchPoints, setTags }

    try {
      if (options.setIsLoading) {
        options.setIsLoading(true)
      }
      setError(null)

      // キャッシュクリアが要求された場合
      if (clearCache) {
        chatRepository.clearAllCache()
      }

      const result = await chatRepository.loadChatData({
        source: dataSourceManager.getCurrentSource()
      })

      if (result.fallbackUsed) {
        console.warn(`[useChatData] データ読み込みでフォールバックが使用されました: ${result.source}`, result.error);
      }

      const chatData = transformChatData(result.data)
      applyLoadedData(chatData, setters, options.onDataLoaded)

      if (options.setIsLoading) {
        options.setIsLoading(false)
      }
    } catch (error) {
      console.error('[useChatData] Failed to load chat data:', error)
      clearAllData(setters)
      setError(error instanceof Error ? error : new Error('データの読み込みに失敗しました'))

      if (options.setIsLoading) {
        options.setIsLoading(false)
      }
    }
  }, [chatRepository, options])

  return {
    messages,
    lines,
    branchPoints,
    tags,
    error,
    loadChatData,
    chatRepository
  }
}

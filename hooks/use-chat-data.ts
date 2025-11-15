import { useState, useCallback, useRef, Dispatch, SetStateAction } from "react"
import { dataSourceManager } from "@/lib/data-source"
import { useChatRepository } from "@/lib/chat-repository-context"
import type { ChatData as SourceChatData } from "@/lib/data-source/base"
import { Message, Line, Tag } from "@/lib/types"

interface ChatData {
  messages: Record<string, Message>
  lines: Record<string, Line>
  tags: Record<string, Tag>
}

interface UseChatDataOptions {
  onDataLoaded?: (data: ChatData) => void
  setIsLoading?: (loading: boolean) => void
}

const transformChatData = (data: SourceChatData): ChatData => {
  const newMessages: Record<string, Message> = {}
  const newLines: Record<string, Line> = {}
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

  if (data.tags) {
    Object.entries(data.tags).forEach(([id, tag]) => {
      newTags[id] = tag as Tag
    })
  }

  return { messages: newMessages, lines: newLines, tags: newTags }
}

interface DataSetters {
  setMessages: Dispatch<SetStateAction<Record<string, Message>>>
  setLines: Dispatch<SetStateAction<Record<string, Line>>>
  setTags: Dispatch<SetStateAction<Record<string, Tag>>>
}

const applyLoadedData = (
  chatData: ChatData,
  setters: DataSetters,
  onDataLoaded?: (data: ChatData) => void
) => {
  setters.setMessages((prev: Record<string, Message>) => ({ ...prev, ...chatData.messages }))
  setters.setLines((prev: Record<string, Line>) => ({ ...prev, ...chatData.lines }))
  setters.setTags((prev: Record<string, Tag>) => ({ ...prev, ...chatData.tags }))

  if (onDataLoaded) {
    onDataLoaded(chatData)
  }
}

const clearAllData = (setters: DataSetters) => {
  setters.setMessages({})
  setters.setLines({})
  setters.setTags({})
}

export function useChatData(options: UseChatDataOptions = {}) {
  const chatRepository = useChatRepository();
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [messages, setMessages] = useState<Record<string, Message>>({})
  const [lines, setLines] = useState<Record<string, Line>>({})
  const [tags, setTags] = useState<Record<string, Tag>>({})
  const [error, setError] = useState<Error | null>(null)

  const loadChatData = useCallback(async (clearCache = false) => {
    const setters: DataSetters = { setMessages, setLines, setTags }
    const opts = optionsRef.current;

    try {
      if (opts.setIsLoading) {
        opts.setIsLoading(true)
      }
      setError(null)

      // キャッシュクリアが要求された場合
      if (clearCache) {
        await chatRepository.clearAllCache()
      }

      const result = await chatRepository.loadChatData({
        source: dataSourceManager.getCurrentSource(),
        // バックグラウンド更新時のコールバック
        onRevalidate: (data) => {
          console.log('[useChatData] Background revalidation completed, updating UI');
          const chatData = transformChatData(data);
          applyLoadedData(chatData, setters, opts.onDataLoaded);
        }
      })

      if (result.fallbackUsed) {
        console.warn(`[useChatData] データ読み込みでフォールバックが使用されました: ${result.source}`, result.error);
      }

      if (result.fromCache && result.revalidating) {
        console.log('[useChatData] Loaded from cache, revalidating in background');
      }

      const chatData = transformChatData(result.data)
      applyLoadedData(chatData, setters, opts.onDataLoaded)

      if (opts.setIsLoading) {
        opts.setIsLoading(false)
      }
    } catch (error) {
      console.error('[useChatData] Failed to load chat data:', error)
      clearAllData(setters)
      setError(error instanceof Error ? error : new Error('データの読み込みに失敗しました'))

      if (opts.setIsLoading) {
        opts.setIsLoading(false)
      }
    }
  }, [chatRepository])

  return {
    messages,
    lines,
    tags,
    error,
    loadChatData,
    chatRepository
  }
}

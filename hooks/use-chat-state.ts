import { useState, useEffect } from 'react'
import type { Message, Line, BranchPoint, Tag } from '@/lib/types'
import type { MessageType } from '@/lib/constants'

/**
 * ChatState hook props
 */
interface ChatStateProps {
  initialMessages?: Record<string, Message>
  initialLines?: Record<string, Line>
  initialBranchPoints?: Record<string, BranchPoint>
  initialTags?: Record<string, Tag>
  initialCurrentLineId?: string
}

/**
 * Path cache entry structure
 */
interface PathCacheEntry {
  messages: Message[]
  transitions: Array<{ index: number; lineId: string; lineName: string }>
}

/**
 * ChatState interface - manages all chat-related state
 */
export interface ChatState {
  // データ状態
  messages: Record<string, Message>
  setMessages: React.Dispatch<React.SetStateAction<Record<string, Message>>>
  lines: Record<string, Line>
  setLines: React.Dispatch<React.SetStateAction<Record<string, Line>>>
  branchPoints: Record<string, BranchPoint>
  setBranchPoints: React.Dispatch<React.SetStateAction<Record<string, BranchPoint>>>
  tags: Record<string, Tag>
  setTags: React.Dispatch<React.SetStateAction<Record<string, Tag>>>
  currentLineId: string
  setCurrentLineId: React.Dispatch<React.SetStateAction<string>>

  // キャッシュ
  pathCache: Map<string, PathCacheEntry>
  setPathCache: React.Dispatch<React.SetStateAction<Map<string, PathCacheEntry>>>
  lineAncestryCache: Map<string, string[]>
  setLineAncestryCache: React.Dispatch<React.SetStateAction<Map<string, string[]>>>

  // フィルター・検索
  filterMessageType: MessageType | 'all'
  setFilterMessageType: React.Dispatch<React.SetStateAction<MessageType | 'all'>>
  filterTaskCompleted: 'all' | 'completed' | 'incomplete'
  setFilterTaskCompleted: React.Dispatch<React.SetStateAction<'all' | 'completed' | 'incomplete'>>
  filterDateStart: string
  setFilterDateStart: React.Dispatch<React.SetStateAction<string>>
  filterDateEnd: string
  setFilterDateEnd: React.Dispatch<React.SetStateAction<string>>
  filterTag: string
  setFilterTag: React.Dispatch<React.SetStateAction<string>>
  searchKeyword: string
  setSearchKeyword: React.Dispatch<React.SetStateAction<string>>

  // ユーティリティ
  clearAllCaches: () => void
}

/**
 * Chat state management hook
 *
 * Manages core chat state including:
 * - Messages, lines, branch points, tags
 * - Performance caches (path, line ancestry)
 * - Filters and search
 *
 * @param props - Initial state values
 * @returns ChatState object
 */
export function useChatState({
  initialMessages = {},
  initialLines = {},
  initialBranchPoints = {},
  initialTags = {},
  initialCurrentLineId = ''
}: ChatStateProps = {}): ChatState {
  // データ状態
  const [messages, setMessages] = useState<Record<string, Message>>(initialMessages)
  const [lines, setLines] = useState<Record<string, Line>>(initialLines)
  const [branchPoints, setBranchPoints] = useState<Record<string, BranchPoint>>(initialBranchPoints)
  const [tags, setTags] = useState<Record<string, Tag>>(initialTags)
  const [currentLineId, setCurrentLineId] = useState<string>(initialCurrentLineId)

  // キャッシュ
  const [pathCache, setPathCache] = useState<Map<string, PathCacheEntry>>(new Map())
  const [lineAncestryCache, setLineAncestryCache] = useState<Map<string, string[]>>(new Map())

  // フィルター・検索
  const [filterMessageType, setFilterMessageType] = useState<MessageType | 'all'>('all')
  const [filterTaskCompleted, setFilterTaskCompleted] = useState<'all' | 'completed' | 'incomplete'>('all')
  const [filterDateStart, setFilterDateStart] = useState<string>('')
  const [filterDateEnd, setFilterDateEnd] = useState<string>('')
  const [filterTag, setFilterTag] = useState<string>('')
  const [searchKeyword, setSearchKeyword] = useState<string>('')

  // 初期データ監視 - propsが変更されたら常に更新
  useEffect(() => {
    setMessages(initialMessages)
  }, [initialMessages])

  useEffect(() => {
    setLines(initialLines)
  }, [initialLines])

  useEffect(() => {
    setBranchPoints(initialBranchPoints)
  }, [initialBranchPoints])

  useEffect(() => {
    setTags(initialTags)
  }, [initialTags])

  useEffect(() => {
    if (initialCurrentLineId) {
      setCurrentLineId(initialCurrentLineId)
    }
  }, [initialCurrentLineId])

  /**
   * Clear all performance caches
   * Should be called when data structure changes
   */
  const clearAllCaches = () => {
    setPathCache(new Map())
    setLineAncestryCache(new Map())
  }

  return {
    messages,
    setMessages,
    lines,
    setLines,
    branchPoints,
    setBranchPoints,
    tags,
    setTags,
    currentLineId,
    setCurrentLineId,
    pathCache,
    setPathCache,
    lineAncestryCache,
    setLineAncestryCache,
    filterMessageType,
    setFilterMessageType,
    filterTaskCompleted,
    setFilterTaskCompleted,
    filterDateStart,
    setFilterDateStart,
    filterDateEnd,
    setFilterDateEnd,
    filterTag,
    setFilterTag,
    searchKeyword,
    setSearchKeyword,
    clearAllCaches
  }
}

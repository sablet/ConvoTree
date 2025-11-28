import type { Line, Message } from '@/lib/types'
import { getLineMessages } from '@/lib/data-helpers'

export interface PaginationInfo {
  /** 現在のページ番号（1始まり） */
  currentPage: number
  /** 総ページ数 */
  totalPages: number
  /** フィルタリング後の総メッセージ数 */
  totalFilteredMessages: number
  /** 1ページあたりの表示件数 */
  pageSize: number
  /** 古いメッセージがあるかどうか */
  hasOlderMessages: boolean
}

export interface LineAncestryResult {
  messages: Message[]
  transitions: Array<{ index: number; lineId: string; lineName: string }>
  pagination?: PaginationInfo
}

/**
 * Get line ancestry chain
 */
export function calculateLineAncestry(
  lineId: string,
  lines: Record<string, Line>,
  messages: Record<string, Message>,
  cache: Map<string, string[]>,
  visited: Set<string> = new Set()
): string[] {
  if (cache.has(lineId)) {
    const cached = cache.get(lineId)
    if (cached) return cached
  }

  const line = lines[lineId]
  if (!line) return []

  // 循環参照チェック: 既に訪問したラインの場合は空配列を返す
  if (visited.has(lineId)) {
    console.error(`🔴 Circular reference detected in line ancestry: ${lineId}`)
    return []
  }

  let ancestry: string[] = []

  if (line.parent_line_id) {
    const parentLineId = line.parent_line_id
    // 訪問済みセットに現在のラインIDを追加
    const newVisited = new Set(visited)
    newVisited.add(lineId)
    const parentAncestry = calculateLineAncestry(parentLineId, lines, messages, cache, newVisited)
    ancestry = [...parentAncestry, parentLineId]
  }

  return ancestry
}

/**
 * Get messages for a single line only (no ancestry)
 */
export function calculateOptimizedPath(
  lineId: string,
  lines: Record<string, Line>,
  messages: Record<string, Message>,
  _ancestryCache: Map<string, string[]>
): LineAncestryResult {
  const line = lines[lineId]
  if (!line) {
    return { messages: [], transitions: [] }
  }

  const lineMessages = getLineMessages(messages, lineId)

  // ライン遷移インジケーターを最初のメッセージに設定
  const transitions = lineMessages.length > 0
    ? [{ index: 0, lineId: line.id, lineName: line.name }]
    : []

  return { messages: lineMessages, transitions }
}

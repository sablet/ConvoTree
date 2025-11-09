import type { Line, Message } from '@/lib/types'
import { getLineMessages } from '@/lib/data-helpers'

export interface LineAncestryResult {
  messages: Message[]
  transitions: Array<{ index: number; lineId: string; lineName: string }>
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
 * Get optimized path for a line
 */
export function calculateOptimizedPath(
  lineId: string,
  lines: Record<string, Line>,
  messages: Record<string, Message>,
  ancestryCache: Map<string, string[]>
): LineAncestryResult {
  const ancestry = calculateLineAncestry(lineId, lines, messages, ancestryCache)
  const fullLineChain = [...ancestry, lineId]

  const allMessages: Message[] = []
  const transitions: Array<{ index: number, lineId: string, lineName: string }> = []

  for (let i = 0; i < fullLineChain.length; i++) {
    const currentLineInChain = lines[fullLineChain[i]]
    if (!currentLineInChain) continue

    if (i > 0) {
      transitions.push({
        index: allMessages.length,
        lineId: currentLineInChain.id,
        lineName: currentLineInChain.name
      })
    }

    // Simply get all messages for this line - no need for branch point logic anymore
    const lineMessages = getLineMessages(messages, currentLineInChain.id)
    allMessages.push(...lineMessages)
  }

  return { messages: allMessages, transitions }
}

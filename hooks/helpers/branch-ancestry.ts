import type { Line, Message } from '@/lib/types'

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
  cache: Map<string, string[]>
): string[] {
  if (cache.has(lineId)) {
    const cached = cache.get(lineId)
    if (cached) return cached
  }

  const line = lines[lineId]
  if (!line) return []

  let ancestry: string[] = []

  if (line.branchFromMessageId) {
    const branchFromMessage = messages[line.branchFromMessageId]
    if (branchFromMessage) {
      const parentLineId = branchFromMessage.lineId
      const parentAncestry = calculateLineAncestry(parentLineId, lines, messages, cache)
      ancestry = [...parentAncestry, parentLineId]
    }
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

    if (i < fullLineChain.length - 1) {
      const nextLine = lines[fullLineChain[i + 1]]
      if (nextLine?.branchFromMessageId) {
        const branchPointIndex = currentLineInChain.messageIds.indexOf(nextLine.branchFromMessageId)
        if (branchPointIndex >= 0) {
          const segmentMessages = currentLineInChain.messageIds
            .slice(0, branchPointIndex + 1)
            .map(msgId => messages[msgId])
            .filter(Boolean)
          allMessages.push(...segmentMessages)
        }
      }
    } else {
      const lineMessages = currentLineInChain.messageIds
        .map(msgId => messages[msgId])
        .filter(Boolean)
      allMessages.push(...lineMessages)
    }
  }

  return { messages: allMessages, transitions }
}

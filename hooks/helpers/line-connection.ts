import { dataSourceManager } from '@/lib/data-source'
import type { Line } from '@/lib/types'

/**
 * Connect source line to target line
 * This changes the source line's parent to the target line
 *
 * @param sourceLineId - Line to be moved
 * @param targetLineId - New parent line
 * @param lines - Current lines state (to find target's last message)
 *
 * Example:
 *   Before: A → B → C → D
 *   After calling connectLineToLine(D.id, A.id):
 *     A → B → C
 *     A → D  (D becomes sibling of B)
 */
export async function connectLineToLine(
  sourceLineId: string,
  targetLineId: string,
  lines: Line[]
): Promise<void> {
  if (sourceLineId === targetLineId) {
    throw new Error('ラインを自分自身に接続することはできません')
  }

  // Find target line
  const targetLine = lines.find(line => line.id === targetLineId)
  if (!targetLine) {
    throw new Error(`ターゲットライン ${targetLineId} が見つかりません`)
  }

  // Find source line
  const sourceLine = lines.find(line => line.id === sourceLineId)
  if (!sourceLine) {
    throw new Error(`ソースライン ${sourceLineId} が見つかりません`)
  }

  // Get target line's last message
  const targetLastMessageId = targetLine.endMessageId ||
    (targetLine.messageIds.length > 0 ? targetLine.messageIds[targetLine.messageIds.length - 1] : null)

  if (!targetLastMessageId) {
    throw new Error(`ターゲットライン ${targetLineId} にメッセージがありません`)
  }

  // Check if this would create a circular reference
  // (e.g., trying to connect A to D when D is a descendant of A)
  if (isDescendant(targetLineId, sourceLineId, lines)) {
    throw new Error('循環参照が発生するため、この接続はできません')
  }

  // Update source line's branchFromMessageId
  await dataSourceManager.updateLine(sourceLineId, {
    branchFromMessageId: targetLastMessageId
  })

  console.log(`✅ ライン "${sourceLine.name}" をライン "${targetLine.name}" の下に接続しました`)
}

/**
 * Check if targetLineId is a descendant of sourceLineId
 * to prevent circular references
 */
function isDescendant(targetLineId: string, sourceLineId: string, lines: Line[]): boolean {
  const targetLine = lines.find(line => line.id === targetLineId)
  if (!targetLine || !targetLine.branchFromMessageId) {
    return false
  }

  // Find parent line of target
  const parentLine = lines.find(line =>
    line.messageIds.includes(targetLine.branchFromMessageId || '')
  )

  if (!parentLine) {
    return false
  }

  if (parentLine.id === sourceLineId) {
    return true
  }

  // Recursively check ancestors
  return isDescendant(parentLine.id, sourceLineId, lines)
}

/**
 * Get line info for connection dialog
 */
export function getLineConnectionInfo(
  sourceLineId: string,
  targetLineId: string,
  lines: Line[]
): {
  sourceLine: Line | null
  targetLine: Line | null
  currentParentLine: Line | null
  willCreateCircular: boolean
} {
  const sourceLine = lines.find(line => line.id === sourceLineId) || null
  const targetLine = lines.find(line => line.id === targetLineId) || null

  let currentParentLine: Line | null = null
  if (sourceLine?.branchFromMessageId) {
    currentParentLine = lines.find(line =>
      line.messageIds.includes(sourceLine.branchFromMessageId || '')
    ) || null
  }

  const willCreateCircular = isDescendant(targetLineId, sourceLineId, lines)

  return {
    sourceLine,
    targetLine,
    currentParentLine,
    willCreateCircular
  }
}

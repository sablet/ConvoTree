import { dataSourceManager } from '@/lib/data-source'
import type { Line } from '@/lib/types'

/**
 * Connect source line to target line
 * This changes the source line's parent to the target line
 *
 * @param sourceLineId - Line to be moved
 * @param targetLineId - New parent line
 * @param lines - Current lines state
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

  // Check if this would create a circular reference
  // (e.g., trying to connect A to D when D is a descendant of A)
  if (isDescendant(targetLineId, sourceLineId, lines)) {
    throw new Error('循環参照が発生するため、この接続はできません')
  }

  // Update source line's parent_line_id
  await dataSourceManager.updateLine(sourceLineId, {
    parent_line_id: targetLineId
  })

  console.log(`✅ ライン "${sourceLine.name}" をライン "${targetLine.name}" の下に接続しました`)
}

/**
 * Check if targetLineId is a descendant of sourceLineId
 * to prevent circular references
 */
function isDescendant(targetLineId: string, sourceLineId: string, lines: Line[]): boolean {
  const targetLine = lines.find(line => line.id === targetLineId)
  if (!targetLine || !targetLine.parent_line_id) {
    return false
  }

  // Check if parent is the source line
  if (targetLine.parent_line_id === sourceLineId) {
    return true
  }

  // Recursively check ancestors
  return isDescendant(targetLine.parent_line_id, sourceLineId, lines)
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
  if (sourceLine?.parent_line_id) {
    currentParentLine = lines.find(line => line.id === sourceLine.parent_line_id) || null
  }

  const willCreateCircular = isDescendant(targetLineId, sourceLineId, lines)

  return {
    sourceLine,
    targetLine,
    currentParentLine,
    willCreateCircular
  }
}

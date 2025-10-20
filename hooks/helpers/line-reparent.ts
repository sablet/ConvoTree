import type { Line } from '@/lib/types'
import { dataSourceManager } from '@/lib/data-source/factory'

/**
 * Check if moving sourceLineId under targetLineId would create a circular reference
 */
export function wouldCreateCircularReference(
  sourceLineId: string,
  targetLineId: string,
  lines: Record<string, Line>,
  messages: Record<string, import('@/lib/types').Message>
): boolean {
  // Cannot be parent to self
  if (sourceLineId === targetLineId) {
    return true
  }

  // Build parent chain for target line
  const visited = new Set<string>()
  let currentId = targetLineId

  while (currentId) {
    if (visited.has(currentId)) {
      // Circular reference already exists in the tree
      return true
    }
    visited.add(currentId)

    // If we reach the source line, moving would create a cycle
    if (currentId === sourceLineId) {
      return true
    }

    const line = lines[currentId]
    if (!line || !line.branchFromMessageId) {
      break
    }

    // Find parent line
    const parentMessage = messages[line.branchFromMessageId]
    if (!parentMessage) {
      break
    }

    currentId = parentMessage.lineId
  }

  return false
}

/**
 * Reparent a line to a new parent line
 */
export async function reparentLine(
  sourceLineId: string,
  targetLineId: string,
  lines: Record<string, Line>,
  messages: Record<string, import('@/lib/types').Message>
): Promise<void> {
  const sourceLine = lines[sourceLineId]
  const targetLine = lines[targetLineId]

  if (!sourceLine) {
    throw new Error(`Source line not found: ${sourceLineId}`)
  }

  if (!targetLine) {
    throw new Error(`Target line not found: ${targetLineId}`)
  }

  // Check for circular reference
  if (wouldCreateCircularReference(sourceLineId, targetLineId, lines, messages)) {
    throw new Error('Cannot move line: would create circular reference')
  }

  // Target line must have at least one message to branch from
  if (!targetLine.messageIds || targetLine.messageIds.length === 0) {
    throw new Error('Target line has no messages to branch from')
  }

  // Get the first message of the target line to branch from
  const newBranchFromMessageId = targetLine.messageIds[0]

  // Update the source line with new parent reference
  const updatedLine: Partial<Line> = {
    branchFromMessageId: newBranchFromMessageId,
    updated_at: new Date().toISOString()
  }

  // Update in data source
  const dataSource = dataSourceManager.getDataSource()
  await dataSource.updateLine(sourceLineId, updatedLine)
}

/**
 * Update local state after reparenting
 */
export function updateLocalStateAfterReparent(
  sourceLineId: string,
  targetLineId: string,
  lines: Record<string, Line>,
  setLines: React.Dispatch<React.SetStateAction<Record<string, Line>>>
): void {
  const targetLine = lines[targetLineId]
  if (!targetLine || !targetLine.messageIds || targetLine.messageIds.length === 0) {
    return
  }

  const newBranchFromMessageId = targetLine.messageIds[0]

  setLines(prev => ({
    ...prev,
    [sourceLineId]: {
      ...prev[sourceLineId],
      branchFromMessageId: newBranchFromMessageId,
      updated_at: new Date().toISOString()
    }
  }))
}


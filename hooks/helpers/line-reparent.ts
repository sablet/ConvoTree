import type { Line } from '@/lib/types'
import { dataSourceManager } from '@/lib/data-source/factory'

/**
 * Check if moving sourceLineId under targetLineId would create a circular reference
 */
export function wouldCreateCircularReference(
  sourceLineId: string,
  targetLineId: string,
  lines: Record<string, Line>
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
    if (!line || !line.parent_line_id) {
      break
    }

    currentId = line.parent_line_id
  }

  return false
}

/**
 * Reparent a line to a new parent line
 */
export async function reparentLine(
  sourceLineId: string,
  targetLineId: string,
  lines: Record<string, Line>
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
  if (wouldCreateCircularReference(sourceLineId, targetLineId, lines)) {
    throw new Error('Cannot move line: would create circular reference')
  }

  // Update the source line with new parent reference
  const updatedLine: Partial<Line> = {
    parent_line_id: targetLineId,
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
  setLines(prev => ({
    ...prev,
    [sourceLineId]: {
      ...prev[sourceLineId],
      parent_line_id: targetLineId,
      updated_at: new Date().toISOString()
    }
  }))
}


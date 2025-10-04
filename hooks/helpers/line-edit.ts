import { dataSourceManager } from '@/lib/data-source'
import type { Line, Tag } from '@/lib/types'

export interface LineEditData {
  name: string
  tagIds: string[]
  newTag: string
}

/**
 * Save line edit
 */
export async function saveLineEdit(
  currentLineId: string,
  editingData: LineEditData
): Promise<void> {
  const currentTimestamp = new Date()
  const updatedLineData = {
    name: editingData.name,
    tagIds: editingData.tagIds,
    updated_at: currentTimestamp.toISOString()
  }

  await dataSourceManager.updateLine(currentLineId, updatedLineData)
}

/**
 * Update local line state
 */
export function updateLocalLineState(
  currentLineId: string,
  editingData: LineEditData,
  setLines: (updater: (prev: Record<string, Line>) => Record<string, Line>) => void
): void {
  const currentTimestamp = new Date()
  const updatedLineData = {
    name: editingData.name,
    tagIds: editingData.tagIds,
    updated_at: currentTimestamp.toISOString()
  }

  setLines((prev) => {
    const updated = { ...prev }
    if (updated[currentLineId]) {
      updated[currentLineId] = {
        ...updated[currentLineId],
        ...updatedLineData
      }
    }
    return updated
  })
}

/**
 * Create and add new tag
 */
export function createNewTag(
  tagName: string,
  setTags: (updater: (prev: Record<string, Tag>) => Record<string, Tag>) => void
): string {
  const newTagId = `tag_${Date.now()}`
  const newTag: Tag = {
    id: newTagId,
    name: tagName.trim()
  }

  setTags(prev => ({
    ...prev,
    [newTagId]: newTag
  }))

  return newTagId
}

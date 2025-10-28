export interface TaskMessageData {
  priority: 'low' | 'medium' | 'high' | 'urgent'
  completed: boolean
  tags?: string[]
  completedAt?: string
  createdAt?: string
  checkedInAt?: string | null
  checkedOutAt?: string | null
  timeSpent?: number
  [key: string]: unknown
}

export function sanitizeTaskMetadata(metadata: Partial<TaskMessageData>): Record<string, unknown> {
  const cleaned: Partial<TaskMessageData> = { ...metadata }

  if (cleaned.completedAt === undefined) {
    delete cleaned.completedAt
  }
  if (cleaned.createdAt === undefined) {
    delete cleaned.createdAt
  }
  if (cleaned.checkedInAt === undefined) {
    delete cleaned.checkedInAt
  }
  if (cleaned.checkedOutAt === undefined) {
    delete cleaned.checkedOutAt
  }
  if (cleaned.tags === undefined) {
    delete cleaned.tags
  }
  if (cleaned.timeSpent === undefined) {
    delete cleaned.timeSpent
  }

  return cleaned as Record<string, unknown>
}

export interface TaskRow {
  id: string
  content: string
  completed: boolean
  priority: 'low' | 'medium' | 'high' | 'urgent'
  lineName: string
  createdAt: Date
  updatedAt?: Date
  completedAt?: Date
}

export type SortKey = 'content' | 'completed' | 'priority' | 'lineName' | 'createdAt' | 'updatedAt' | 'completedAt'

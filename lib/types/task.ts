export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'

export interface TaskRow {
  id: string
  content: string
  completed: boolean
  priority: TaskPriority
  lineName: string
  createdAt: Date
  updatedAt?: Date
  completedAt?: Date
}

export type SortKey = 'content' | 'completed' | 'priority' | 'lineName' | 'createdAt' | 'updatedAt' | 'completedAt'

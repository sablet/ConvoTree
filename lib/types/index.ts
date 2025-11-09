import type { MessageType } from '@/lib/constants'

export type { MessageType }

export interface Message {
  id: string
  content: string
  timestamp: Date
  updatedAt?: Date
  lineId: string
  tags?: string[]
  hasBookmark?: boolean
  author?: string
  images?: string[]
  type?: MessageType
  metadata?: Record<string, unknown>
  deleted?: boolean
  deletedAt?: Date
}

export interface Line {
  id: string
  name: string
  parent_line_id: string | null
  tagIds?: string[]
  created_at: string
  updated_at: string
}

export interface Tag {
  id: string
  name: string
  color?: string
  groupId?: string
}

export interface TagGroup {
  id: string
  name: string
  color: string
  order: number
}

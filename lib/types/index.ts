import type { MessageType } from '@/lib/constants'

export type { MessageType }

export interface Message {
  id: string
  content: string
  timestamp: Date
  lineId: string
  prevInLine?: string
  nextInLine?: string
  branchFromMessageId?: string
  tags?: string[]
  hasBookmark?: boolean
  author?: string
  images?: string[]
  type?: MessageType
  metadata?: Record<string, unknown>
}

export interface Line {
  id: string
  name: string
  messageIds: string[]
  startMessageId: string
  endMessageId?: string
  branchFromMessageId?: string
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

export interface BranchPoint {
  messageId: string
  lines: string[]
}

export interface TagGroup {
  id: string
  name: string
  color: string
  order: number
}
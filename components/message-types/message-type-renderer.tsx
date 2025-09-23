"use client"

import { TaskMessage } from "./task-message"
import { DocumentMessage } from "./document-message"
import { SessionMessage } from "./session-message"

interface Message {
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
  type?: 'text' | 'task' | 'document' | 'session'
  metadata?: Record<string, unknown>
}

interface MessageTypeRendererProps {
  message: Message
  onUpdate?: (messageId: string, updates: Partial<Message>) => void
  isEditable?: boolean
}

export function MessageTypeRenderer({
  message,
  onUpdate,
  isEditable = false
}: MessageTypeRendererProps) {
  const handleTaskDataUpdate = (newTaskData: {
    priority: 'low' | 'medium' | 'high' | 'urgent'
    dueDate?: string
    completed: boolean
    estimatedHours?: number
    tags?: string[]
  }) => {
    if (onUpdate) {
      onUpdate(message.id, {
        metadata: newTaskData
      })
    }
  }

  const handleDocumentDataUpdate = (newDocData: {
    isCollapsed: boolean
    summary?: string
    wordCount: number
    originalLength: number
  }) => {
    if (onUpdate) {
      onUpdate(message.id, {
        metadata: newDocData
      })
    }
  }

  const handleSessionDataUpdate = (newSessionData: {
    checkedInAt?: string
    checkedOutAt?: string
    timeSpent?: number
    notes?: string
  }) => {
    if (onUpdate) {
      onUpdate(message.id, {
        metadata: newSessionData
      })
    }
  }

  // メッセージタイプに応じたレンダリング（デフォルトはtext）
  const messageType = message.type || 'text';
  switch (messageType) {
    case 'task':
      const taskData = message.metadata as {
        priority: 'low' | 'medium' | 'high' | 'urgent'
        completed: boolean
        tags?: string[]
      }
      return (
        <TaskMessage
          messageId={message.id}
          content={message.content}
          data={taskData}
          onUpdate={handleTaskDataUpdate}
          isEditable={isEditable}
        />
      )

    case 'document':
      return (
        <DocumentMessage
          messageId={message.id}
          content={message.content}
          data={message.metadata as {
            isCollapsed: boolean
            summary?: string
            wordCount: number
            originalLength: number
          }}
          onUpdate={handleDocumentDataUpdate}
          isEditable={isEditable}
        />
      )

    case 'session':
      return (
        <SessionMessage
          messageId={message.id}
          content={message.content}
          data={message.metadata as {
            checkedInAt?: string
            checkedOutAt?: string
            timeSpent?: number
            notes?: string
          }}
          onUpdate={handleSessionDataUpdate}
          isEditable={isEditable}
        />
      )

    case 'text':
    default:
      // 通常のテキストメッセージ
      return (
        <div className="text-sm text-gray-700 whitespace-pre-wrap">
          {message.content}
        </div>
      )
  }
}
"use client"

import { TaskMessage } from "./task-message"
import type { TaskMessageData } from "./task-message-shared"
import { sanitizeTaskMetadata } from "./task-message-shared"
import { DocumentMessage } from "./document-message"
import { SessionMessage } from "./session-message"
import { MESSAGE_TYPE_TEXT, MESSAGE_TYPE_TASK, MESSAGE_TYPE_DOCUMENT, MESSAGE_TYPE_SESSION, type MessageType } from '@/lib/constants'
import { LinkifiedText } from '@/lib/utils/linkify'

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
  type?: MessageType
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
  const handleTaskDataUpdate = (newTaskData: TaskMessageData) => {
    if (onUpdate) {
      const cleanedTaskData = sanitizeTaskMetadata(newTaskData)

      onUpdate(message.id, {
        metadata: cleanedTaskData
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
    checkedInAt?: string | null
    checkedOutAt?: string | null
    timeSpent?: number
    autoStart?: boolean
  }) => {
    if (onUpdate) {
      onUpdate(message.id, {
        metadata: newSessionData
      })
    }
  }

  // メッセージタイプに応じたレンダリング（デフォルトはtext）
  const messageType = message.type || MESSAGE_TYPE_TEXT;
  switch (messageType) {
    case MESSAGE_TYPE_TASK:
      const taskData = message.metadata as TaskMessageData
      return (
        <TaskMessage
          messageId={message.id}
          content={message.content}
          data={taskData}
          onUpdate={handleTaskDataUpdate}
          isEditable={isEditable}
          fallbackCreatedAt={message.timestamp}
        />
      )

    case MESSAGE_TYPE_DOCUMENT:
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

    case MESSAGE_TYPE_SESSION:
      return (
        <SessionMessage
          messageId={message.id}
          content={message.content}
          data={message.metadata as {
            checkedInAt?: string | null
            checkedOutAt?: string | null
            timeSpent?: number
            notes?: string
            autoStart?: boolean
          }}
          onUpdate={handleSessionDataUpdate}
          isEditable={isEditable}
        />
      )

    case MESSAGE_TYPE_TEXT:
    default:
      // 通常のテキストメッセージ
      return (
        <div
          className="text-sm text-gray-700 whitespace-pre-wrap break-words overflow-wrap-anywhere"
          style={{
            wordWrap: 'break-word',
            overflowWrap: 'anywhere',
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap',
            maxWidth: '100%',
            width: '100%',
            boxSizing: 'border-box'
          }}
        >
          <LinkifiedText text={message.content} />
        </div>
      )
  }
}

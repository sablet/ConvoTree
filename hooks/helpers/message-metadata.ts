import type { MessageType } from '@/lib/constants'
import { MESSAGE_TYPE_TEXT, MESSAGE_TYPE_TASK, MESSAGE_TYPE_DOCUMENT, MESSAGE_TYPE_SESSION } from '@/lib/constants'

/**
 * Get default metadata for message type
 */
export function getDefaultMetadataForType(type: MessageType, content: string = ''): Record<string, unknown> | undefined {
  switch (type) {
    case MESSAGE_TYPE_TASK:
      return {
        priority: 'medium' as const,
        completed: false,
        tags: []
      }
    case MESSAGE_TYPE_DOCUMENT:
      const wordCount = content.trim().length
      return {
        isCollapsed: false,
        wordCount,
        originalLength: wordCount
      }
    case MESSAGE_TYPE_SESSION:
      return {
        timeSpent: 0
      }
    case MESSAGE_TYPE_TEXT:
    default:
      return undefined
  }
}

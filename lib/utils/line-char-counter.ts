import { Message } from '@/lib/types'
import { countTextLengthWithoutUrls } from './linkify'

const MAX_CHAR_LENGTH_FOR_COUNTING = 150

/**
 * Calculate total character count for a line
 * - Excludes messages with 150+ characters
 * - Excludes URL portions from character count
 */
export function calculateLineCharCount(
  messageIds: string[],
  messages: Record<string, Message>
): number {
  let totalChars = 0

  for (const messageId of messageIds) {
    const message = messages[messageId]
    if (!message || !message.content) continue

    // Skip messages with 150+ characters
    const contentLength = countTextLengthWithoutUrls(message.content)
    if (contentLength >= MAX_CHAR_LENGTH_FOR_COUNTING) continue

    totalChars += contentLength
  }

  return totalChars
}

/**
 * Calculate character count for a single message
 * - Excludes URL portions from character count
 */
export function calculateMessageCharCount(content: string): number {
  return countTextLengthWithoutUrls(content)
}


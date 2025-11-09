/**
 * Data helpers for new data structure
 *
 * New structure:
 * - Message: Only has lineId and timestamp
 * - Line: Only has parent_line_id for hierarchy
 * - BranchPoint: Completely removed
 */

import type { Message, Line } from "@/lib/types"

/**
 * Get all messages for a specific line, sorted by timestamp
 */
export function getLineMessages(
  messages: Record<string, Message>,
  lineId: string
): Message[] {
  return Object.values(messages)
    .filter((m) => m.lineId === lineId && !m.deleted)
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
}

/**
 * Get the last message of a line
 */
export function getLineLastMessage(
  messages: Record<string, Message>,
  lineId: string
): Message | null {
  const lineMessages = getLineMessages(messages, lineId)
  return lineMessages.length > 0 ? lineMessages[lineMessages.length - 1] : null
}

/**
 * Get message count for a line
 */
export function getLineMessageCount(
  messages: Record<string, Message>,
  lineId: string
): number {
  return Object.values(messages).filter(
    (m) => m.lineId === lineId && !m.deleted
  ).length
}

/**
 * Get child lines for a parent line
 */
export function getChildLines(
  lines: Record<string, Line>,
  parentLineId: string | null
): Line[] {
  return Object.values(lines).filter((l) => l.parent_line_id === parentLineId)
}

/**
 * Get parent line
 */
export function getParentLine(
  lines: Record<string, Line>,
  childLineId: string
): Line | null {
  const childLine = lines[childLineId]
  if (!childLine || !childLine.parent_line_id) {
    return null
  }
  return lines[childLine.parent_line_id] || null
}

/**
 * Get total character count for a line
 */
export function getLineCharCount(
  messages: Record<string, Message>,
  lineId: string
): number {
  const lineMessages = getLineMessages(messages, lineId)
  return lineMessages.reduce((sum, msg) => sum + msg.content.length, 0)
}

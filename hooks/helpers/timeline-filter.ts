import type { Message } from '@/lib/types'
import type { LineAncestryResult } from './branch-ancestry'

export interface TimelineFilterOptions {
  filterMessageType: string
  filterTaskCompleted: string
  filterDateStart: string
  filterDateEnd: string
  filterTag: string
  searchKeyword: string
}

/**
 * Check if message matches message type filter
 */
function matchesMessageType(message: Message, filterType: string): boolean {
  return filterType === 'all' || message.type === filterType
}

/**
 * Check if message matches task completion filter
 */
function matchesTaskCompletion(message: Message, filterCompletion: string): boolean {
  if (filterCompletion === 'all' || message.type !== 'task') return true

  const isCompleted = message.metadata?.completed === true
  if (filterCompletion === 'completed') return isCompleted
  if (filterCompletion === 'incomplete') return !isCompleted

  return true
}

/**
 * Check if message matches date range filter
 */
function matchesDateRange(message: Message, dateStart: string, dateEnd: string): boolean {
  if (!dateStart && !dateEnd) return true

  const messageDate = new Date(message.timestamp)

  if (dateStart) {
    const startDate = new Date(dateStart)
    startDate.setHours(0, 0, 0, 0)
    if (messageDate < startDate) return false
  }

  if (dateEnd) {
    const endDate = new Date(dateEnd)
    endDate.setHours(23, 59, 59, 999)
    if (messageDate > endDate) return false
  }

  return true
}

/**
 * Check if message matches tag filter
 */
function matchesTag(message: Message, filterTag: string): boolean {
  if (!filterTag) return true

  const messageTags = message.tags || []
  return messageTags.some(tag =>
    tag.toLowerCase().includes(filterTag.toLowerCase())
  )
}

/**
 * Check if message matches keyword search
 */
function matchesKeyword(message: Message, keyword: string): boolean {
  if (!keyword) return true

  const lowerKeyword = keyword.toLowerCase()
  const contentMatch = message.content.toLowerCase().includes(lowerKeyword)
  const authorMatch = message.author?.toLowerCase().includes(lowerKeyword) || false

  return contentMatch || authorMatch
}

/**
 * Filter timeline messages based on criteria
 */
export function filterTimeline(
  completeTimeline: LineAncestryResult,
  options: TimelineFilterOptions
): LineAncestryResult {
  const { filterMessageType, filterTaskCompleted, filterDateStart, filterDateEnd, filterTag, searchKeyword } = options

  const filtered = completeTimeline.messages.filter(message => {
    return matchesMessageType(message, filterMessageType) &&
           matchesTaskCompletion(message, filterTaskCompleted) &&
           matchesDateRange(message, filterDateStart, filterDateEnd) &&
           matchesTag(message, filterTag) &&
           matchesKeyword(message, searchKeyword)
  })

  return {
    messages: filtered,
    transitions: completeTimeline.transitions
  }
}

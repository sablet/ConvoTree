import type { Message } from '@/lib/types'
import type { LineAncestryResult, PaginationInfo } from './branch-ancestry'

/** 1ページあたりの表示件数 */
const PAGE_SIZE = 200

interface TimelineFilterOptions {
  filterMessageType: string
  filterTaskCompleted: string
  filterDateStart: string
  filterDateEnd: string
  filterTag: string
  searchKeyword: string
  /** ページ番号（1始まり、デフォルト1=最新ページ） */
  page?: number
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
  const { filterMessageType, filterTaskCompleted, filterDateStart, filterDateEnd, filterTag, searchKeyword, page = 1 } = options

  const filtered = completeTimeline.messages.filter(message => {
    return matchesMessageType(message, filterMessageType) &&
           matchesTaskCompletion(message, filterTaskCompleted) &&
           matchesDateRange(message, filterDateStart, filterDateEnd) &&
           matchesTag(message, filterTag) &&
           matchesKeyword(message, searchKeyword)
  })

  const totalFilteredMessages = filtered.length
  const totalPages = Math.max(1, Math.ceil(totalFilteredMessages / PAGE_SIZE))

  // ページ番号を有効範囲に制限（1 = 最新ページ）
  const validPage = Math.max(1, Math.min(page, totalPages))

  // ページ1が最新（末尾）、ページ数が大きいほど古い（先頭）
  // 例: 500件、PAGE_SIZE=200の場合
  // - ページ1: 300-499 (最新200件)
  // - ページ2: 100-299 (中間200件)
  // - ページ3: 0-99 (最古100件)
  const endIndex = totalFilteredMessages - (validPage - 1) * PAGE_SIZE
  const startIndex = Math.max(0, endIndex - PAGE_SIZE)

  const paginatedMessages = filtered.slice(startIndex, endIndex)

  // フィルタリング後のメッセージに対してtransitionsを再計算
  const recalculatedTransitions: Array<{ index: number; lineId: string; lineName: string }> = []
  let prevLineId: string | null = null

  paginatedMessages.forEach((msg, index) => {
    if (msg.lineId !== prevLineId) {
      // 元のtransitionsからラインを探す
      const originalTransition = completeTimeline.transitions.find(t => t.lineId === msg.lineId)
      recalculatedTransitions.push({
        index,
        lineId: msg.lineId,
        lineName: originalTransition?.lineName || msg.lineId
      })
      prevLineId = msg.lineId
    }
  })

  const pagination: PaginationInfo = {
    currentPage: validPage,
    totalPages,
    totalFilteredMessages,
    pageSize: PAGE_SIZE,
    hasOlderMessages: validPage < totalPages
  }

  return {
    messages: paginatedMessages,
    transitions: recalculatedTransitions,
    pagination
  }
}

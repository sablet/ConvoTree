import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { DATE_TODAY, DATE_YESTERDAY, WEEKDAY_NAMES } from "./ui-strings"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Get relative time string (e.g., "今", "5分前", "2時間前")
 */
export function getRelativeTime(dateString: string): string {
  if (!dateString) return ""

  const now = new Date()
  const date = new Date(dateString)

  if (isNaN(date.getTime())) return ""

  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMinutes < 1) return "今"
  if (diffMinutes < 60) return `${diffMinutes}分前`
  if (diffHours < 24) return `${diffHours}時間前`
  if (diffDays < 30) return `${diffDays}日前`

  const diffMonths = Math.floor(diffDays / 30)
  return `${diffMonths}ヶ月前`
}

/**
 * Format date for message separator (e.g., "今日", "昨日", "12月25日 (月)")
 */
export function formatDateForSeparator(date: Date): string {
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  const messageDate = new Date(date)

  if (messageDate.toDateString() === today.toDateString()) {
    return DATE_TODAY
  }

  if (messageDate.toDateString() === yesterday.toDateString()) {
    return DATE_YESTERDAY
  }

  const year = messageDate.getFullYear()
  const month = messageDate.getMonth() + 1
  const day = messageDate.getDate()
  const weekday = WEEKDAY_NAMES[messageDate.getDay()]

  const currentYear = today.getFullYear()
  if (year === currentYear) {
    return `${month}月${day}日 (${weekday})`
  }

  return `${year}年${month}月${day}日 (${weekday})`
}

/**
 * Check if two dates are on the same day
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  )
}

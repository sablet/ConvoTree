import { RELATIVE_TIME_NOW, RELATIVE_TIME_MINUTES, RELATIVE_TIME_HOURS, RELATIVE_TIME_DAYS, RELATIVE_TIME_MONTHS } from "@/lib/ui-strings"

/**
 * 日付文字列を相対時間表記に変換
 * @param dateString - 変換対象の日付文字列（updatedAt優先）
 * @param fallbackDateString - フォールバック用日付文字列（createdAt等）
 * @returns 相対時間表記文字列 (例: "3分前", "2時間前")
 */
export function formatRelativeTime(dateString: string, fallbackDateString?: string): string {
  // 更新日時を優先、なければフォールバック日時を使用
  const targetDateString = dateString || fallbackDateString
  if (!targetDateString) return ""

  const now = new Date()
  const date = new Date(targetDateString)

  if (isNaN(date.getTime())) return ""

  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMinutes < 1) return RELATIVE_TIME_NOW
  if (diffMinutes < 60) return `${diffMinutes}${RELATIVE_TIME_MINUTES}`
  if (diffHours < 24) return `${diffHours}${RELATIVE_TIME_HOURS}`
  if (diffDays < 30) return `${diffDays}${RELATIVE_TIME_DAYS}`

  const diffMonths = Math.floor(diffDays / 30)
  return `${diffMonths}${RELATIVE_TIME_MONTHS}`
}

/**
 * SessionMessage コンポーネントのヘルパー関数群
 */

/**
 * 分単位の時間を「◯時間◯分」形式にフォーマット
 */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours > 0) {
    return `${hours}時間${mins}分`
  }
  return `${mins}分`
}

/**
 * ISO日時文字列を「HH:MM」形式にフォーマット
 */
export function formatTime(dateString: string): string {
  return new Date(dateString).toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

/**
 * チェックイン時刻とチェックアウト時刻から経過時間（分）を計算
 */
export function calculateDuration(checkedInAt: string, checkedOutAt: string): number {
  if (!checkedInAt || !checkedOutAt) return 0
  try {
    const startTime = new Date(checkedInAt).getTime()
    const endTime = new Date(checkedOutAt).getTime()
    if (isNaN(startTime) || isNaN(endTime)) return 0
    const duration = Math.round((endTime - startTime) / (1000 * 60))
    return duration >= 0 ? duration : 0
  } catch {
    return 0
  }
}

/**
 * ISO日時文字列を「YYYY/MM/DD HH:MM」形式にフォーマット
 */
export function formatDateTimeLocal(dateString: string): string {
  const date = new Date(dateString)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}/${month}/${day} ${hours}:${minutes}`
}

/**
 * 日付・時刻セグメントの妥当性チェック
 */
function isValidDateTimeSegments(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number
): boolean {
  if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hours) || isNaN(minutes)) {
    return false
  }
  if (month < 1 || month > 12) return false
  if (day < 1 || day > 31) return false
  if (hours < 0 || hours > 23) return false
  if (minutes < 0 || minutes > 59) return false
  return true
}

/**
 * 「YYYY/MM/DD HH:MM」形式の文字列をISO日時文字列に変換
 */
export function parseDateTime(dateTimeStr: string): string | null {
  if (!dateTimeStr || !dateTimeStr.includes(' ')) return null

  try {
    const [datePart, timePart] = dateTimeStr.split(' ')
    if (!datePart || !timePart) return null

    const dateSegments = datePart.split('/')
    const timeSegments = timePart.split(':')

    if (dateSegments.length !== 3 || timeSegments.length !== 2) return null

    const [year, month, day] = dateSegments.map(s => parseInt(s, 10))
    const [hours, minutes] = timeSegments.map(s => parseInt(s, 10))

    if (!isValidDateTimeSegments(year, month, day, hours, minutes)) return null

    const date = new Date(year, month - 1, day, hours, minutes)
    if (isNaN(date.getTime())) return null

    // ローカル時刻をISO文字列として保存するため、タイムゾーンオフセットを調整
    const offsetMs = date.getTimezoneOffset() * 60000
    const localISOTime = new Date(date.getTime() - offsetMs).toISOString()
    return localISOTime
  } catch {
    return null
  }
}

/**
 * セッション編集時の検証エラー
 */
interface ValidationError {
  isValid: false
  message: string
}

interface ValidationSuccess {
  isValid: true
  checkedInAt?: string | null
  checkedOutAt?: string | null
}

type ValidationResult = ValidationError | ValidationSuccess

/**
 * セッション時刻編集の入力値を検証
 */
export function validateSessionTimes(
  editCheckedInAt: string,
  editCheckedOutAt: string
): ValidationResult {
  const newCheckedInAt = editCheckedInAt ? parseDateTime(editCheckedInAt) : undefined
  const newCheckedOutAt = editCheckedOutAt ? parseDateTime(editCheckedOutAt) : undefined

  if (editCheckedInAt && !newCheckedInAt) {
    return {
      isValid: false,
      message: 'チェックイン時刻の形式が正しくありません (YYYY/MM/DD HH:MM)'
    }
  }

  if (editCheckedOutAt && !newCheckedOutAt) {
    return {
      isValid: false,
      message: 'チェックアウト時刻の形式が正しくありません (YYYY/MM/DD HH:MM)'
    }
  }

  if (newCheckedInAt && newCheckedOutAt && new Date(newCheckedInAt) >= new Date(newCheckedOutAt)) {
    return {
      isValid: false,
      message: 'チェックアウト時刻はチェックイン時刻より後に設定してください'
    }
  }

  return {
    isValid: true,
    checkedInAt: newCheckedInAt,
    checkedOutAt: newCheckedOutAt
  }
}

/**
 * 新しいセッション時間を計算
 */
export function calculateNewTimeSpent(
  currentTimeSpent: number,
  newCheckedInAt: string | null | undefined,
  newCheckedOutAt: string | null | undefined,
  oldCheckedInAt: string | null | undefined,
  oldCheckedOutAt: string | null | undefined
): number {
  if (!newCheckedInAt || !newCheckedOutAt) {
    return currentTimeSpent
  }

  const sessionDuration = calculateDuration(newCheckedInAt, newCheckedOutAt)
  const previousSessionDuration = oldCheckedInAt && oldCheckedOutAt
    ? calculateDuration(oldCheckedInAt, oldCheckedOutAt)
    : 0

  return Math.max(0, currentTimeSpent - previousSessionDuration + sessionDuration)
}

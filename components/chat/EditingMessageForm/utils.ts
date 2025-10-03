/**
 * EditingMessageFormのユーティリティ関数
 */

/**
 * datetime-local形式の文字列をISO文字列から変換する
 */
export function formatDatetimeLocal(isoString: string): string {
  if (!isoString) return ''
  const date = new Date(isoString)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

/**
 * チェックイン時刻変更時のメタデータ更新
 */
export function updateCheckedInAt(
  editingMetadata: Record<string, unknown>,
  isoString: string
): Record<string, unknown> {
  const newMetadata: Record<string, unknown> = {
    ...editingMetadata,
    checkedInAt: isoString
  }
  if (isoString && editingMetadata.timeSpent) {
    newMetadata.checkedOutAt = new Date(
      new Date(isoString).getTime() + (editingMetadata.timeSpent as number) * 60000
    ).toISOString()
  }
  return newMetadata
}

/**
 * 経過分数変更時のメタデータ更新
 */
export function updateTimeSpent(
  editingMetadata: Record<string, unknown>,
  messageMetadata: Record<string, unknown> | undefined,
  minutes: number
): Record<string, unknown> {
  const checkedInAt = (editingMetadata.checkedInAt as string) || (messageMetadata?.checkedInAt as string)
  const newMetadata: Record<string, unknown> = {
    ...editingMetadata,
    timeSpent: minutes
  }
  if (checkedInAt && minutes > 0) {
    newMetadata.checkedOutAt = new Date(
      new Date(checkedInAt).getTime() + minutes * 60000
    ).toISOString()
  } else if (minutes === 0) {
    newMetadata.checkedOutAt = ''
  }
  return newMetadata
}

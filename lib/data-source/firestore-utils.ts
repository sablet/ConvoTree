import { deleteField } from "firebase/firestore"

/**
 * メタデータからundefined値を除去する
 */
function cleanMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(metadata)) {
    if (value !== undefined) {
      cleaned[key] = value
    }
  }
  return cleaned
}

/**
 * 更新データの値を処理する
 */
function processUpdateValue(key: string, value: unknown): unknown {
  if (value === null) {
    return deleteField()
  }
  if (value === undefined) {
    return undefined
  }
  if (key === 'metadata' && typeof value === 'object' && value !== null) {
    return cleanMetadata(value as Record<string, unknown>)
  }
  return value
}

/**
 * 更新データオブジェクトを構築する
 */
export function buildUpdateData(updates: Record<string, unknown>): Record<string, unknown> {
  const updateData: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(updates)) {
    const processedValue = processUpdateValue(key, value)
    if (processedValue !== undefined) {
      updateData[key] = processedValue
    }
  }

  return updateData
}

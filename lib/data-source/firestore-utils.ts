/**
 * Firestore共通ユーティリティ関数
 */

/**
 * 日付値を正規化してDate型に変換
 */
export const normalizeDateValue = (value: unknown): Date | undefined => {
  if (!value) return undefined;
  if (value instanceof Date) return value;

  if (typeof value === 'string') {
    const fromString = new Date(value);
    return Number.isNaN(fromString.getTime()) ? undefined : fromString;
  }

  if (typeof value === 'number') {
    const fromNumber = new Date(value);
    return Number.isNaN(fromNumber.getTime()) ? undefined : fromNumber;
  }

  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const candidate = value as { toDate: () => Date };
    if (typeof candidate.toDate === 'function') {
      const fromTimestamp = candidate.toDate();
      return Number.isNaN(fromTimestamp.getTime()) ? undefined : fromTimestamp;
    }
  }

  return undefined;
};

/**
 * 更新データを構築（undefined値を除外）
 */
export const buildUpdateData = <T extends Record<string, unknown>>(updates: T): Record<string, unknown> => {
  const result: Record<string, unknown> = {};

  Object.entries(updates).forEach(([key, value]) => {
    if (value !== undefined) {
      result[key] = value;
    }
  });

  return result;
};

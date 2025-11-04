'use client';

import { getDB, TIMESTAMP_STORE } from './indexed-db-common';

interface LastFetchTimestamps {
  messages: Date | null;
  lines: Date | null;
  branchPoints: Date | null;
  tags: Date | null;
  tagGroups: Date | null;
}

/**
 * キーを生成
 */
function getKey(conversationId: string, collection: keyof LastFetchTimestamps): string {
  return `${conversationId}_${collection}`;
}

/**
 * 最終取得時刻を保存
 */
export async function saveLastFetchTimestamp(
  conversationId: string,
  collection: keyof LastFetchTimestamps
): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const db = await getDB();
    const key = getKey(conversationId, collection);
    await db.put(TIMESTAMP_STORE, {
      conversationId,
      collection,
      timestamp: new Date().toISOString(),
    }, key);
  } catch (error) {
    console.warn('[IndexedDBTimestampStorage] Failed to save timestamp:', error);
  }
}

/**
 * 最終取得時刻を取得（内部使用）
 */
async function getLastFetchTimestamp(
  conversationId: string,
  collection: keyof LastFetchTimestamps
): Promise<Date | null> {
  if (typeof window === 'undefined') return null;

  try {
    const db = await getDB();
    const key = getKey(conversationId, collection);
    const record = await db.get(TIMESTAMP_STORE, key);

    if (record && record.timestamp) {
      return new Date(record.timestamp);
    }
    return null;
  } catch (error) {
    console.warn('[IndexedDBTimestampStorage] Failed to get timestamp:', error);
    return null;
  }
}

/**
 * 全ての最終取得時刻を取得
 */
export async function getAllLastFetchTimestamps(conversationId: string): Promise<LastFetchTimestamps> {
  return {
    messages: await getLastFetchTimestamp(conversationId, 'messages'),
    lines: await getLastFetchTimestamp(conversationId, 'lines'),
    branchPoints: await getLastFetchTimestamp(conversationId, 'branchPoints'),
    tags: await getLastFetchTimestamp(conversationId, 'tags'),
    tagGroups: await getLastFetchTimestamp(conversationId, 'tagGroups'),
  };
}

/**
 * 全てのタイムスタンプをクリア
 */
export async function clearAllLastFetchTimestamps(conversationId: string): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const db = await getDB();
    const collections: Array<keyof LastFetchTimestamps> = [
      'messages',
      'lines',
      'branchPoints',
      'tags',
      'tagGroups',
    ];

    await Promise.all(
      collections.map((collection) => {
        const key = getKey(conversationId, collection);
        return db.delete(TIMESTAMP_STORE, key);
      })
    );

    console.log('[IndexedDBTimestampStorage] Cleared all fetch timestamps');
  } catch (error) {
    console.warn('[IndexedDBTimestampStorage] Failed to clear timestamps:', error);
  }
}

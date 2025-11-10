'use client';

import { getDB, TIMESTAMP_STORE } from './indexed-db-common';

interface LastFetchTimestamps {
  messages: Date | null;
  lines: Date | null;
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
 * 全てのタイムスタンプをクリア
 */
export async function clearAllLastFetchTimestamps(conversationId: string): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const db = await getDB();
    const collections: Array<keyof LastFetchTimestamps> = [
      'messages',
      'lines',
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

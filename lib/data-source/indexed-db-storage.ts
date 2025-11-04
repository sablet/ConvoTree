'use client';

import type { ChatData } from './base';
import { getDB, CHAT_DATA_STORE } from './indexed-db-common';

/**
 * ChatDataをIndexedDBに保存
 */
export async function saveChatDataCache(conversationId: string, data: ChatData): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const db = await getDB();
    await db.put(CHAT_DATA_STORE, {
      conversationId,
      data,
      savedAt: new Date().toISOString(),
    }, conversationId);
  } catch (error) {
    console.warn('[IndexedDBStorage] Failed to save chat data:', error);
  }
}

/**
 * ChatDataをIndexedDBから取得
 */
export async function loadChatDataCache(conversationId: string): Promise<ChatData | null> {
  if (typeof window === 'undefined') return null;

  try {
    const db = await getDB();
    const record = await db.get(CHAT_DATA_STORE, conversationId);

    if (!record) {
      return null;
    }

    const data = record.data as ChatData;

    // タイムスタンプ文字列をDateオブジェクトに復元
    if (data.messages) {
      Object.keys(data.messages).forEach((msgId) => {
        const msg = data.messages[msgId];
        if (msg.timestamp && typeof msg.timestamp === 'string') {
          msg.timestamp = new Date(msg.timestamp);
        }
        if (msg.updatedAt && typeof msg.updatedAt === 'string') {
          msg.updatedAt = new Date(msg.updatedAt);
        }
      });
    }

    return data;
  } catch (error) {
    console.warn('[IndexedDBStorage] Failed to load chat data:', error);
    return null;
  }
}

/**
 * ChatDataキャッシュをクリア
 */
export async function clearChatDataCache(conversationId: string): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const db = await getDB();
    await db.delete(CHAT_DATA_STORE, conversationId);
    console.log('[IndexedDBStorage] Cleared chat data cache');
  } catch (error) {
    console.warn('[IndexedDBStorage] Failed to clear chat data cache:', error);
  }
}

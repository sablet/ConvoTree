'use client';

import { openDB, DBSchema, IDBPDatabase } from 'idb';

const DB_NAME = 'chat-line-db';
const DB_VERSION = 1;

export const CHAT_DATA_STORE = 'chatData';
export const TIMESTAMP_STORE = 'timestamps';

interface ChatLineDB extends DBSchema {
  chatData: {
    key: string;
    value: {
      conversationId: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: any;
      savedAt: string;
    };
  };
  timestamps: {
    key: string;
    value: string;
  };
}

let dbPromise: Promise<IDBPDatabase<ChatLineDB>> | null = null;

/**
 * データベースを開く（シングルトンパターン）
 */
export async function getDB(): Promise<IDBPDatabase<ChatLineDB>> {
  if (typeof window === 'undefined') {
    throw new Error('IndexedDB is not available on server side');
  }

  if (!dbPromise) {
    dbPromise = openDB<ChatLineDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // chatData ストアを作成
        if (!db.objectStoreNames.contains(CHAT_DATA_STORE)) {
          db.createObjectStore(CHAT_DATA_STORE);
        }
        // timestamps ストアを作成
        if (!db.objectStoreNames.contains(TIMESTAMP_STORE)) {
          db.createObjectStore(TIMESTAMP_STORE);
        }
      },
    });
  }

  return dbPromise;
}

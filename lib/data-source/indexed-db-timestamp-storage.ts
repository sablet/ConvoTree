'use client';

import { getDB, TIMESTAMP_STORE } from './indexed-db-common';

export async function getLastFetchTimestamp(key: string): Promise<Date | null> {
  if (typeof window === 'undefined') return null;

  const db = await getDB();
  const timestamp = await db.get(TIMESTAMP_STORE, key);
  return timestamp ? new Date(timestamp) : null;
}

export async function setLastFetchTimestamp(key: string, timestamp: Date): Promise<void> {
  if (typeof window === 'undefined') return;

  const db = await getDB();
  await db.put(TIMESTAMP_STORE, timestamp.toISOString(), key);
}

export async function clearAllLastFetchTimestamps(key: string): Promise<void> {
  if (typeof window === 'undefined') return;

  const db = await getDB();
  await db.delete(TIMESTAMP_STORE, key);
}

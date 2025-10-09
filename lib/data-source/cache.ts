'use client';

import type { ChatData } from './base';

const CACHE_KEY = 'chat-line-cache';
const CACHE_TIMESTAMP_KEY = 'chat-line-cache-timestamp';
const CACHE_VERSION = '1.0';

interface CacheData {
  version: string;
  data: ChatData;
  timestamp: number;
}

export class LocalStorageCache {
  private isAvailable(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }

    try {
      const test = '__localStorage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  }

  async save(data: ChatData): Promise<void> {
    if (!this.isAvailable()) {
      console.warn('LocalStorage is not available');
      return;
    }

    try {
      const cacheData: CacheData = {
        version: CACHE_VERSION,
        data,
        timestamp: Date.now()
      };

      const serialized = JSON.stringify(cacheData);
      localStorage.setItem(CACHE_KEY, serialized);
      localStorage.setItem(CACHE_TIMESTAMP_KEY, cacheData.timestamp.toString());

      console.log('✅ Cache saved to LocalStorage');
    } catch (error) {
      console.error('Failed to save cache:', error);
      throw error;
    }
  }

  async load(): Promise<ChatData | null> {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (!cached) {
        return null;
      }

      const cacheData = JSON.parse(cached) as CacheData;

      if (cacheData.version !== CACHE_VERSION) {
        console.warn('Cache version mismatch, clearing cache');
        this.clear();
        return null;
      }

      console.log('✅ Cache loaded from LocalStorage');
      return cacheData.data;
    } catch (error) {
      console.error('Failed to load cache:', error);
      return null;
    }
  }

  getCacheTimestamp(): number | null {
    if (!this.isAvailable()) {
      return null;
    }

    const timestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);
    return timestamp ? parseInt(timestamp, 10) : null;
  }

  clear(): void {
    if (!this.isAvailable()) {
      return;
    }

    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(CACHE_TIMESTAMP_KEY);
    console.log('✅ Cache cleared');
  }

  hasCache(): boolean {
    if (!this.isAvailable()) {
      return false;
    }

    return localStorage.getItem(CACHE_KEY) !== null;
  }
}

export const localStorageCache = new LocalStorageCache();

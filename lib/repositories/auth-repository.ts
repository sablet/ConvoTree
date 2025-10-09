'use client';

import type { User } from 'firebase/auth';

const AUTH_CACHE_KEY = 'chat-line-auth-cache';
const MAX_CACHE_AGE = 7 * 24 * 60 * 60 * 1000; // 7日

export interface CachedAuthData {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  timestamp: number;
}

/**
 * 認証データのリポジトリ
 *
 * LocalStorageへの直接アクセスを抽象化し、
 * 認証データのキャッシュ管理を一元化する
 */
export class AuthRepository {
  /**
   * 認証データをキャッシュに保存
   */
  saveToCache(user: User | null): void {
    if (typeof window === 'undefined') return;

    try {
      if (user) {
        const cacheData: CachedAuthData = {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          timestamp: Date.now()
        };
        localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(cacheData));
      } else {
        localStorage.removeItem(AUTH_CACHE_KEY);
      }
    } catch (error) {
      console.error('Failed to save auth cache:', error);
    }
  }

  /**
   * キャッシュから認証データを読み込む
   *
   * @returns キャッシュされた認証データ、または null（キャッシュなし/期限切れ）
   */
  loadFromCache(): CachedAuthData | null {
    if (typeof window === 'undefined') return null;

    try {
      const cached = localStorage.getItem(AUTH_CACHE_KEY);
      if (!cached) return null;

      const data = JSON.parse(cached) as CachedAuthData;
      const age = Date.now() - data.timestamp;

      if (age > MAX_CACHE_AGE) {
        // 期限切れのキャッシュを削除
        this.clearCache();
        return null;
      }

      return data;
    } catch (error) {
      console.error('Failed to load auth cache:', error);
      return null;
    }
  }

  /**
   * キャッシュをクリア
   */
  clearCache(): void {
    if (typeof window === 'undefined') return;

    try {
      localStorage.removeItem(AUTH_CACHE_KEY);
    } catch (error) {
      console.error('Failed to clear auth cache:', error);
    }
  }

  /**
   * キャッシュの存在確認
   */
  hasCache(): boolean {
    if (typeof window === 'undefined') return false;

    try {
      const cached = localStorage.getItem(AUTH_CACHE_KEY);
      return cached !== null;
    } catch {
      return false;
    }
  }

  /**
   * キャッシュのタイムスタンプを取得
   */
  getCacheTimestamp(): number | null {
    const cached = this.loadFromCache();
    return cached?.timestamp ?? null;
  }

  /**
   * キャッシュされた認証データをUser型に変換
   */
  convertCachedToUser(cached: CachedAuthData): Partial<User> {
    return {
      uid: cached.uid,
      email: cached.email,
      displayName: cached.displayName,
      photoURL: cached.photoURL,
    } as User;
  }
}

// シングルトンインスタンス
export const authRepository = new AuthRepository();

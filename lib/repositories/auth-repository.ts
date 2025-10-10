'use client';

/**
 * 認証データのリポジトリ
 *
 * Firebase Authの永続化機能を使用するため、LocalStorageでのキャッシュは不要
 * このファイルは互換性のために残すが、実質的な機能は提供しない
 */
export class AuthRepository {
  /**
   * 認証データをキャッシュに保存（非推奨・何もしない）
   * Firebase Authが自動的に永続化を行う
   */
  saveToCache(): void {
    // Firebase Authの永続化に任せる
    console.warn('[AuthRepository] saveToCache is deprecated. Firebase Auth handles persistence automatically.');
  }

  /**
   * キャッシュから認証データを読み込む（非推奨・常にnullを返す）
   * Firebase AuthのonAuthStateChangedを使用すること
   */
  loadFromCache(): null {
    console.warn('[AuthRepository] loadFromCache is deprecated. Use Firebase Auth onAuthStateChanged instead.');
    return null;
  }

  /**
   * キャッシュをクリア（非推奨・何もしない）
   */
  clearCache(): void {
    console.warn('[AuthRepository] clearCache is deprecated.');
  }

  /**
   * キャッシュの存在確認（非推奨・常にfalseを返す）
   */
  hasCache(): boolean {
    return false;
  }

  /**
   * キャッシュのタイムスタンプを取得（非推奨・常にnullを返す）
   */
  getCacheTimestamp(): null {
    return null;
  }
}

// シングルトンインスタンス
export const authRepository = new AuthRepository();

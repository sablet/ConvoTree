'use client';

import type { ChatData, DataSource } from '@/lib/data-source/base';
import { DataSourceFactory, dataSourceManager } from '@/lib/data-source/factory';
import type { IDataSource } from '@/lib/data-source/base';
import { loadChatDataCache, saveChatDataCache, clearChatDataCache } from '@/lib/data-source/indexed-db-storage';
import {
  getLastFetchTimestamp,
  setLastFetchTimestamp,
  clearAllLastFetchTimestamps
} from '@/lib/data-source/indexed-db-timestamp-storage';
import type { Message, Line } from '@/lib/types';

interface LoadChatDataOptions {
  source?: DataSource;
  fallbackSources?: DataSource[];
  onRevalidate?: (data: ChatData) => void; // バックグラウンド更新時のコールバック
}

interface LoadChatDataResult {
  data: ChatData;
  source: DataSource;
  fromCache: boolean;
  error?: string;
  fallbackUsed?: boolean;
  revalidating?: boolean; // バックグラウンド更新中かどうか
}

const DEFAULT_FALLBACK_SOURCES: DataSource[] = ['sample'];

/**
 * タイムスタンプベースの差分取得を使用するChatRepository
 */
export class ChatRepository {
  private static readonly CACHE_KEY = 'default';
  private currentData: ChatData | null = null;
  private initPromise: Promise<void> | null = null;
  private loadPromise: Promise<LoadChatDataResult> | null = null;

  constructor() {
    // 即座にIndexedDBからのキャッシュ復元を開始（バックグラウンド）
    this.ensureInitialized().catch((error) => {
      console.warn('[ChatRepository] Background initialization failed:', error);
    });
  }

  /**
   * IndexedDBからキャッシュを復元（初回のみ）
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      try {
        this.currentData = await loadChatDataCache(ChatRepository.CACHE_KEY);
        if (this.currentData) {
          console.log('[ChatRepository] Restored cached data from IndexedDB');
        }
      } catch (error) {
        console.warn('[ChatRepository] Failed to restore cache:', error);
        this.currentData = null;
      }
    })();

    return this.initPromise;
  }

  /**
   * 初回ロード用（Stale-While-Revalidate対応）
   *
   * キャッシュがあれば即座に返し、バックグラウンドで最新データを取得
   */
  async loadChatData(options: LoadChatDataOptions = {}): Promise<LoadChatDataResult> {
    // 既に進行中のリクエストがあれば、それを待つ（重複排除）
    if (this.loadPromise) {
      console.log('[ChatRepository] Reusing in-flight request');
      return this.loadPromise;
    }

    // 初回はIndexedDBからキャッシュを復元
    await this.ensureInitialized();

    const source = options.source ?? dataSourceManager.getCurrentSource();
    const fallbackSources = this.buildFallbackSources(source, options.fallbackSources);

    // キャッシュがある場合は即座に返す（Stale-While-Revalidate）
    if (this.currentData) {
      console.log('[ChatRepository] Returning cached data immediately');

      // バックグラウンドで最新データを取得（awaitしない）
      this.revalidateInBackground(source, fallbackSources, options.onRevalidate).catch((error) => {
        console.warn('[ChatRepository] Background revalidation failed:', error);
      });

      return {
        data: this.currentData,
        source,
        fromCache: true,
        revalidating: true
      };
    }

    // キャッシュがない場合は通常通りサーバーから取得
    this.loadPromise = (async () => {
      try {
        const result = await this.loadFromSource(source);
        this.loadPromise = null;
        return result;
      } catch (primaryError) {
        console.error(`[ChatRepository] Primary source '${source}' failed:`, primaryError);
        const result = await this.handleLoadError(primaryError, fallbackSources, source);
        this.loadPromise = null;
        return result;
      }
    })();

    return this.loadPromise;
  }

  /**
   * バックグラウンドで最新データを取得して更新
   */
  private async revalidateInBackground(
    source: DataSource,
    fallbackSources: DataSource[],
    onRevalidate?: (data: ChatData) => void
  ): Promise<void> {
    try {
      console.log('[ChatRepository] Starting background revalidation');
      const result = await this.loadFromSource(source);

      // 更新があればコールバックを呼ぶ
      if (onRevalidate) {
        onRevalidate(result.data);
      }

      console.log('[ChatRepository] Background revalidation completed');
    } catch (primaryError) {
      console.error(`[ChatRepository] Background revalidation failed for '${source}':`, primaryError);

      // フォールバックを試す
      for (const fallbackSource of fallbackSources) {
        try {
          console.warn(`[ChatRepository] Trying fallback source '${fallbackSource}' in background`);
          const result = await this.loadFromSource(fallbackSource);

          if (onRevalidate) {
            onRevalidate(result.data);
          }

          return;
        } catch (error) {
          console.warn(`[ChatRepository] Background fallback '${fallbackSource}' failed:`, error);
        }
      }
    }
  }

  private async handleLoadError(
    primaryError: unknown,
    fallbackSources: DataSource[],
    originalSource: DataSource
  ): Promise<LoadChatDataResult> {
    const errorMessage = primaryError instanceof Error ? primaryError.message : String(primaryError);

    for (const fallbackSource of fallbackSources) {
      try {
        console.warn(`[ChatRepository] Trying fallback source '${fallbackSource}' after '${originalSource}' failed`);
        const result = await this.loadFromSource(fallbackSource);
        return {
          ...result,
          error: errorMessage,
          fallbackUsed: true
        };
      } catch (error) {
        console.warn(`[ChatRepository] Fallback data source '${fallbackSource}' failed:`, error);
      }
    }

    throw primaryError instanceof Error
      ? primaryError
      : new Error('チャットデータの取得に失敗しました');
  }

  private buildFallbackSources(source: DataSource, overrides?: DataSource[]): DataSource[] {
    const candidates = overrides ?? DEFAULT_FALLBACK_SOURCES;
    return candidates.filter((candidate) => candidate !== source);
  }

  private resolveDataSource(source: DataSource): IDataSource {
    if (source === dataSourceManager.getCurrentSource()) {
      return dataSourceManager.getDataSource();
    }

    return DataSourceFactory.create(source);
  }

  private async loadFromSource(source: DataSource): Promise<LoadChatDataResult> {
    const dataSource = this.resolveDataSource(source);
    const since = await getLastFetchTimestamp(ChatRepository.CACHE_KEY);

    console.log(`[ChatRepository] loadFromSource START - currentData exists:`, !!this.currentData);
    console.log(`[ChatRepository] Fetching data${since ? ` since ${since.toISOString()}` : ' (full)'}`);
    const fetchedData = await dataSource.loadChatData(since ?? undefined);
    const fetchedCount = {
      messages: Object.keys(fetchedData.messages).length,
      lines: fetchedData.lines.length,
    };
    console.log(`[ChatRepository] Fetched ${fetchedCount.messages} messages, ${fetchedCount.lines} lines`);

    // 既存データとマージ
    let mergedData = fetchedData;
    if (this.currentData) {
      console.log('[ChatRepository] Merging with existing data:', {
        existingMessages: Object.keys(this.currentData.messages).length,
        existingLines: this.currentData.lines.length,
        newMessages: Object.keys(fetchedData.messages).length,
        newLines: fetchedData.lines.length
      });
      const mergedMessages = { ...this.currentData.messages, ...fetchedData.messages };

      // deleted=true のメッセージを除外
      const filteredMessages: typeof mergedMessages = {};
      Object.entries(mergedMessages).forEach(([id, msg]) => {
        if (!msg.deleted) {
          filteredMessages[id] = msg;
        }
      });

      const allLines = [...this.currentData.lines, ...fetchedData.lines];
      const lineMap = new Map<string, Line>();
      allLines.forEach(line => {
        lineMap.set(line.id, line);
      });
      const mergedLines = Array.from(lineMap.values());

      mergedData = {
        messages: filteredMessages,
        lines: mergedLines,
        tags: { ...this.currentData.tags, ...fetchedData.tags },
        tagGroups: { ...this.currentData.tagGroups, ...fetchedData.tagGroups }
      };
    } else {
      // 初回取得時もフィルタ適用
      const filteredMessages: typeof fetchedData.messages = {};
      Object.entries(fetchedData.messages).forEach(([id, msg]) => {
        if (!msg.deleted) {
          filteredMessages[id] = msg;
        }
      });
      mergedData = {
        ...fetchedData,
        messages: filteredMessages
      };
    }

    // 取得したデータから最新の updated_at を計算
    const latestTimestamp = this.getLatestTimestamp(mergedData);
    console.log(`[ChatRepository] Saving latest timestamp: ${latestTimestamp.toISOString()}`);

    // マージしたデータをメモリとIndexedDBにキャッシュ
    this.currentData = mergedData;
    console.log('[ChatRepository] loadFromSource END - saving cache:', {
      messages: Object.keys(mergedData.messages).length,
      lines: mergedData.lines.length
    });
    await Promise.all([
      saveChatDataCache(ChatRepository.CACHE_KEY, mergedData),
      setLastFetchTimestamp(ChatRepository.CACHE_KEY, latestTimestamp)
    ]);

    console.log('[ChatRepository] loadFromSource COMPLETE');
    return {
      data: mergedData,
      source,
      fromCache: false
    };
  }

  private getLatestTimestamp(data: ChatData): Date {
    let latest = new Date(0);

    // messages の updated_at をチェック
    Object.values(data.messages).forEach((msg) => {
      if (msg.updatedAt && msg.updatedAt > latest) {
        latest = msg.updatedAt;
      }
      if (msg.timestamp > latest) {
        latest = msg.timestamp;
      }
    });

    // lines の updated_at をチェック
    data.lines.forEach((line) => {
      if (line.updated_at) {
        const lineDate = new Date(line.updated_at);
        if (lineDate > latest) {
          latest = lineDate;
        }
      }
    });

    return latest;
  }

  /**
   * メッセージを削除し、キャッシュを即座に更新
   */
  async deleteMessage(id: string): Promise<void> {
    await this.ensureInitialized();

    const dataSource = dataSourceManager.getDataSource();
    await dataSource.deleteMessage(id);

    // キャッシュからメッセージを削除
    if (this.currentData) {
      const { [id]: _, ...remainingMessages } = this.currentData.messages;
      this.currentData = {
        ...this.currentData,
        messages: remainingMessages
      };
      await saveChatDataCache(ChatRepository.CACHE_KEY, this.currentData);
      console.log(`[ChatRepository] Message ${id} deleted and removed from cache`);
    }
  }

  /**
   * メッセージを作成し、キャッシュを即座に更新
   */
  async createMessage(message: Parameters<IDataSource['createMessage']>[0]): Promise<string> {
    await this.ensureInitialized();

    const dataSource = dataSourceManager.getDataSource();
    const messageId = await dataSource.createMessage(message);

    // 新しいメッセージをキャッシュに追加
    if (this.currentData) {
      const newMessage: Message = {
        ...message,
        id: messageId,
        // サーバーで設定されるタイムスタンプを仮で設定。
        // 正確な値は次回の差分取得で更新される。
        timestamp: new Date(),
        updatedAt: new Date(),
      };

      this.currentData.messages[messageId] = newMessage;

      // タイムスタンプはクリアせず、キャッシュのみ更新
      await saveChatDataCache(ChatRepository.CACHE_KEY, this.currentData);
      console.log(`[ChatRepository] Message ${messageId} created and added to cache`);
    } else {
      // キャッシュがない場合は、次回のロードで全データ取得されるようにする
      await clearAllLastFetchTimestamps(ChatRepository.CACHE_KEY);
      console.log('[ChatRepository] Timestamp cleared after message creation (no existing cache)');
    }

    return messageId;
  }

  /**
   * メッセージを更新し、キャッシュを即座に更新
   */
  async updateMessage(id: string, updates: Parameters<IDataSource['updateMessage']>[1]): Promise<void> {
    await this.ensureInitialized();

    const dataSource = dataSourceManager.getDataSource();
    await dataSource.updateMessage(id, updates);

    // メッセージをキャッシュ内で更新
    if (this.currentData && this.currentData.messages[id]) {
      // 'deleted' フラグの変更を正しく処理する
      if (updates.deleted) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete this.currentData.messages[id];
      } else {
        const existingMessage = this.currentData.messages[id];

        // スプレッド構文でマージ
        const merged = {
          ...existingMessage,
          ...updates,
        };

        // Date 型に変換
        const updatedMessage: Message = {
          ...merged,
          timestamp: merged.timestamp ? new Date(merged.timestamp) : existingMessage.timestamp,
          updatedAt: new Date(), // 常に現在時刻で更新
        };

        this.currentData.messages[id] = updatedMessage;
      }

      // タイムスタンプはクリアせず、キャッシュのみ更新
      await saveChatDataCache(ChatRepository.CACHE_KEY, this.currentData);
      console.log(`[ChatRepository] Message ${id} updated in cache`);
    } else {
      // キャッシュがない、または対象メッセージがキャッシュにない場合
      await clearAllLastFetchTimestamps(ChatRepository.CACHE_KEY);
      console.log('[ChatRepository] Timestamp cleared after message update (no existing cache or message)');
    }
  }

  /**
   * 全てのキャッシュをクリア（ChatDataとタイムスタンプ）
   */
  async clearAllCache(): Promise<void> {
    this.currentData = null;
    this.initPromise = null; // 初期化フラグをリセット
    await Promise.all([
      clearChatDataCache(ChatRepository.CACHE_KEY),
      clearAllLastFetchTimestamps(ChatRepository.CACHE_KEY)
    ]);
    console.log('[ChatRepository] Cleared all caches (data + timestamps)');
  }
}

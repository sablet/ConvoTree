'use client';

import { config } from '@/lib/config';
import type { ChatData, DataSource } from '@/lib/data-source/base';
import { DataSourceFactory, dataSourceManager } from '@/lib/data-source/factory';
import type { IDataSource } from '@/lib/data-source/base';
import { loadChatDataCache, saveChatDataCache, clearChatDataCache } from '@/lib/data-source/indexed-db-storage';
import { clearAllLastFetchTimestamps } from '@/lib/data-source/indexed-db-timestamp-storage';

interface LoadChatDataOptions {
  source?: DataSource;
  fallbackSources?: DataSource[];
}

interface LoadChatDataResult {
  data: ChatData;
  source: DataSource;
  fromCache: boolean;
  error?: string;
  fallbackUsed?: boolean;
}

const DEFAULT_FALLBACK_SOURCES: DataSource[] = ['sample'];

/**
 * タイムスタンプベースの差分取得を使用するChatRepository
 */
export class ChatRepository {
  private readonly conversationId: string;
  private currentData: ChatData | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(conversationId?: string) {
    this.conversationId = conversationId ?? config.conversationId;
    // 初期化を非同期で開始（loadChatDataで自動的に呼ばれる）
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
        this.currentData = await loadChatDataCache(this.conversationId);
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
   * 初回ロード用（フォールバック対応）
   */
  async loadChatData(options: LoadChatDataOptions = {}): Promise<LoadChatDataResult> {
    // 初回はIndexedDBからキャッシュを復元
    await this.ensureInitialized();

    const source = options.source ?? dataSourceManager.getCurrentSource();
    const fallbackSources = this.buildFallbackSources(source, options.fallbackSources);

    try {
      return await this.loadFromSource(source);
    } catch (primaryError) {
      console.error(`[ChatRepository] Primary source '${source}' failed:`, primaryError);
      return await this.handleLoadError(primaryError, fallbackSources, source);
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

    return DataSourceFactory.create(source, this.conversationId);
  }

  private async loadFromSource(source: DataSource): Promise<LoadChatDataResult> {
    const dataSource = this.resolveDataSource(source);
    const fetchedData = await dataSource.loadChatData();

    // 既存データとマージ（差分取得の場合）
    let mergedData = fetchedData;
    if (this.currentData) {
      const mergedMessages = { ...this.currentData.messages, ...fetchedData.messages };

      // deleted=true のメッセージを除外
      const filteredMessages: typeof mergedMessages = {};
      Object.entries(mergedMessages).forEach(([id, msg]) => {
        if (!msg.deleted) {
          filteredMessages[id] = msg;
        }
      });

      mergedData = {
        messages: filteredMessages,
        lines: [...this.currentData.lines, ...fetchedData.lines].reduce((acc, line) => {
          const existing = acc.find(l => l.id === line.id);
          if (existing) {
            return acc.map(l => l.id === line.id ? line : l);
          }
          return [...acc, line];
        }, [] as typeof fetchedData.lines),
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

    // マージしたデータをメモリとIndexedDBにキャッシュ
    this.currentData = mergedData;
    await saveChatDataCache(this.conversationId, mergedData);

    return {
      data: mergedData,
      source,
      fromCache: false
    };
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
      await saveChatDataCache(this.conversationId, this.currentData);
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

    // 作成したメッセージを再取得してキャッシュに追加
    // （loadChatDataを呼んで差分取得することで、updatedAtなどの値も正確に取得）
    await this.loadChatData();

    return messageId;
  }

  /**
   * メッセージを更新し、キャッシュを即座に更新
   */
  async updateMessage(id: string, updates: Parameters<IDataSource['updateMessage']>[1]): Promise<void> {
    await this.ensureInitialized();

    const dataSource = dataSourceManager.getDataSource();
    await dataSource.updateMessage(id, updates);

    // 更新したメッセージを再取得してキャッシュに反映
    await this.loadChatData();
  }

  /**
   * 全てのキャッシュをクリア（ChatDataとタイムスタンプ）
   */
  async clearAllCache(): Promise<void> {
    this.currentData = null;
    this.initPromise = null; // 初期化フラグをリセット
    await Promise.all([
      clearChatDataCache(this.conversationId),
      clearAllLastFetchTimestamps(this.conversationId)
    ]);
    console.log('[ChatRepository] Cleared all caches (data + timestamps)');
  }
}

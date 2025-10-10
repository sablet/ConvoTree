'use client';

import { config } from '@/lib/config';
import type { ChatData, DataSource } from '@/lib/data-source/base';
import { DataSourceFactory, dataSourceManager } from '@/lib/data-source/factory';
import type { IDataSource } from '@/lib/data-source/base';
import { localStorageCache } from '@/lib/data-source/cache';

export interface LoadChatDataOptions {
  source?: DataSource;
  fallbackSources?: DataSource[];
  preferCache?: boolean;
  allowCacheFallback?: boolean;
}

export interface LoadChatDataResult {
  data: ChatData;
  source: DataSource;
  fromCache: boolean;
  cacheTimestamp: number | null;
  error?: string;
  fallbackUsed?: boolean;
}

const DEFAULT_FALLBACK_SOURCES: DataSource[] = ['cache', 'sample'];

export class ChatRepository {
  private readonly conversationId: string;
  private readonly cache = localStorageCache;

  constructor(conversationId?: string) {
    this.conversationId = conversationId ?? config.conversationId;
  }

  async loadChatData(options: LoadChatDataOptions = {}): Promise<LoadChatDataResult> {
    const source = options.source ?? dataSourceManager.getCurrentSource();
    const fallbackSources = this.buildFallbackSources(source, options.fallbackSources);
    const preferCache = options.preferCache ?? false;
    const allowCacheFallback = options.allowCacheFallback ?? true;

    if (preferCache) {
      const cached = await this.loadFromCacheInternal();
      if (cached) {
        return cached;
      }
    }

    try {
      return await this.loadFromSource(source);
    } catch (primaryError) {
      console.error(`[ChatRepository] Primary source '${source}' failed:`, primaryError);
      return await this.handleLoadError(primaryError, allowCacheFallback, fallbackSources, source);
    }
  }

  private async handleLoadError(
    primaryError: unknown,
    allowCacheFallback: boolean,
    fallbackSources: DataSource[],
    originalSource: DataSource
  ): Promise<LoadChatDataResult> {
    const errorMessage = primaryError instanceof Error ? primaryError.message : String(primaryError);

    if (allowCacheFallback) {
      const cached = await this.loadFromCacheInternal();
      if (cached) {
        console.warn(`[ChatRepository] Using cache fallback. Original error from '${originalSource}': ${errorMessage}`);
        return {
          ...cached,
          error: errorMessage,
          fallbackUsed: true
        };
      }
    }

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

  async loadCacheOnly(): Promise<LoadChatDataResult | null> {
    return this.loadFromCacheInternal();
  }

  async clearCache(): Promise<void> {
    this.cache.clear();
  }

  getCacheTimestamp(): number | null {
    return this.cache.getCacheTimestamp();
  }

  hasCache(): boolean {
    return this.cache.hasCache();
  }

  private buildFallbackSources(source: DataSource, overrides?: DataSource[]): DataSource[] {
    const candidates = overrides ?? DEFAULT_FALLBACK_SOURCES;
    return candidates.filter((candidate) => candidate !== source);
  }

  private async loadFromCacheInternal(): Promise<LoadChatDataResult | null> {
    const cached = await this.cache.load();
    if (!cached) {
      return null;
    }

    return {
      data: cached,
      source: 'cache',
      fromCache: true,
      cacheTimestamp: this.cache.getCacheTimestamp()
    };
  }

  private resolveDataSource(source: DataSource): IDataSource {
    if (source === dataSourceManager.getCurrentSource()) {
      return dataSourceManager.getDataSource();
    }

    return DataSourceFactory.create(source, this.conversationId);
  }

  private async loadFromSource(source: DataSource): Promise<LoadChatDataResult> {
    if (source === 'cache') {
      const cached = await this.loadFromCacheInternal();
      if (!cached) {
        throw new Error('キャッシュデータがありません');
      }
      return cached;
    }

    const dataSource = this.resolveDataSource(source);
    const data = await dataSource.loadChatData();

    try {
      await this.cache.save(data);
    } catch (cacheError) {
      console.warn('[ChatRepository] Cache save failed, but continuing with data from source:', cacheError);
    }

    return {
      data,
      source,
      fromCache: false,
      cacheTimestamp: this.cache.getCacheTimestamp()
    };
  }
}

export const chatRepository = new ChatRepository();

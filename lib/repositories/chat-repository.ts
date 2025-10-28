'use client';

import { config } from '@/lib/config';
import type { ChatData, DataSource } from '@/lib/data-source/base';
import { DataSourceFactory, dataSourceManager } from '@/lib/data-source/factory';
import type { IDataSource } from '@/lib/data-source/base';
import { FirestoreRealtimeListener } from '@/lib/data-source/firestore-realtime';
import type { ChatDataChangeHandler, ErrorHandler } from '@/lib/data-source/firestore-realtime';

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
 * リアルタイムリスナーベースのChatRepository
 * LocalStorageを使用せず、Firestoreの永続化キャッシュのみを使用
 */
export class ChatRepository {
  private readonly conversationId: string;
  private realtimeListener: FirestoreRealtimeListener | null = null;
  private currentData: ChatData | null = null;
  private dataChangeCallbacks: Set<ChatDataChangeHandler> = new Set();

  constructor(conversationId?: string) {
    this.conversationId = conversationId ?? config.conversationId;
  }

  /**
   * リアルタイムリスナーを開始
   */
  startRealtimeListener(
    onChange: ChatDataChangeHandler,
    onError?: ErrorHandler
  ): void {
    if (this.realtimeListener) {
      console.debug('[ChatRepository] Listener already started, reusing existing listener');
      return;
    }

    console.debug('[ChatRepository] Starting new realtime listener');
    this.realtimeListener = new FirestoreRealtimeListener(this.conversationId);

    const wrappedOnChange: ChatDataChangeHandler = (data, fromCache) => {
      this.currentData = data;

      // すべてのコールバックを実行
      this.dataChangeCallbacks.forEach(callback => {
        try {
          callback(data, fromCache);
        } catch (error) {
          console.error('[ChatRepository] Error in data change callback:', error);
        }
      });

      // 主要なonChangeコールバックも実行
      onChange(data, fromCache);
    };

    this.realtimeListener.start(wrappedOnChange, onError);
  }

  /**
   * リアルタイムリスナーを停止
   */
  stopRealtimeListener(): void {
    if (this.realtimeListener) {
      console.debug('[ChatRepository] Stopping realtime listener');
      this.realtimeListener.stop();
      this.realtimeListener = null;
    }
    this.dataChangeCallbacks.clear();
    this.currentData = null;
  }

  /**
   * データ変更コールバックを登録
   */
  subscribeToDataChanges(callback: ChatDataChangeHandler): () => void {
    this.dataChangeCallbacks.add(callback);

    // 既にデータがある場合は即座にコールバックを実行
    if (this.currentData) {
      callback(this.currentData, false);
    }

    // unsubscribe関数を返す
    return () => {
      this.dataChangeCallbacks.delete(callback);
    };
  }

  /**
   * 現在のデータを取得（リアルタイムリスナーから）
   */
  getCurrentData(): ChatData | null {
    if (this.realtimeListener) {
      return this.realtimeListener.getCurrentData();
    }
    return this.currentData;
  }

  /**
   * 初回ロード用（フォールバック対応）
   */
  async loadChatData(options: LoadChatDataOptions = {}): Promise<LoadChatDataResult> {
    const source = options.source ?? dataSourceManager.getCurrentSource();
    const fallbackSources = this.buildFallbackSources(source, options.fallbackSources);

    // Firestoreの場合はリアルタイムリスナーを使用
    if (source === 'firestore') {
      // 既にリスナーが起動していてデータがある場合は即座に返す
      if (this.realtimeListener && this.currentData) {
        console.debug('[ChatRepository] Listener already running, returning cached data');
        return Promise.resolve({
          data: this.currentData,
          source: 'firestore',
          fromCache: true
        });
      }

      return new Promise<LoadChatDataResult>((resolve, reject) => {
        let resolved = false;
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        let unsubscribe: (() => void) | undefined;

        const cleanup = () => {
          if (unsubscribe) {
            unsubscribe();
            unsubscribe = undefined;
          }
          if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
            timeoutId = undefined;
          }
        };

        const onError: ErrorHandler = (error) => {
          if (!resolved) {
            resolved = true;
            cleanup();
            reject(error);
          }
        };

        unsubscribe = this.subscribeToDataChanges((data, fromCache) => {
          if (!resolved && !fromCache) {
            // サーバーからの初回データ取得完了
            resolved = true;
            cleanup();
            resolve({
              data,
              source: 'firestore',
              fromCache: false
            });
          }
        });

        if (resolved) {
          cleanup();
          return;
        }

        // Firestoreリスナー起動（既存リスナーがある場合は再利用）
        this.startRealtimeListener(() => {}, onError);

        // タイムアウト設定（10秒）
        timeoutId = setTimeout(() => {
          if (!resolved) {
            const currentData = this.getCurrentData();
            if (currentData && Object.keys(currentData.messages).length > 0) {
              // キャッシュデータがある場合はそれを返す
              resolved = true;
              cleanup();
              resolve({
                data: currentData,
                source: 'firestore',
                fromCache: true
              });
            } else {
              resolved = true;
              cleanup();
              reject(new Error('Firestore data load timeout'));
            }
          }
        }, 10000);
      }).catch(async (primaryError) => {
        console.error(`[ChatRepository] Firestore failed:`, primaryError);
        return await this.handleLoadError(primaryError, fallbackSources, source);
      });
    }

    // その他のデータソース（サンプルデータなど）
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
    const data = await dataSource.loadChatData();

    return {
      data,
      source,
      fromCache: false
    };
  }
}

export const chatRepository = new ChatRepository();

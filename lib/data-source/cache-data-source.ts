'use client';

import type { Message, Line, Tag, TagGroup } from '@/lib/types';
import type { IDataSource, ChatData, MessageInput } from './base';
import { localStorageCache } from './cache';

export class CacheDataSource implements IDataSource {
  async loadChatData(): Promise<ChatData> {
    const cached = await localStorageCache.load();

    if (!cached) {
      throw new Error('キャッシュデータが見つかりません。先にFirestoreからデータを読み込んでください。');
    }

    return cached;
  }

  async createMessage(_message: MessageInput): Promise<string> {
    throw new Error('キャッシュモードでは書き込み操作はサポートされていません');
  }

  async updateMessage(_id: string, _updates: Partial<Message>): Promise<void> {
    throw new Error('キャッシュモードでは書き込み操作はサポートされていません');
  }

  async deleteMessage(_id: string): Promise<void> {
    throw new Error('キャッシュモードでは書き込み操作はサポートされていません');
  }

  async createTagGroup(_tagGroup: Omit<TagGroup, 'id'>): Promise<string> {
    throw new Error('キャッシュモードでは書き込み操作はサポートされていません');
  }

  async updateTagGroup(_id: string, _updates: Partial<TagGroup>): Promise<void> {
    throw new Error('キャッシュモードでは書き込み操作はサポートされていません');
  }

  async deleteTagGroup(_id: string, _tagHandlingOption: 'delete' | 'unlink' = 'unlink'): Promise<void> {
    throw new Error('キャッシュモードでは書き込み操作はサポートされていません');
  }

  async reorderTagGroups(_orderedIds: string[]): Promise<void> {
    throw new Error('キャッシュモードでは書き込み操作はサポートされていません');
  }

  async createLine(_line: Omit<Line, 'id'>): Promise<string> {
    throw new Error('キャッシュモードでは書き込み操作はサポートされていません');
  }

  async updateLine(_id: string, _updates: Partial<Line>): Promise<void> {
    throw new Error('キャッシュモードでは書き込み操作はサポートされていません');
  }

  async deleteLine(_id: string): Promise<void> {
    throw new Error('キャッシュモードでは書き込み操作はサポートされていません');
  }

  async createBranchPoint(_messageId: string): Promise<void> {
    throw new Error('キャッシュモードでは書き込み操作はサポートされていません');
  }

  async addLineToBranchPoint(_messageId: string, _lineId: string): Promise<void> {
    throw new Error('キャッシュモードでは書き込み操作はサポートされていません');
  }

  async removeLineFromBranchPoint(_messageId: string, _lineId: string): Promise<void> {
    throw new Error('キャッシュモードでは書き込み操作はサポートされていません');
  }

  async deleteBranchPoint(_messageId: string): Promise<void> {
    throw new Error('キャッシュモードでは書き込み操作はサポートされていません');
  }

  async linkMessages(_prevMessageId: string, _nextMessageId: string): Promise<void> {
    throw new Error('キャッシュモードでは書き込み操作はサポートされていません');
  }

  async unlinkMessages(_messageId: string): Promise<void> {
    throw new Error('キャッシュモードでは書き込み操作はサポートされていません');
  }

  async moveMessageToLine(_messageId: string, _targetLineId: string, _position?: number): Promise<void> {
    throw new Error('キャッシュモードでは書き込み操作はサポートされていません');
  }

  async createTag(_tag: Omit<Tag, 'id'>): Promise<string> {
    throw new Error('キャッシュモードでは書き込み操作はサポートされていません');
  }

  async updateTag(_id: string, _updates: Partial<Tag>): Promise<void> {
    throw new Error('キャッシュモードでは書き込み操作はサポートされていません');
  }

  async deleteTag(_id: string): Promise<void> {
    throw new Error('キャッシュモードでは書き込み操作はサポートされていません');
  }

  async createMessageWithLineUpdate(
    _messageData: MessageInput,
    _lineId: string,
    _prevMessageId?: string
  ): Promise<string> {
    throw new Error('キャッシュモードでは書き込み操作はサポートされていません');
  }
}

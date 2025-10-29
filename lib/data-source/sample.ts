'use client';

import type { Message, Line, Tag, TagGroup } from '@/lib/types';
import type { IDataSource, ChatData, MessageInput } from './base';

export class SampleDataSource implements IDataSource {
  async loadChatData(): Promise<ChatData> {
    try {
      const response = await fetch('/data/chat-sample.json');
      const data = await response.json();

      return {
        messages: data.messages || {},
        lines: data.lines || [],
        branchPoints: data.branchPoints || {},
        tags: data.tags || {},
        tagGroups: data.tagGroups || {},
      };
    } catch (error) {
      console.error('❌ Failed to load sample data:', error);
      throw error;
    }
  }

  async createMessage(_message: MessageInput): Promise<string> {
    throw new Error('Sample data source is read-only');
  }

  async updateMessage(_id: string, _updates: Partial<Message>): Promise<void> {
    throw new Error('Sample data source is read-only');
  }

  async deleteMessage(_id: string): Promise<void> {
    throw new Error('Sample data source is read-only');
  }

  async createLine(_line: Omit<Line, 'id'>): Promise<string> {
    throw new Error('Sample data source is read-only');
  }

  async updateLine(_id: string, _updates: Partial<Line>): Promise<void> {
    throw new Error('Sample data source is read-only');
  }

  async deleteLine(_id: string): Promise<void> {
    throw new Error('Sample data source is read-only');
  }

  async createTag(_tag: Omit<Tag, 'id'>): Promise<string> {
    throw new Error('Sample data source is read-only');
  }

  async updateTag(_id: string, _updates: Partial<Tag>): Promise<void> {
    throw new Error('Sample data source is read-only');
  }

  async deleteTag(_id: string): Promise<void> {
    throw new Error('Sample data source is read-only');
  }

  async createTagGroup(_tagGroup: Omit<TagGroup, 'id'>): Promise<string> {
    throw new Error('Sample data source is read-only');
  }

  async updateTagGroup(_id: string, _updates: Partial<TagGroup>): Promise<void> {
    throw new Error('Sample data source is read-only');
  }

  async deleteTagGroup(_id: string, _tagHandlingOption?: 'delete' | 'unlink'): Promise<void> {
    throw new Error('Sample data source is read-only');
  }

  async reorderTagGroups(_orderedIds: string[]): Promise<void> {
    throw new Error('Sample data source is read-only');
  }

  async createBranchPoint(_messageId: string): Promise<void> {
    throw new Error('Sample data source is read-only');
  }

  async addLineToBranchPoint(_messageId: string, _lineId: string): Promise<void> {
    throw new Error('Sample data source is read-only');
  }

  async removeLineFromBranchPoint(_messageId: string, _lineId: string): Promise<void> {
    throw new Error('Sample data source is read-only');
  }

  async deleteBranchPoint(_messageId: string): Promise<void> {
    throw new Error('Sample data source is read-only');
  }

  async linkMessages(_prevMessageId: string, _nextMessageId: string): Promise<void> {
    throw new Error('Sample data source is read-only');
  }

  async unlinkMessages(_messageId: string): Promise<void> {
    throw new Error('Sample data source is read-only');
  }

  async moveMessageToLine(_messageId: string, _targetLineId: string, _position?: number): Promise<void> {
    throw new Error('Sample data source is read-only');
  }

  async createMessageWithLineUpdate(
    _messageData: MessageInput,
    _lineId: string,
    _prevMessageId?: string
  ): Promise<string> {
    throw new Error('Sample data source is read-only');
  }
}

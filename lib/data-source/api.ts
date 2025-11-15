'use client';

import type { Message, Line, Tag, TagGroup } from '@/lib/types';
import type { IDataSource, ChatData, MessageInput } from './base';

export class ApiDataSource implements IDataSource {
  private async fetchApi(path: string, options?: Parameters<typeof fetch>[1]) {
    const response = await fetch(path, options);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'API request failed');
    }
    return response.json();
  }

  async loadChatData(since?: Date): Promise<ChatData> {
    const url = since
      ? `/api/chat/data?since=${since.toISOString()}`
      : '/api/chat/data';
    return this.fetchApi(url);
  }

  async createMessage(message: MessageInput): Promise<string> {
    const { id } = await this.fetchApi('/api/chat/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
    return id;
  }

  async updateMessage(
    id: string,
    updates: Partial<Omit<Message, 'timestamp'>> & { timestamp?: string | Date }
  ): Promise<void> {
    await this.fetchApi(`/api/chat/messages/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
  }

  async deleteMessage(id: string): Promise<void> {
    await this.fetchApi(`/api/chat/messages/${id}`, {
      method: 'DELETE',
    });
  }

  async createLine(line: Omit<Line, 'id'>): Promise<string> {
    const { id } = await this.fetchApi('/api/chat/lines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(line),
    });
    return id;
  }

  async updateLine(id: string, updates: Partial<Line>): Promise<void> {
    await this.fetchApi(`/api/chat/lines/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
  }

  async deleteLine(id: string): Promise<void> {
    await this.fetchApi(`/api/chat/lines/${id}`, {
      method: 'DELETE',
    });
  }

  async createTag(tag: Omit<Tag, 'id'>): Promise<string> {
    const { id } = await this.fetchApi('/api/chat/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tag),
    });
    return id;
  }

  async updateTag(id: string, updates: Partial<Tag>): Promise<void> {
    await this.fetchApi(`/api/chat/tags/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
  }

  async deleteTag(id: string): Promise<void> {
    await this.fetchApi(`/api/chat/tags/${id}`, {
      method: 'DELETE',
    });
  }

  async createTagGroup(tagGroup: Omit<TagGroup, 'id'>): Promise<string> {
    const { id } = await this.fetchApi('/api/chat/tag-groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tagGroup),
    });
    return id;
  }

  async updateTagGroup(id: string, updates: Partial<TagGroup>): Promise<void> {
    await this.fetchApi(`/api/chat/tag-groups/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
  }

  async deleteTagGroup(id: string, tagHandlingOption?: 'delete' | 'unlink'): Promise<void> {
    await this.fetchApi(`/api/chat/tag-groups/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tagHandlingOption }),
    });
  }

  async reorderTagGroups(orderedIds: string[]): Promise<void> {
    await this.fetchApi('/api/chat/tag-groups/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds }),
    });
  }

  async createMessageWithLineUpdate(
    messageData: MessageInput,
    lineId: string,
    prevMessageId?: string
  ): Promise<string> {
    const { id } = await this.fetchApi('/api/chat/messages/with-line', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageData, lineId, prevMessageId }),
    });
    return id;
  }
}

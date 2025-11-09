'use client';

import { collection, getDocs, doc, getDoc, serverTimestamp, runTransaction, query, where, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { CONVERSATIONS_COLLECTION, LINES_SUBCOLLECTION } from '@/lib/firestore-constants';
import type { Message, Line, Tag, TagGroup } from '@/lib/types';
import type { IDataSource, ChatData, MessageInput } from './base';
import { FirestoreMessageOperations } from './firestore-message';
import { FirestoreTagOperations } from './firestore-tag';
import { FirestoreLineOperations } from './firestore-line';
import { normalizeDateValue } from './firestore-utils';
import {
  getAllLastFetchTimestamps,
  saveLastFetchTimestamp
} from './indexed-db-timestamp-storage';

export class FirestoreDataSource implements IDataSource {
  private conversationId: string;
  private messageOps: FirestoreMessageOperations;
  private tagOps: FirestoreTagOperations;
  private lineOps: FirestoreLineOperations;

  constructor(conversationId: string) {
    this.conversationId = conversationId;
    this.messageOps = new FirestoreMessageOperations(conversationId);
    this.tagOps = new FirestoreTagOperations(conversationId);
    this.lineOps = new FirestoreLineOperations(conversationId);
  }

  private async fetchMessages(lastFetchTime: Date | null): Promise<Record<string, Message>> {
    const messagesRef = collection(db, 'conversations', this.conversationId, 'messages');
    const messagesQuery = lastFetchTime
      ? query(messagesRef, where('updatedAt', '>', Timestamp.fromDate(lastFetchTime)))
      : messagesRef;

    const messagesSnapshot = await getDocs(messagesQuery);
    const messages: Record<string, Message> = {};

    if (lastFetchTime) {
      console.log(`📊 [Firestore Query] Messages: ${messagesSnapshot.size} documents read (incremental fetch since ${lastFetchTime.toISOString()})`);
    } else {
      console.log(`📊 [Firestore Query] Messages: ${messagesSnapshot.size} documents read (initial full fetch)`);
    }

    messagesSnapshot.forEach((doc) => {
      const data = doc.data();
      const timestampValue = normalizeDateValue(data.timestamp)
        ?? normalizeDateValue(data.createdAt)
        ?? normalizeDateValue(data.created_at)
        ?? new Date();
      const updatedAtValue = normalizeDateValue(data.updatedAt) ?? normalizeDateValue(data.updated_at);

      const deletedAtValue = normalizeDateValue(data.deletedAt);

      messages[doc.id] = {
        id: doc.id,
        content: data.content || '',
        timestamp: timestampValue,
        ...(updatedAtValue ? { updatedAt: updatedAtValue } : {}),
        lineId: data.lineId || '',
        tags: data.tags,
        hasBookmark: data.hasBookmark,
        author: data.author,
        images: data.images,
        type: data.type,
        metadata: data.metadata,
        ...(data.deleted !== undefined ? { deleted: data.deleted } : {}),
        ...(deletedAtValue ? { deletedAt: deletedAtValue } : {})
      };
    });

    await saveLastFetchTimestamp(this.conversationId, 'messages');
    return messages;
  }

  private async fetchLines(lastFetchTime: Date | null): Promise<Line[]> {
    const linesRef = collection(db, 'conversations', this.conversationId, 'lines');
    const linesQuery = lastFetchTime
      ? query(linesRef, where('updatedAt', '>', Timestamp.fromDate(lastFetchTime)))
      : linesRef;

    const linesSnapshot = await getDocs(linesQuery);
    const lines: Line[] = [];

    if (lastFetchTime) {
      console.log(`📊 [Firestore Query] Lines: ${linesSnapshot.size} documents read (incremental fetch since ${lastFetchTime.toISOString()})`);
    } else {
      console.log(`📊 [Firestore Query] Lines: ${linesSnapshot.size} documents read (initial full fetch)`);
    }

    linesSnapshot.forEach((doc) => {
      const data = doc.data();
      lines.push({
        id: doc.id,
        name: data.name || '',
        parent_line_id: data.parent_line_id ?? null,
        tagIds: data.tagIds || [],
        created_at: data.created_at || data.createdAt?.toDate?.()?.toISOString() || '',
        updated_at: data.updated_at || data.updatedAt?.toDate?.()?.toISOString() || ''
      });
    });

    await saveLastFetchTimestamp(this.conversationId, 'lines');
    return lines;
  }


  private async fetchTags(lastFetchTime: Date | null): Promise<Record<string, Tag>> {
    const tagsRef = collection(db, 'conversations', this.conversationId, 'tags');
    const tagsQuery = lastFetchTime
      ? query(tagsRef, where('updatedAt', '>', Timestamp.fromDate(lastFetchTime)))
      : tagsRef;

    const tagsSnapshot = await getDocs(tagsQuery);
    const tags: Record<string, Tag> = {};

    if (lastFetchTime) {
      console.log(`📊 [Firestore Query] Tags: ${tagsSnapshot.size} documents read (incremental fetch since ${lastFetchTime.toISOString()})`);
    } else {
      console.log(`📊 [Firestore Query] Tags: ${tagsSnapshot.size} documents read (initial full fetch)`);
    }

    tagsSnapshot.forEach((doc) => {
      const data = doc.data();
      tags[doc.id] = {
        id: doc.id,
        name: data.name || '',
        color: data.color,
        groupId: data.groupId
      };
    });

    await saveLastFetchTimestamp(this.conversationId, 'tags');
    return tags;
  }

  private async fetchTagGroups(lastFetchTime: Date | null): Promise<Record<string, TagGroup>> {
    const tagGroupsRef = collection(db, 'conversations', this.conversationId, 'tagGroups');
    const tagGroupsQuery = lastFetchTime
      ? query(tagGroupsRef, where('updatedAt', '>', Timestamp.fromDate(lastFetchTime)))
      : tagGroupsRef;

    const tagGroupsSnapshot = await getDocs(tagGroupsQuery);
    const tagGroups: Record<string, TagGroup> = {};

    if (lastFetchTime) {
      console.log(`📊 [Firestore Query] TagGroups: ${tagGroupsSnapshot.size} documents read (incremental fetch since ${lastFetchTime.toISOString()})`);
    } else {
      console.log(`📊 [Firestore Query] TagGroups: ${tagGroupsSnapshot.size} documents read (initial full fetch)`);
    }

    tagGroupsSnapshot.forEach((doc) => {
      const data = doc.data();
      tagGroups[doc.id] = {
        id: doc.id,
        name: data.name || '',
        color: data.color || '',
        order: data.order || 0
      };
    });

    await saveLastFetchTimestamp(this.conversationId, 'tagGroups');
    return tagGroups;
  }

  async loadChatData(): Promise<ChatData> {
    try {
      if (!this.conversationId) {
        throw new Error('NEXT_PUBLIC_CONVERSATION_ID環境変数が設定されていません');
      }

      const conversationRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId);
      const conversationDoc = await getDoc(conversationRef);

      if (!conversationDoc.exists()) {
        throw new Error(`Conversation ${this.conversationId} not found in Firestore`);
      }

      const lastFetchTimestamps = await getAllLastFetchTimestamps(this.conversationId);
      const isInitialFetch = !lastFetchTimestamps.messages && !lastFetchTimestamps.lines;

      if (isInitialFetch) {
        console.log('📊 [Firestore] Starting initial full fetch...');
      } else {
        console.log('📊 [Firestore] Starting incremental fetch...');
      }

      const messages = await this.fetchMessages(lastFetchTimestamps.messages);
      const lines = await this.fetchLines(lastFetchTimestamps.lines);
      const tags = await this.fetchTags(lastFetchTimestamps.tags);
      const tagGroups = await this.fetchTagGroups(lastFetchTimestamps.tagGroups);

      const totalDocuments = Object.keys(messages).length + lines.length +
                             Object.keys(tags).length + Object.keys(tagGroups).length;

      console.log(`📊 [Firestore] Total documents read in this fetch: ${totalDocuments}`);

      const chatData: ChatData = {
        messages,
        lines,
        tags,
        tagGroups
      };

      return chatData;

    } catch (error) {
      console.error('❌ Failed to load from Firestore:', error);
      throw error;
    }
  }

  async createMessage(message: MessageInput): Promise<string> {
    return this.messageOps.createMessage(message);
  }

  async updateMessage(id: string, updates: Partial<Message>): Promise<void> {
    return this.messageOps.updateMessage(id, updates);
  }

  async deleteMessage(id: string): Promise<void> {
    return this.messageOps.deleteMessage(id);
  }

  async createTagGroup(tagGroup: Omit<TagGroup, 'id'>): Promise<string> {
    return this.tagOps.createTagGroup(tagGroup);
  }

  async updateTagGroup(id: string, updates: Partial<TagGroup>): Promise<void> {
    return this.tagOps.updateTagGroup(id, updates);
  }

  async deleteTagGroup(id: string, tagHandlingOption: 'delete' | 'unlink' = 'unlink'): Promise<void> {
    return this.tagOps.deleteTagGroup(id, tagHandlingOption);
  }

  async reorderTagGroups(orderedIds: string[]): Promise<void> {
    return this.tagOps.reorderTagGroups(orderedIds);
  }

  async createLine(line: Omit<Line, 'id'>): Promise<string> {
    return this.lineOps.createLine(line);
  }

  async updateLine(id: string, updates: Partial<Line>): Promise<void> {
    return this.lineOps.updateLine(id, updates);
  }

  async deleteLine(id: string): Promise<void> {
    return this.lineOps.deleteLine(id);
  }

  async createTag(tag: Omit<Tag, 'id'>): Promise<string> {
    return this.tagOps.createTag(tag);
  }

  async updateTag(id: string, updates: Partial<Tag>): Promise<void> {
    return this.tagOps.updateTag(id, updates);
  }

  async deleteTag(id: string): Promise<void> {
    return this.tagOps.deleteTag(id);
  }

  async createMessageWithLineUpdate(
    messageData: MessageInput,
    lineId: string,
    _prevMessageId?: string
  ): Promise<string> {
    try {
      return await runTransaction(db, async (transaction) => {
        const lineRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, LINES_SUBCOLLECTION, lineId);
        const lineDoc = await transaction.get(lineRef);

        if (!lineDoc.exists()) {
          throw new Error(`Line with ID ${lineId} not found`);
        }

        const messagesRef = collection(db, 'conversations', this.conversationId, 'messages');
        const newMessageRef = doc(messagesRef);

        const newMessageData = {
          ...messageData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };

        transaction.set(newMessageRef, newMessageData);

        const lineUpdateData: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
          updatedAt: serverTimestamp()
        };

        transaction.update(lineRef, lineUpdateData);

        return newMessageRef.id;
      });

    } catch (error) {
      console.error('❌ Failed to create message with line update:', error);
      throw error;
    }
  }

}

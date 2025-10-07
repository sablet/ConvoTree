'use client';

import { collection, getDocs, doc, getDoc, serverTimestamp, runTransaction, type Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { CONVERSATIONS_COLLECTION, MESSAGES_SUBCOLLECTION, LINES_SUBCOLLECTION } from '@/lib/firestore-constants';
import type { Message, Line, Tag, TagGroup, BranchPoint } from '@/lib/types';
import type { IDataSource, ChatData, MessageInput } from './base';
import { FirestoreMessageOperations } from './firestore-message';
import { FirestoreTagOperations } from './firestore-tag';
import { FirestoreLineOperations } from './firestore-line';
import { FirestoreBranchOperations } from './firestore-branch';

const normalizeDateValue = (value: unknown): Date | undefined => {
  if (!value) {
    return undefined;
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'string') {
    const fromString = new Date(value);
    return Number.isNaN(fromString.getTime()) ? undefined : fromString;
  }

  if (typeof value === 'number') {
    const fromNumber = new Date(value);
    return Number.isNaN(fromNumber.getTime()) ? undefined : fromNumber;
  }

  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const candidate = value as Timestamp;
    if (typeof candidate.toDate === 'function') {
      const fromTimestamp = candidate.toDate();
      return Number.isNaN(fromTimestamp.getTime()) ? undefined : fromTimestamp;
    }
    return undefined;
  }

  return undefined;
};

export class FirestoreDataSource implements IDataSource {
  private conversationId: string;
  private messageOps: FirestoreMessageOperations;
  private tagOps: FirestoreTagOperations;
  private lineOps: FirestoreLineOperations;
  private branchOps: FirestoreBranchOperations;

  constructor(conversationId: string) {
    this.conversationId = conversationId;
    this.messageOps = new FirestoreMessageOperations(conversationId);
    this.tagOps = new FirestoreTagOperations(conversationId);
    this.lineOps = new FirestoreLineOperations(conversationId);
    this.branchOps = new FirestoreBranchOperations(conversationId, this.messageOps, this.lineOps);
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

      const messagesRef = collection(db, 'conversations', this.conversationId, 'messages');
      const messagesSnapshot = await getDocs(messagesRef);
      const messages: Record<string, Message> = {};
      messagesSnapshot.forEach((doc) => {
        const data = doc.data();
        const timestampValue = normalizeDateValue(data.timestamp)
          ?? normalizeDateValue(data.createdAt)
          ?? normalizeDateValue(data.created_at)
          ?? new Date();
        const updatedAtValue = normalizeDateValue(data.updatedAt) ?? normalizeDateValue(data.updated_at);

        messages[doc.id] = {
          id: doc.id,
          content: data.content || '',
          timestamp: timestampValue,
          ...(updatedAtValue ? { updatedAt: updatedAtValue } : {}),
          lineId: data.lineId || '',
          prevInLine: data.prevInLine,
          nextInLine: data.nextInLine,
          branchFromMessageId: data.branchFromMessageId,
          tags: data.tags,
          hasBookmark: data.hasBookmark,
          author: data.author,
          images: data.images,
          type: data.type,
          metadata: data.metadata
        };
      });

      const linesRef = collection(db, 'conversations', this.conversationId, 'lines');
      const linesSnapshot = await getDocs(linesRef);
      const lines: Line[] = [];
      linesSnapshot.forEach((doc) => {
        const data = doc.data();
        lines.push({
          id: doc.id,
          name: data.name || '',
          messageIds: data.messageIds || [],
          startMessageId: data.startMessageId || '',
          endMessageId: data.endMessageId,
          branchFromMessageId: data.branchFromMessageId,
          tagIds: data.tagIds || [],
          created_at: data.created_at || data.createdAt?.toDate?.()?.toISOString() || '',
          updated_at: data.updated_at || data.updatedAt?.toDate?.()?.toISOString() || ''
        });
      });

      const branchPointsRef = collection(db, 'conversations', this.conversationId, 'branchPoints');
      const branchPointsSnapshot = await getDocs(branchPointsRef);
      const branchPoints: Record<string, BranchPoint> = {};
      branchPointsSnapshot.forEach((doc) => {
        const data = doc.data();
        branchPoints[doc.id] = {
          messageId: data.messageId || doc.id,
          lines: data.lines || []
        };
      });

      const tagsRef = collection(db, 'conversations', this.conversationId, 'tags');
      const tagsSnapshot = await getDocs(tagsRef);
      const tags: Record<string, Tag> = {};
      tagsSnapshot.forEach((doc) => {
        const data = doc.data();
        tags[doc.id] = {
          id: doc.id,
          name: data.name || '',
          color: data.color,
          groupId: data.groupId
        };
      });

      const tagGroupsRef = collection(db, 'conversations', this.conversationId, 'tagGroups');
      const tagGroupsSnapshot = await getDocs(tagGroupsRef);
      const tagGroups: Record<string, TagGroup> = {};
      tagGroupsSnapshot.forEach((doc) => {
        const data = doc.data();
        tagGroups[doc.id] = {
          id: doc.id,
          name: data.name || '',
          color: data.color || '',
          order: data.order || 0
        };
      });

      return {
        messages,
        lines,
        branchPoints,
        tags,
        tagGroups
      };

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

  async createBranchPoint(messageId: string): Promise<void> {
    return this.branchOps.createBranchPoint(messageId);
  }

  async addLineToBranchPoint(messageId: string, lineId: string): Promise<void> {
    return this.branchOps.addLineToBranchPoint(messageId, lineId);
  }

  async removeLineFromBranchPoint(messageId: string, lineId: string): Promise<void> {
    return this.branchOps.removeLineFromBranchPoint(messageId, lineId);
  }

  async deleteBranchPoint(messageId: string): Promise<void> {
    return this.branchOps.deleteBranchPoint(messageId);
  }

  async linkMessages(prevMessageId: string, nextMessageId: string): Promise<void> {
    return this.branchOps.linkMessages(prevMessageId, nextMessageId);
  }

  async unlinkMessages(messageId: string): Promise<void> {
    return this.branchOps.unlinkMessages(messageId);
  }

  async moveMessageToLine(messageId: string, targetLineId: string, position?: number): Promise<void> {
    return this.branchOps.moveMessageToLine(messageId, targetLineId, position);
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
    prevMessageId?: string
  ): Promise<string> {
    try {
      return await runTransaction(db, async (transaction) => {
        const lineRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, LINES_SUBCOLLECTION, lineId);
        const lineDoc = await transaction.get(lineRef);

        let prevMessageDoc = null;
        if (prevMessageId) {
          const prevMessageRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, MESSAGES_SUBCOLLECTION, prevMessageId);
          prevMessageDoc = await transaction.get(prevMessageRef);
        }

        if (!lineDoc.exists()) {
          throw new Error(`Line with ID ${lineId} not found`);
        }

        const lineData = lineDoc.data() as Line;

        const messagesRef = collection(db, 'conversations', this.conversationId, 'messages');
        const newMessageRef = doc(messagesRef);

        const newMessageData = {
          ...messageData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };

        transaction.set(newMessageRef, newMessageData);

        if (prevMessageId && prevMessageDoc && prevMessageDoc.exists()) {
          const prevMessageRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, MESSAGES_SUBCOLLECTION, prevMessageId);
          transaction.update(prevMessageRef, {
            nextInLine: newMessageRef.id,
            updatedAt: serverTimestamp()
          });
        }

        const updatedMessageIds = [...lineData.messageIds, newMessageRef.id];
        const isFirstMessage = lineData.messageIds.length === 0;

        const lineUpdateData: Record<string, unknown> = {
          messageIds: updatedMessageIds,
          endMessageId: newMessageRef.id,
          updated_at: new Date().toISOString(),
          updatedAt: serverTimestamp()
        };

        if (isFirstMessage) {
          lineUpdateData.startMessageId = newMessageRef.id;
        }

        transaction.update(lineRef, lineUpdateData);

        return newMessageRef.id;
      });

    } catch (error) {
      console.error('❌ Failed to create message with line update:', error);
      throw error;
    }
  }

}

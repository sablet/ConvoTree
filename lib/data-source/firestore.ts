'use client';

import { collection, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp, writeBatch, query, where, runTransaction, Transaction, FieldValue, deleteField } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { CONVERSATIONS_COLLECTION, MESSAGES_SUBCOLLECTION, LINES_SUBCOLLECTION, BRANCH_POINTS_SUBCOLLECTION, TAGS_SUBCOLLECTION, TAG_GROUPS_SUBCOLLECTION } from '@/lib/firestore-constants';
import type { Message, Line, Tag, TagGroup, BranchPoint } from '@/lib/types';
import type { IDataSource, ChatData, MessageInput } from './base';

interface MessageWithTimestamp extends Omit<Message, 'id'> {
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

interface BranchPointWithTimestamp {
  messageId: string;
  lines: string[];
  createdAt?: Timestamp | FieldValue;
  updatedAt?: Timestamp | FieldValue;
}

export class FirestoreDataSource implements IDataSource {
  private conversationId: string;

  constructor(conversationId: string) {
    this.conversationId = conversationId;
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
        messages[doc.id] = {
          id: doc.id,
          content: data.content || '',
          timestamp: data.timestamp || '',
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
    try {
      this.validateMessage(message);

      const messagesRef = collection(db, 'conversations', this.conversationId, 'messages');

      const messageData = {
        ...message,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      const docRef = await addDoc(messagesRef, messageData);

      return docRef.id;

    } catch (error) {
      console.error('❌ Failed to create message:', error);
      throw error;
    }
  }

  async updateMessage(id: string, updates: Partial<Message>): Promise<void> {
    try {
      this.validateMessageId(id);
      this.validateMessageUpdates(updates);

      const messageRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, MESSAGES_SUBCOLLECTION, id);

      const messageDoc = await getDoc(messageRef);
      if (!messageDoc.exists()) {
        throw new Error(`Message with ID ${id} not found`);
      }

      const updateData: Record<string, unknown> = {
        updatedAt: serverTimestamp()
      };

      for (const [key, value] of Object.entries(updates)) {
        if (value === null) {
          updateData[key] = deleteField();
        } else if (value !== undefined) {
          if (key === 'metadata' && typeof value === 'object' && value !== null) {
            const cleanedMetadata: Record<string, unknown> = {};
            for (const [metaKey, metaValue] of Object.entries(value as Record<string, unknown>)) {
              if (metaValue !== undefined) {
                cleanedMetadata[metaKey] = metaValue;
              }
            }
            updateData[key] = cleanedMetadata;
          } else {
            updateData[key] = value;
          }
        }
      }

      await updateDoc(messageRef, updateData);

    } catch (error) {
      console.error(`❌ Failed to update message ${id}:`, error);
      throw error;
    }
  }

  async deleteMessage(id: string): Promise<void> {
    try {
      this.validateMessageId(id);

      const messageRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, MESSAGES_SUBCOLLECTION, id);

      const messageDoc = await getDoc(messageRef);
      if (!messageDoc.exists()) {
        throw new Error(`Message with ID ${id} not found`);
      }

      await deleteDoc(messageRef);

    } catch (error) {
      console.error(`❌ Failed to delete message ${id}:`, error);
      throw error;
    }
  }

  async createTagGroup(tagGroup: Omit<TagGroup, 'id'>): Promise<string> {
    try {
      this.validateTagGroup(tagGroup);

      await this.checkTagGroupNameDuplicate(tagGroup.name);

      await this.checkTagGroupOrderDuplicate(tagGroup.order);

      const tagGroupsRef = collection(db, 'conversations', this.conversationId, 'tagGroups');

      const tagGroupData = {
        ...tagGroup,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      const docRef = await addDoc(tagGroupsRef, tagGroupData);

      return docRef.id;

    } catch (error) {
      console.error('❌ Failed to create tag group:', error);
      throw error;
    }
  }

  async updateTagGroup(id: string, updates: Partial<TagGroup>): Promise<void> {
    try {
      this.validateTagGroupId(id);
      this.validateTagGroupUpdates(updates);

      const tagGroupRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, TAG_GROUPS_SUBCOLLECTION, id);

      const tagGroupDoc = await getDoc(tagGroupRef);
      if (!tagGroupDoc.exists()) {
        throw new Error(`TagGroup with ID ${id} not found`);
      }

      if (updates.name) {
        await this.checkTagGroupNameDuplicate(updates.name, id);
      }

      if (updates.order !== undefined) {
        await this.checkTagGroupOrderDuplicate(updates.order, id);
      }

      const updateData = {
        ...updates,
        updatedAt: serverTimestamp()
      };

      await updateDoc(tagGroupRef, updateData);

    } catch (error) {
      console.error(`❌ Failed to update tag group ${id}:`, error);
      throw error;
    }
  }

  async deleteTagGroup(id: string, tagHandlingOption: 'delete' | 'unlink' = 'unlink'): Promise<void> {
    try {
      this.validateTagGroupId(id);

      const tagGroupRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, TAG_GROUPS_SUBCOLLECTION, id);

      const tagGroupDoc = await getDoc(tagGroupRef);
      if (!tagGroupDoc.exists()) {
        throw new Error(`TagGroup with ID ${id} not found`);
      }

      await this.handleRelatedTagsForDeletion(id, tagHandlingOption);

      await deleteDoc(tagGroupRef);

    } catch (error) {
      console.error(`❌ Failed to delete tag group ${id}:`, error);
      throw error;
    }
  }

  async reorderTagGroups(orderedIds: string[]): Promise<void> {
    try {
      if (orderedIds.length === 0) {
        throw new Error('Ordered IDs array cannot be empty');
      }

      const batch = writeBatch(db);

      for (let i = 0; i < orderedIds.length; i++) {
        const tagGroupId = orderedIds[i];
        const tagGroupRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, TAG_GROUPS_SUBCOLLECTION, tagGroupId);

        const tagGroupDoc = await getDoc(tagGroupRef);
        if (!tagGroupDoc.exists()) {
          throw new Error(`TagGroup with ID ${tagGroupId} not found`);
        }

        batch.update(tagGroupRef, {
          order: i,
          updatedAt: serverTimestamp()
        });
      }

      await batch.commit();

    } catch (error) {
      console.error('❌ Failed to reorder tag groups:', error);
      throw error;
    }
  }

  async createLine(line: Omit<Line, 'id'>): Promise<string> {
    try {
      this.validateLine(line);

      return await runTransaction(db, async (transaction) => {
        const linesRef = collection(db, 'conversations', this.conversationId, 'lines');

        await this.checkLineNameDuplicate(line.name);

        if (line.startMessageId) {
          const startMessageRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, MESSAGES_SUBCOLLECTION, line.startMessageId);
          const startMessageDoc = await transaction.get(startMessageRef);
          if (!startMessageDoc.exists()) {
            throw new Error(`Start message with ID ${line.startMessageId} not found`);
          }
        }

        if (line.branchFromMessageId) {
          const branchMessageRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, MESSAGES_SUBCOLLECTION, line.branchFromMessageId);
          const branchMessageDoc = await transaction.get(branchMessageRef);
          if (!branchMessageDoc.exists()) {
            throw new Error(`Branch from message with ID ${line.branchFromMessageId} not found`);
          }
        }

        const lineData = {
          ...line,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };

        const docRef = doc(linesRef);
        transaction.set(docRef, lineData);

        return docRef.id;
      });

    } catch (error) {
      console.error('❌ Failed to create line:', error);
      throw error;
    }
  }

  async updateLine(id: string, updates: Partial<Line>): Promise<void> {
    try {
      this.validateLineId(id);
      this.validateLineUpdates(updates);

      await runTransaction(db, async (transaction) => {
        const lineRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, LINES_SUBCOLLECTION, id);

        const lineDoc = await transaction.get(lineRef);
        if (!lineDoc.exists()) {
          throw new Error(`Line with ID ${id} not found`);
        }

        if (updates.name) {
          await this.checkLineNameDuplicate(updates.name, id);
        }

        if (updates.startMessageId) {
          const startMessageRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, MESSAGES_SUBCOLLECTION, updates.startMessageId);
          const startMessageDoc = await transaction.get(startMessageRef);
          if (!startMessageDoc.exists()) {
            throw new Error(`Start message with ID ${updates.startMessageId} not found`);
          }
        }

        if (updates.branchFromMessageId) {
          const branchMessageRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, MESSAGES_SUBCOLLECTION, updates.branchFromMessageId);
          const branchMessageDoc = await transaction.get(branchMessageRef);
          if (!branchMessageDoc.exists()) {
            throw new Error(`Branch from message with ID ${updates.branchFromMessageId} not found`);
          }
        }

        const updateData = {
          ...updates,
          updated_at: new Date().toISOString(),
          updatedAt: serverTimestamp()
        };

        transaction.update(lineRef, updateData);
      });

    } catch (error) {
      console.error(`❌ Failed to update line ${id}:`, error);
      throw error;
    }
  }

  async deleteLine(id: string): Promise<void> {
    try {
      this.validateLineId(id);

      await runTransaction(db, async (transaction) => {
        const lineRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, LINES_SUBCOLLECTION, id);

        const lineDoc = await transaction.get(lineRef);
        if (!lineDoc.exists()) {
          throw new Error(`Line with ID ${id} not found`);
        }

        const lineData = lineDoc.data() as Line;

        if (lineData.messageIds && lineData.messageIds.length > 0) {
          for (const messageId of lineData.messageIds) {
            const messageRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, MESSAGES_SUBCOLLECTION, messageId);
            const messageDoc = await transaction.get(messageRef);
            if (messageDoc.exists()) {
              transaction.update(messageRef, {
                lineId: null,
                updatedAt: serverTimestamp()
              });
            }
          }
        }

        const branchPointsRef = collection(db, 'conversations', this.conversationId, 'branchPoints');
        const branchPointsSnapshot = await getDocs(query(branchPointsRef, where('lines', 'array-contains', id)));

        branchPointsSnapshot.forEach((branchPointDoc) => {
          const branchPointData = branchPointDoc.data() as BranchPointWithTimestamp;
          const updatedLines = branchPointData.lines.filter(lineId => lineId !== id);

          if (updatedLines.length === 0) {
            transaction.delete(branchPointDoc.ref);
          } else {
            transaction.update(branchPointDoc.ref, {
              lines: updatedLines,
              updatedAt: serverTimestamp()
            });
          }
        });

        transaction.delete(lineRef);
      });

    } catch (error) {
      console.error(`❌ Failed to delete line ${id}:`, error);
      throw error;
    }
  }

  async createBranchPoint(messageId: string): Promise<void> {
    try {
      this.validateMessageId(messageId);

      await runTransaction(db, async (transaction) => {
        const messageRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, MESSAGES_SUBCOLLECTION, messageId);
        const messageDoc = await transaction.get(messageRef);
        if (!messageDoc.exists()) {
          throw new Error(`Message with ID ${messageId} not found`);
        }

        const branchPointRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, BRANCH_POINTS_SUBCOLLECTION, messageId);
        const existingBranchPoint = await transaction.get(branchPointRef);
        if (existingBranchPoint.exists()) {
          throw new Error(`BranchPoint for message ${messageId} already exists`);
        }

        const branchPointData: BranchPointWithTimestamp = {
          messageId,
          lines: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };

        transaction.set(branchPointRef, branchPointData);
      });

    } catch (error) {
      console.error(`❌ Failed to create branch point for message ${messageId}:`, error);
      throw error;
    }
  }

  async addLineToBranchPoint(messageId: string, lineId: string): Promise<void> {
    try {
      this.validateMessageId(messageId);
      this.validateLineId(lineId);

      await runTransaction(db, async (transaction) => {
        const messageRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, MESSAGES_SUBCOLLECTION, messageId);
        const messageDoc = await transaction.get(messageRef);
        if (!messageDoc.exists()) {
          throw new Error(`Message with ID ${messageId} not found`);
        }

        const lineRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, LINES_SUBCOLLECTION, lineId);
        const lineDoc = await transaction.get(lineRef);
        if (!lineDoc.exists()) {
          throw new Error(`Line with ID ${lineId} not found`);
        }

        const branchPointRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, BRANCH_POINTS_SUBCOLLECTION, messageId);
        const branchPointDoc = await transaction.get(branchPointRef);

        let branchPointData: BranchPoint;

        if (!branchPointDoc.exists()) {
          const newBranchPointData: BranchPointWithTimestamp = {
            messageId,
            lines: [],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          };
          transaction.set(branchPointRef, newBranchPointData);
          branchPointData = {
            messageId,
            lines: []
          };
        } else {
          branchPointData = branchPointDoc.data() as BranchPoint;
        }

        if (branchPointData.lines.includes(lineId)) {
          throw new Error(`Line ${lineId} is already in branch point ${messageId}`);
        }

        const updatedLines = [...branchPointData.lines, lineId];

        transaction.update(branchPointRef, {
          lines: updatedLines,
          updatedAt: serverTimestamp()
        });
      });

    } catch (error) {
      console.error(`❌ Failed to add line ${lineId} to branch point ${messageId}:`, error);
      throw error;
    }
  }

  async removeLineFromBranchPoint(messageId: string, lineId: string): Promise<void> {
    try {
      this.validateMessageId(messageId);
      this.validateLineId(lineId);

      await runTransaction(db, async (transaction) => {
        const branchPointRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, BRANCH_POINTS_SUBCOLLECTION, messageId);
        const branchPointDoc = await transaction.get(branchPointRef);
        if (!branchPointDoc.exists()) {
          throw new Error(`BranchPoint for message ${messageId} not found`);
        }

        const branchPointData = branchPointDoc.data() as BranchPoint;

        if (!branchPointData.lines.includes(lineId)) {
          throw new Error(`Line ${lineId} is not in branch point ${messageId}`);
        }

        const updatedLines = branchPointData.lines.filter(id => id !== lineId);

        if (updatedLines.length === 0) {
          transaction.delete(branchPointRef);
        } else {
          transaction.update(branchPointRef, {
            lines: updatedLines,
            updatedAt: serverTimestamp()
          });
        }
      });

    } catch (error) {
      console.error(`❌ Failed to remove line ${lineId} from branch point ${messageId}:`, error);
      throw error;
    }
  }

  async deleteBranchPoint(messageId: string): Promise<void> {
    try {
      this.validateMessageId(messageId);

      await runTransaction(db, async (transaction) => {
        const branchPointRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, BRANCH_POINTS_SUBCOLLECTION, messageId);
        const branchPointDoc = await transaction.get(branchPointRef);
        if (!branchPointDoc.exists()) {
          throw new Error(`BranchPoint for message ${messageId} not found`);
        }

        const branchPointData = branchPointDoc.data() as BranchPoint;

        if (branchPointData.lines && branchPointData.lines.length > 0) {
          for (const lineId of branchPointData.lines) {
            const lineRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, LINES_SUBCOLLECTION, lineId);
            const lineDoc = await transaction.get(lineRef);
            if (lineDoc.exists()) {
              const lineData = lineDoc.data() as Line;
              if (lineData.branchFromMessageId === messageId) {
                transaction.update(lineRef, {
                  branchFromMessageId: null,
                  updated_at: new Date().toISOString(),
                  updatedAt: serverTimestamp()
                });
              }
            }
          }
        }

        transaction.delete(branchPointRef);
      });

    } catch (error) {
      console.error(`❌ Failed to delete branch point ${messageId}:`, error);
      throw error;
    }
  }

  async linkMessages(prevMessageId: string, nextMessageId: string): Promise<void> {
    try {
      this.validateMessageId(prevMessageId);
      this.validateMessageId(nextMessageId);

      if (prevMessageId === nextMessageId) {
        throw new Error('Cannot link a message to itself');
      }

      await runTransaction(db, async (transaction) => {
        const prevMessageRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, MESSAGES_SUBCOLLECTION, prevMessageId);
        const nextMessageRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, MESSAGES_SUBCOLLECTION, nextMessageId);

        const [prevMessageDoc, nextMessageDoc] = await Promise.all([
          transaction.get(prevMessageRef),
          transaction.get(nextMessageRef)
        ]);

        if (!prevMessageDoc.exists()) {
          throw new Error(`Previous message with ID ${prevMessageId} not found`);
        }
        if (!nextMessageDoc.exists()) {
          throw new Error(`Next message with ID ${nextMessageId} not found`);
        }

        const prevMessageData = prevMessageDoc.data() as MessageWithTimestamp;
        const nextMessageData = nextMessageDoc.data() as MessageWithTimestamp;

        await this.checkForCircularReference(prevMessageId, nextMessageId, transaction);

        if (prevMessageData.lineId !== nextMessageData.lineId) {
          throw new Error('Messages must be in the same line to be linked');
        }

        transaction.update(prevMessageRef, {
          nextInLine: nextMessageId,
          updatedAt: serverTimestamp()
        });

        transaction.update(nextMessageRef, {
          prevInLine: prevMessageId,
          updatedAt: serverTimestamp()
        });

        await this.updateLineMessageIds(prevMessageData.lineId, transaction);
      });

    } catch (error) {
      console.error(`❌ Failed to link messages ${prevMessageId} -> ${nextMessageId}:`, error);
      throw error;
    }
  }

  async unlinkMessages(messageId: string): Promise<void> {
    try {
      this.validateMessageId(messageId);

      await runTransaction(db, async (transaction) => {
        const messageRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, MESSAGES_SUBCOLLECTION, messageId);
        const messageDoc = await transaction.get(messageRef);

        if (!messageDoc.exists()) {
          throw new Error(`Message with ID ${messageId} not found`);
        }

        const messageData = messageDoc.data() as MessageWithTimestamp;

        if (messageData.prevInLine) {
          const prevMessageRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, MESSAGES_SUBCOLLECTION, messageData.prevInLine);
          const prevMessageDoc = await transaction.get(prevMessageRef);
          if (prevMessageDoc.exists()) {
            transaction.update(prevMessageRef, {
              nextInLine: null,
              updatedAt: serverTimestamp()
            });
          }
        }

        if (messageData.nextInLine) {
          const nextMessageRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, MESSAGES_SUBCOLLECTION, messageData.nextInLine);
          const nextMessageDoc = await transaction.get(nextMessageRef);
          if (nextMessageDoc.exists()) {
            transaction.update(nextMessageRef, {
              prevInLine: null,
              updatedAt: serverTimestamp()
            });
          }
        }

        transaction.update(messageRef, {
          prevInLine: null,
          nextInLine: null,
          updatedAt: serverTimestamp()
        });

        if (messageData.lineId) {
          await this.updateLineMessageIds(messageData.lineId, transaction);
        }
      });

    } catch (error) {
      console.error(`❌ Failed to unlink message ${messageId}:`, error);
      throw error;
    }
  }

  async moveMessageToLine(messageId: string, targetLineId: string, position?: number): Promise<void> {
    try {
      this.validateMessageId(messageId);
      this.validateLineId(targetLineId);

      await runTransaction(db, async (transaction) => {
        const messageRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, MESSAGES_SUBCOLLECTION, messageId);
        const messageDoc = await transaction.get(messageRef);

        if (!messageDoc.exists()) {
          throw new Error(`Message with ID ${messageId} not found`);
        }

        const targetLineRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, LINES_SUBCOLLECTION, targetLineId);
        const targetLineDoc = await transaction.get(targetLineRef);

        if (!targetLineDoc.exists()) {
          throw new Error(`Target line with ID ${targetLineId} not found`);
        }

        const messageData = messageDoc.data() as MessageWithTimestamp;
        const oldLineId = messageData.lineId;

        if (oldLineId) {
          await this.unlinkMessageFromCurrentPosition(messageId, transaction);
        }

        transaction.update(messageRef, {
          lineId: targetLineId,
          prevInLine: null,
          nextInLine: null,
          updatedAt: serverTimestamp()
        });

        if (position !== undefined) {
          await this.insertMessageAtPosition(messageId, targetLineId, position, transaction);
        }

        if (oldLineId && oldLineId !== targetLineId) {
          await this.updateLineMessageIds(oldLineId, transaction);
        }
        await this.updateLineMessageIds(targetLineId, transaction);
      });

    } catch (error) {
      console.error(`❌ Failed to move message ${messageId} to line ${targetLineId}:`, error);
      throw error;
    }
  }

  async createTag(tag: Omit<Tag, 'id'>): Promise<string> {
    try {
      this.validateTag(tag);

      await this.checkTagNameDuplicate(tag.name);

      const tagsRef = collection(db, 'conversations', this.conversationId, 'tags');

      const tagData: Record<string, unknown> = {
        name: tag.name,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      if (tag.color !== undefined) {
        tagData.color = tag.color;
      }
      if (tag.groupId !== undefined) {
        tagData.groupId = tag.groupId;
      }

      const docRef = await addDoc(tagsRef, tagData);

      return docRef.id;

    } catch (error) {
      console.error('❌ Failed to create tag:', error);
      throw error;
    }
  }

  async updateTag(id: string, updates: Partial<Tag>): Promise<void> {
    try {
      this.validateTagId(id);
      this.validateTagUpdates(updates);

      const tagRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, TAGS_SUBCOLLECTION, id);

      const tagDoc = await getDoc(tagRef);
      if (!tagDoc.exists()) {
        throw new Error(`Tag with ID ${id} not found`);
      }

      if (updates.name) {
        await this.checkTagNameDuplicate(updates.name, id);
      }

      const updateData: Record<string, unknown> = {
        updatedAt: serverTimestamp()
      };

      if (updates.name !== undefined) {
        updateData.name = updates.name;
      }
      if (updates.color !== undefined) {
        updateData.color = updates.color;
      }
      if (updates.groupId !== undefined) {
        updateData.groupId = updates.groupId;
      }

      await updateDoc(tagRef, updateData);

    } catch (error) {
      console.error(`❌ Failed to update tag ${id}:`, error);
      throw error;
    }
  }

  async deleteTag(id: string): Promise<void> {
    try {
      this.validateTagId(id);

      const tagRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, TAGS_SUBCOLLECTION, id);

      const tagDoc = await getDoc(tagRef);
      if (!tagDoc.exists()) {
        throw new Error(`Tag with ID ${id} not found`);
      }

      await this.removeTagFromAllMessages(id);

      await this.removeTagFromAllLines(id);

      await deleteDoc(tagRef);

    } catch (error) {
      console.error(`❌ Failed to delete tag ${id}:`, error);
      throw error;
    }
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

  private validateMessage(message: MessageInput): void {
    if (!message.content || message.content.trim() === '') {
      throw new Error('Message content is required');
    }

    if (!message.lineId || message.lineId.trim() === '') {
      throw new Error('LineId is required');
    }

    if (!message.timestamp) {
      throw new Error('Timestamp is required');
    }

    const timestampString = message.timestamp instanceof Date ? message.timestamp.toISOString() : message.timestamp;
    if (isNaN(Date.parse(timestampString))) {
      throw new Error('Invalid timestamp format');
    }
  }

  private validateMessageId(id: string): void {
    if (!id || id.trim() === '') {
      throw new Error('Message ID is required');
    }
  }

  private validateMessageUpdates(updates: Partial<Omit<Message, 'timestamp'>> & { timestamp?: string | Date }): void {
    if (Object.keys(updates).length === 0) {
      throw new Error('No updates provided');
    }

    if (updates.content !== undefined && updates.content.trim() === '') {
      throw new Error('Message content cannot be empty');
    }

    if (updates.lineId !== undefined && updates.lineId.trim() === '') {
      throw new Error('LineId cannot be empty');
    }

    if (updates.timestamp !== undefined) {
      const timestampString = updates.timestamp instanceof Date ? updates.timestamp.toISOString() : updates.timestamp;
      if (isNaN(Date.parse(timestampString))) {
        throw new Error('Invalid timestamp format');
      }
    }
  }

  private validateTagGroup(tagGroup: Omit<TagGroup, 'id'>): void {
    if (!tagGroup.name || tagGroup.name.trim() === '') {
      throw new Error('TagGroup name is required');
    }

    if (!tagGroup.color || tagGroup.color.trim() === '') {
      throw new Error('TagGroup color is required');
    }

    if (tagGroup.order < 0) {
      throw new Error('TagGroup order must be non-negative');
    }
  }

  private validateTagGroupId(id: string): void {
    if (!id || id.trim() === '') {
      throw new Error('TagGroup ID is required');
    }
  }

  private validateTagGroupUpdates(updates: Partial<TagGroup>): void {
    if (Object.keys(updates).length === 0) {
      throw new Error('No updates provided');
    }

    if (updates.name !== undefined && updates.name.trim() === '') {
      throw new Error('TagGroup name cannot be empty');
    }

    if (updates.color !== undefined && updates.color.trim() === '') {
      throw new Error('TagGroup color cannot be empty');
    }

    if (updates.order !== undefined && updates.order < 0) {
      throw new Error('TagGroup order must be non-negative');
    }
  }

  private async checkTagGroupNameDuplicate(name: string, excludeId?: string): Promise<void> {
    const tagGroupsRef = collection(db, 'conversations', this.conversationId, 'tagGroups');
    const q = query(tagGroupsRef, where('name', '==', name));
    const querySnapshot = await getDocs(q);

    const duplicates = querySnapshot.docs.filter(doc => doc.id !== excludeId);

    if (duplicates.length > 0) {
      throw new Error(`TagGroup with name "${name}" already exists`);
    }
  }

  private async checkTagGroupOrderDuplicate(order: number, excludeId?: string): Promise<void> {
    const tagGroupsRef = collection(db, 'conversations', this.conversationId, 'tagGroups');
    const q = query(tagGroupsRef, where('order', '==', order));
    const querySnapshot = await getDocs(q);

    const duplicates = querySnapshot.docs.filter(doc => doc.id !== excludeId);

    if (duplicates.length > 0) {
      throw new Error(`TagGroup with order ${order} already exists`);
    }
  }

  private async handleRelatedTagsForDeletion(tagGroupId: string, option: 'delete' | 'unlink'): Promise<void> {
    const tagsRef = collection(db, 'conversations', this.conversationId, 'tags');
    const q = query(tagsRef, where('groupId', '==', tagGroupId));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return;
    }

    const batch = writeBatch(db);

    querySnapshot.forEach((tagDoc) => {
      if (option === 'delete') {
        batch.delete(tagDoc.ref);
      } else {
        batch.update(tagDoc.ref, {
          groupId: null,
          updatedAt: serverTimestamp()
        });
      }
    });

    await batch.commit();
  }

  private validateLine(line: Omit<Line, 'id'>): void {
    if (!line.name || line.name.trim() === '') {
      throw new Error('Line name is required');
    }

    if (!line.messageIds || !Array.isArray(line.messageIds)) {
      throw new Error('Message IDs array is required');
    }

    if (!line.created_at) {
      throw new Error('Created at timestamp is required');
    }

    if (!line.updated_at) {
      throw new Error('Updated at timestamp is required');
    }
  }

  private validateLineId(id: string): void {
    if (!id || id.trim() === '') {
      throw new Error('Line ID is required');
    }
  }

  private validateLineUpdates(updates: Partial<Line>): void {
    if (Object.keys(updates).length === 0) {
      throw new Error('No updates provided');
    }

    if (updates.name !== undefined && updates.name.trim() === '') {
      throw new Error('Line name cannot be empty');
    }

    if (updates.messageIds !== undefined && (!Array.isArray(updates.messageIds))) {
      throw new Error('Message IDs must be an array');
    }
  }

  private async checkLineNameDuplicate(name: string, excludeId?: string): Promise<void> {
    const linesRef = collection(db, 'conversations', this.conversationId, 'lines');
    const q = query(linesRef, where('name', '==', name));
    const querySnapshot = await getDocs(q);

    const duplicates = querySnapshot.docs.filter(doc => doc.id !== excludeId);

    if (duplicates.length > 0) {
      throw new Error(`Line with name "${name}" already exists`);
    }
  }

  private async checkForCircularReference(prevMessageId: string, nextMessageId: string, transaction: Transaction): Promise<void> {
    const visited = new Set<string>();
    let currentId: string | null = nextMessageId;

    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);

      if (currentId === prevMessageId) {
        throw new Error('Linking these messages would create a circular reference');
      }

      const messageRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, MESSAGES_SUBCOLLECTION, currentId);
      const messageDoc = await transaction.get(messageRef);

      if (!messageDoc.exists()) {
        break;
      }

      const messageData = messageDoc.data() as MessageWithTimestamp;
      currentId = messageData.nextInLine || null;
    }
  }

  private async updateLineMessageIds(lineId: string, transaction: Transaction): Promise<void> {
    const messagesRef = collection(db, 'conversations', this.conversationId, 'messages');
    const q = query(messagesRef, where('lineId', '==', lineId));
    const messagesSnapshot = await getDocs(q);

    const messagesMap = new Map<string, MessageWithTimestamp>();

    messagesSnapshot.forEach((doc) => {
      const messageData = doc.data() as MessageWithTimestamp;
      messagesMap.set(doc.id, messageData);
    });

    const orderedIds = this.buildMessageChain(messagesMap);

    const lineRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, LINES_SUBCOLLECTION, lineId);
    transaction.update(lineRef, {
      messageIds: orderedIds,
      updated_at: new Date().toISOString(),
      updatedAt: serverTimestamp()
    });
  }

  private buildMessageChain(messagesMap: Map<string, MessageWithTimestamp>): string[] {
    const orderedIds: string[] = [];
    const visited = new Set<string>();

    let startMessageId: string | null = null;
    for (const [id, message] of Array.from(messagesMap.entries())) {
      if (!message.prevInLine) {
        startMessageId = id;
        break;
      }
    }

    let currentId: string | null = startMessageId;
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      orderedIds.push(currentId);

      const currentMessage = messagesMap.get(currentId);
      currentId = currentMessage?.nextInLine || null;
    }

    for (const [id] of Array.from(messagesMap.entries())) {
      if (!visited.has(id)) {
        orderedIds.push(id);
      }
    }

    return orderedIds;
  }

  private async unlinkMessageFromCurrentPosition(messageId: string, transaction: Transaction): Promise<void> {
    const messageRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, MESSAGES_SUBCOLLECTION, messageId);
    const messageDoc = await transaction.get(messageRef);

    if (!messageDoc.exists()) {
      return;
    }

    const messageData = messageDoc.data() as MessageWithTimestamp;

    if (messageData.prevInLine && messageData.nextInLine) {
      const prevMessageRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, MESSAGES_SUBCOLLECTION, messageData.prevInLine);
      const nextMessageRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, MESSAGES_SUBCOLLECTION, messageData.nextInLine);

      transaction.update(prevMessageRef, {
        nextInLine: messageData.nextInLine,
        updatedAt: serverTimestamp()
      });

      transaction.update(nextMessageRef, {
        prevInLine: messageData.prevInLine,
        updatedAt: serverTimestamp()
      });
    } else if (messageData.prevInLine) {
      const prevMessageRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, MESSAGES_SUBCOLLECTION, messageData.prevInLine);
      transaction.update(prevMessageRef, {
        nextInLine: null,
        updatedAt: serverTimestamp()
      });
    } else if (messageData.nextInLine) {
      const nextMessageRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, MESSAGES_SUBCOLLECTION, messageData.nextInLine);
      transaction.update(nextMessageRef, {
        prevInLine: null,
        updatedAt: serverTimestamp()
      });
    }
  }

  private async insertMessageAtPosition(messageId: string, lineId: string, position: number, transaction: Transaction): Promise<void> {
    const messagesRef = collection(db, 'conversations', this.conversationId, 'messages');
    const q = query(messagesRef, where('lineId', '==', lineId));
    const messagesSnapshot = await getDocs(q);

    const messagesMap = new Map<string, MessageWithTimestamp>();
    messagesSnapshot.forEach((doc) => {
      if (doc.id !== messageId) {
        const messageData = doc.data() as MessageWithTimestamp;
        messagesMap.set(doc.id, messageData);
      }
    });

    const orderedIds = this.buildMessageChain(messagesMap);

    if (position >= orderedIds.length) {
      if (orderedIds.length > 0) {
        const lastMessageId = orderedIds[orderedIds.length - 1];
        const lastMessageRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, MESSAGES_SUBCOLLECTION, lastMessageId);
        const messageRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, MESSAGES_SUBCOLLECTION, messageId);

        transaction.update(lastMessageRef, {
          nextInLine: messageId,
          updatedAt: serverTimestamp()
        });

        transaction.update(messageRef, {
          prevInLine: lastMessageId,
          nextInLine: null,
          updatedAt: serverTimestamp()
        });
      }
    } else if (position === 0) {
      if (orderedIds.length > 0) {
        const firstMessageId = orderedIds[0];
        const firstMessageRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, MESSAGES_SUBCOLLECTION, firstMessageId);
        const messageRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, MESSAGES_SUBCOLLECTION, messageId);

        transaction.update(firstMessageRef, {
          prevInLine: messageId,
          updatedAt: serverTimestamp()
        });

        transaction.update(messageRef, {
          prevInLine: null,
          nextInLine: firstMessageId,
          updatedAt: serverTimestamp()
        });
      }
    } else {
      const prevMessageId = orderedIds[position - 1];
      const nextMessageId = orderedIds[position];

      const prevMessageRef = doc(db, 'conversations', this.conversationId, 'messages', prevMessageId);
      const nextMessageRef = doc(db, 'conversations', this.conversationId, 'messages', nextMessageId);
      const messageRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, MESSAGES_SUBCOLLECTION, messageId);

      transaction.update(prevMessageRef, {
        nextInLine: messageId,
        updatedAt: serverTimestamp()
      });

      transaction.update(nextMessageRef, {
        prevInLine: messageId,
        updatedAt: serverTimestamp()
      });

      transaction.update(messageRef, {
        prevInLine: prevMessageId,
        nextInLine: nextMessageId,
        updatedAt: serverTimestamp()
      });
    }
  }

  private validateTag(tag: Omit<Tag, 'id'>): void {
    if (!tag.name || tag.name.trim() === '') {
      throw new Error('Tag name is required');
    }
  }

  private validateTagId(id: string): void {
    if (!id || id.trim() === '') {
      throw new Error('Tag ID is required');
    }
  }

  private validateTagUpdates(updates: Partial<Tag>): void {
    if (Object.keys(updates).length === 0) {
      throw new Error('No updates provided');
    }

    if (updates.name !== undefined && updates.name.trim() === '') {
      throw new Error('Tag name cannot be empty');
    }
  }

  private async checkTagNameDuplicate(name: string, excludeId?: string): Promise<void> {
    const tagsRef = collection(db, 'conversations', this.conversationId, 'tags');
    const q = query(tagsRef, where('name', '==', name));
    const querySnapshot = await getDocs(q);

    const duplicates = querySnapshot.docs.filter(doc => doc.id !== excludeId);

    if (duplicates.length > 0) {
      throw new Error(`Tag with name "${name}" already exists`);
    }
  }

  private async removeTagFromAllMessages(tagId: string): Promise<void> {
    const messagesRef = collection(db, 'conversations', this.conversationId, 'messages');
    const q = query(messagesRef, where('tags', 'array-contains', tagId));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return;
    }

    const batch = writeBatch(db);

    querySnapshot.forEach((messageDoc) => {
      const messageData = messageDoc.data() as MessageWithTimestamp;
      const updatedTags = (messageData.tags || []).filter(id => id !== tagId);

      batch.update(messageDoc.ref, {
        tags: updatedTags,
        updatedAt: serverTimestamp()
      });
    });

    await batch.commit();
  }

  private async removeTagFromAllLines(tagId: string): Promise<void> {
    const linesRef = collection(db, 'conversations', this.conversationId, 'lines');
    const q = query(linesRef, where('tagIds', 'array-contains', tagId));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return;
    }

    const batch = writeBatch(db);

    querySnapshot.forEach((lineDoc) => {
      const lineData = lineDoc.data() as Line;
      const updatedTagIds = (lineData.tagIds || []).filter(id => id !== tagId);

      batch.update(lineDoc.ref, {
        tagIds: updatedTagIds,
        updated_at: new Date().toISOString(),
        updatedAt: serverTimestamp()
      });
    });

    await batch.commit();
  }
}

import { doc, getDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, collection } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { CONVERSATIONS_COLLECTION, MESSAGES_SUBCOLLECTION } from '@/lib/firestore-constants';
import type { Message } from '@/lib/types';
import type { MessageInput } from './base';
import { buildUpdateData } from './firestore-utils';

/**
 * メッセージ操作を担当するクラス
 */
export class FirestoreMessageOperations {
  constructor(private conversationId: string) {}

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
        updatedAt: serverTimestamp(),
        ...buildUpdateData(updates)
      };

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

  validateMessage(message: MessageInput): void {
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

  validateMessageId(id: string): void {
    if (!id || id.trim() === '') {
      throw new Error('Message ID is required');
    }
  }

  validateMessageUpdates(updates: Partial<Omit<Message, 'timestamp'>> & { timestamp?: string | Date }): void {
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
}

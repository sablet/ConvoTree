'use client';

import { collection, getDocs, doc, serverTimestamp, query, where, runTransaction, type Transaction } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { CONVERSATIONS_COLLECTION, MESSAGES_SUBCOLLECTION, LINES_SUBCOLLECTION } from '@/lib/firestore-constants';
import type { Line } from '@/lib/types';
import type * as FirebaseFirestore from 'firebase/firestore';

interface BranchPointWithTimestamp {
  messageId: string;
  lines: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export class FirestoreLineOperations {
  private conversationId: string;

  constructor(conversationId: string) {
    this.conversationId = conversationId;
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
        await this.getAndValidateLineDoc(transaction, id);

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
        const lineDoc = await this.getAndValidateLineDoc(transaction, id);
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

  validateLineId(id: string): void {
    if (!id || id.trim() === '') {
      throw new Error('Line ID is required');
    }
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

  private async getAndValidateLineDoc(
    transaction: Transaction,
    lineId: string
  ): Promise<FirebaseFirestore.DocumentSnapshot> {
    const lineRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, LINES_SUBCOLLECTION, lineId);
    const lineDoc = await transaction.get(lineRef);
    if (!lineDoc.exists()) {
      throw new Error(`Line with ID ${lineId} not found`);
    }
    return lineDoc;
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
}

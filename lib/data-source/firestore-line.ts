'use client';

import { collection, getDocs, doc, serverTimestamp, query, where, runTransaction, type Transaction } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { CONVERSATIONS_COLLECTION, LINES_SUBCOLLECTION } from '@/lib/firestore-constants';
import type { Line } from '@/lib/types';
import type * as FirebaseFirestore from 'firebase/firestore';

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
        await this.getAndValidateLineDoc(transaction, id);

        // Note: In new data structure, messages reference lines via lineId field
        // Messages will become orphaned when line is deleted
        // This is acceptable as orphan messages can be cleaned up separately if needed

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

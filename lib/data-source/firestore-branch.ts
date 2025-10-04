'use client';

import { collection, getDocs, doc, serverTimestamp, query, where, runTransaction, Timestamp, Transaction } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { CONVERSATIONS_COLLECTION, MESSAGES_SUBCOLLECTION, LINES_SUBCOLLECTION, BRANCH_POINTS_SUBCOLLECTION } from '@/lib/firestore-constants';
import type { BranchPoint, Line, Message } from '@/lib/types';
import type { FirestoreMessageOperations } from './firestore-message';
import type { FirestoreLineOperations } from './firestore-line';
import type * as FirebaseFirestore from 'firebase/firestore';

interface BranchPointWithTimestamp {
  messageId: string;
  lines: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

interface MessageWithTimestamp extends Omit<Message, 'id'> {
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export class FirestoreBranchOperations {
  private conversationId: string;
  private messageOps: FirestoreMessageOperations;
  private lineOps: FirestoreLineOperations;

  constructor(conversationId: string, messageOps: FirestoreMessageOperations, lineOps: FirestoreLineOperations) {
    this.conversationId = conversationId;
    this.messageOps = messageOps;
    this.lineOps = lineOps;
  }

  private async getAndValidateMessageDoc(
    transaction: Transaction,
    messageId: string
  ): Promise<FirebaseFirestore.DocumentSnapshot> {
    const messageRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, MESSAGES_SUBCOLLECTION, messageId);
    const messageDoc = await transaction.get(messageRef);
    if (!messageDoc.exists()) {
      throw new Error(`Message with ID ${messageId} not found`);
    }
    return messageDoc;
  }

  private async getAndValidateBranchPointDoc(
    transaction: Transaction,
    messageId: string
  ): Promise<FirebaseFirestore.DocumentSnapshot> {
    const branchPointRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, BRANCH_POINTS_SUBCOLLECTION, messageId);
    const branchPointDoc = await transaction.get(branchPointRef);
    if (!branchPointDoc.exists()) {
      throw new Error(`BranchPoint for message ${messageId} not found`);
    }
    return branchPointDoc;
  }

  async createBranchPoint(messageId: string): Promise<void> {
    try {
      this.messageOps.validateMessageId(messageId);

      await runTransaction(db, async (transaction) => {
        await this.getAndValidateMessageDoc(transaction, messageId);

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
      this.messageOps.validateMessageId(messageId);
      this.lineOps.validateLineId(lineId);

      await runTransaction(db, async (transaction) => {
        await this.getAndValidateMessageDoc(transaction, messageId);

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
      this.messageOps.validateMessageId(messageId);
      this.lineOps.validateLineId(lineId);

      await runTransaction(db, async (transaction) => {
        const branchPointRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, BRANCH_POINTS_SUBCOLLECTION, messageId);
        const branchPointDoc = await this.getAndValidateBranchPointDoc(transaction, messageId);
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
      this.messageOps.validateMessageId(messageId);

      await runTransaction(db, async (transaction) => {
        const branchPointRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, BRANCH_POINTS_SUBCOLLECTION, messageId);
        const branchPointDoc = await this.getAndValidateBranchPointDoc(transaction, messageId);
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
      this.messageOps.validateMessageId(prevMessageId);
      this.messageOps.validateMessageId(nextMessageId);

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
      this.messageOps.validateMessageId(messageId);

      await runTransaction(db, async (transaction) => {
        const messageRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, MESSAGES_SUBCOLLECTION, messageId);
        const messageDoc = await this.getAndValidateMessageDoc(transaction, messageId);
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
      this.messageOps.validateMessageId(messageId);
      this.lineOps.validateLineId(targetLineId);

      await runTransaction(db, async (transaction) => {
        const messageRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, MESSAGES_SUBCOLLECTION, messageId);
        const messageDoc = await this.getAndValidateMessageDoc(transaction, messageId);

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
}

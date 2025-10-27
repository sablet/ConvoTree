'use client';

import { doc, type DocumentSnapshot, type Transaction } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { CONVERSATIONS_COLLECTION, MESSAGES_SUBCOLLECTION, LINES_SUBCOLLECTION, BRANCH_POINTS_SUBCOLLECTION } from '@/lib/firestore-constants';
import type { BranchPoint, Line, Message } from '@/lib/types';
import { Timestamp, serverTimestamp } from 'firebase/firestore';

interface MessageWithTimestamp extends Omit<Message, 'id' | 'timestamp' | 'updatedAt'> {
  id?: string;
  timestamp?: Timestamp;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export function buildMessageChain(messagesMap: Map<string, MessageWithTimestamp>): string[] {
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

function determineBranchPoint(
  firstMessageDoc: DocumentSnapshot,
  oldLineDocsMap: Map<string, Line>,
  firstMessageId: string
): string | undefined {
  const firstMessageData = firstMessageDoc.data() as MessageWithTimestamp;
  let branchFromMessageId: string | undefined;

  console.log('🔍 Creating new line - determining branch point:', {
    firstMessageId,
    prevInLine: firstMessageData.prevInLine,
    currentLineId: firstMessageData.lineId
  });

  if (firstMessageData.prevInLine) {
    // Case 1: Message has a previous message in the same line
    // -> Branch from that previous message (which stays in the parent line)
    // This creates a branch relationship from the parent line
    branchFromMessageId = firstMessageData.prevInLine;
    console.log('✅ Using prevInLine as branch point:', branchFromMessageId);
  } else {
    // Case 2: Message is the first in its line (no prevInLine)
    // -> The new line becomes a root line (no branch point)
    // This prevents circular references and represents a top-level line
    console.log('📍 First message in line - creating root line (no branch point)');
    branchFromMessageId = undefined;
  }

  console.log('🎯 Final branch point:', branchFromMessageId);
  return branchFromMessageId;
}

export function unlinkMessageFromCurrentPosition(
  conversationId: string,
  messageData: MessageWithTimestamp,
  transaction: Transaction
): void {
  if (messageData.prevInLine && messageData.nextInLine) {
    const prevMessageRef = doc(db, CONVERSATIONS_COLLECTION, conversationId, MESSAGES_SUBCOLLECTION, messageData.prevInLine);
    const nextMessageRef = doc(db, CONVERSATIONS_COLLECTION, conversationId, MESSAGES_SUBCOLLECTION, messageData.nextInLine);

    transaction.update(prevMessageRef, {
      nextInLine: messageData.nextInLine,
      updatedAt: serverTimestamp()
    });

    transaction.update(nextMessageRef, {
      prevInLine: messageData.prevInLine,
      updatedAt: serverTimestamp()
    });
  } else if (messageData.prevInLine) {
    const prevMessageRef = doc(db, CONVERSATIONS_COLLECTION, conversationId, MESSAGES_SUBCOLLECTION, messageData.prevInLine);
    transaction.update(prevMessageRef, {
      nextInLine: null,
      updatedAt: serverTimestamp()
    });
  } else if (messageData.nextInLine) {
    const nextMessageRef = doc(db, CONVERSATIONS_COLLECTION, conversationId, MESSAGES_SUBCOLLECTION, messageData.nextInLine);
    transaction.update(nextMessageRef, {
      prevInLine: null,
      updatedAt: serverTimestamp()
    });
  }
}

export async function readTransactionData(
  conversationId: string,
  messageIds: string[],
  transaction: Transaction
): Promise<{
  messageDocs: DocumentSnapshot[];
  messageRefs: import('firebase/firestore').DocumentReference[];
  oldLineDocsMap: Map<string, Line>;
  branchFromMessageId: string | undefined;
  existingBranchPoint: BranchPoint | null;
}> {
  // 1. Validate all messages exist and get their data
  const messageRefs = messageIds.map(id =>
    doc(db, CONVERSATIONS_COLLECTION, conversationId, MESSAGES_SUBCOLLECTION, id)
  );
  const messageDocs = await Promise.all(
    messageRefs.map(ref => transaction.get(ref))
  );

  messageDocs.forEach((messageDoc, index) => {
    if (!messageDoc.exists()) {
      throw new Error(`Message with ID ${messageIds[index]} not found`);
    }
  });

  // 2. Get old line IDs and read old line docs
  const oldLineIds = new Set<string>();
  messageDocs.forEach(messageDoc => {
    const messageData = messageDoc.data() as MessageWithTimestamp;
    if (messageData.lineId) {
      oldLineIds.add(messageData.lineId);
    }
  });

  const oldLineDocsMap = new Map<string, Line>();
  for (const oldLineId of Array.from(oldLineIds)) {
    const oldLineRef = doc(db, CONVERSATIONS_COLLECTION, conversationId, LINES_SUBCOLLECTION, oldLineId);
    const oldLineDoc = await transaction.get(oldLineRef);
    if (oldLineDoc.exists()) {
      oldLineDocsMap.set(oldLineId, oldLineDoc.data() as Line);
    }
  }

  // 3. Determine branch point
  const branchFromMessageId = determineBranchPoint(messageDocs[0], oldLineDocsMap, messageIds[0]);

  // 4. Read branch point doc if exists
  let existingBranchPoint: BranchPoint | null = null;
  if (branchFromMessageId) {
    const branchPointRef = doc(db, CONVERSATIONS_COLLECTION, conversationId, BRANCH_POINTS_SUBCOLLECTION, branchFromMessageId);
    const branchPointDoc = await transaction.get(branchPointRef);
    if (branchPointDoc.exists()) {
      existingBranchPoint = branchPointDoc.data() as BranchPoint;
    }
  }

  return { messageDocs, messageRefs, oldLineDocsMap, branchFromMessageId, existingBranchPoint };
}

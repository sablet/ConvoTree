'use client';

import { doc, type Transaction } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { CONVERSATIONS_COLLECTION, MESSAGES_SUBCOLLECTION } from '@/lib/firestore-constants';
import type { Message } from '@/lib/types';
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


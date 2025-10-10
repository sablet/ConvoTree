'use client';

import {
  collection,
  onSnapshot,
  type Unsubscribe,
  type DocumentChange
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  CONVERSATIONS_COLLECTION,
  MESSAGES_SUBCOLLECTION,
  LINES_SUBCOLLECTION,
  TAGS_SUBCOLLECTION,
  TAG_GROUPS_SUBCOLLECTION,
  BRANCH_POINTS_SUBCOLLECTION
} from '@/lib/firestore-constants';
import type { Line } from '@/lib/types';
import type { ChatData } from './base';
import { normalizeDateValue } from './firestore-utils';

export type ChatDataChangeHandler = (data: ChatData, fromCache: boolean) => void;
export type ErrorHandler = (error: Error) => void;

/**
 * Firestoreのリアルタイムリスナーを管理するクラス
 * onSnapshotで差分取得を行い、キャッシュとの同期を自動的に処理
 */
export class FirestoreRealtimeListener {
  private conversationId: string;
  private unsubscribers: Unsubscribe[] = [];
  private chatData: ChatData = {
    messages: {},
    lines: [],
    branchPoints: {},
    tags: {},
    tagGroups: {}
  };
  private changeHandler: ChatDataChangeHandler | null = null;
  private errorHandler: ErrorHandler | null = null;
  private isInitialized = false;

  constructor(conversationId: string) {
    this.conversationId = conversationId;
  }

  /**
   * リスナーを開始
   */
  start(onChange: ChatDataChangeHandler, onError?: ErrorHandler): void {
    if (this.unsubscribers.length > 0) {
      console.warn('[FirestoreRealtimeListener] Already started. Stopping existing listeners.');
      this.stop();
    }

    this.changeHandler = onChange;
    this.errorHandler = onError || null;

    this.setupMessagesListener();
    this.setupLinesListener();
    this.setupBranchPointsListener();
    this.setupTagsListener();
    this.setupTagGroupsListener();

    console.log('✅ [FirestoreRealtimeListener] All listeners started');
  }

  /**
   * リスナーを停止
   */
  stop(): void {
    this.unsubscribers.forEach(unsubscribe => unsubscribe());
    this.unsubscribers = [];
    this.changeHandler = null;
    this.errorHandler = null;
    this.isInitialized = false;
    console.log('✅ [FirestoreRealtimeListener] All listeners stopped');
  }

  /**
   * 現在のデータを取得
   */
  getCurrentData(): ChatData {
    return this.chatData;
  }

  private setupMessagesListener(): void {
    const messagesRef = collection(db, CONVERSATIONS_COLLECTION, this.conversationId, MESSAGES_SUBCOLLECTION);

    const unsubscribe = onSnapshot(
      messagesRef,
      { includeMetadataChanges: true },
      (snapshot) => {
        const fromCache = snapshot.metadata.fromCache;

        // 差分を適用
        const changes = snapshot.docChanges();
        if (!fromCache && changes.length > 0) {
          console.log(`📝 [Messages] ${changes.length} changes from server`);
        }

        changes.forEach((change: DocumentChange) => {
          const docId = change.doc.id;
          const data = change.doc.data();

          if (change.type === 'added' || change.type === 'modified') {
            const timestampValue = normalizeDateValue(data.timestamp)
              ?? normalizeDateValue(data.createdAt)
              ?? normalizeDateValue(data.created_at)
              ?? new Date();
            const updatedAtValue = normalizeDateValue(data.updatedAt) ?? normalizeDateValue(data.updated_at);

            this.chatData.messages[docId] = {
              id: docId,
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
          } else if (change.type === 'removed') {
            delete this.chatData.messages[docId];
          }
        });

        this.notifyChange(fromCache);
      },
      (error) => this.handleError('Messages', error)
    );

    this.unsubscribers.push(unsubscribe);
  }

  private setupLinesListener(): void {
    const linesRef = collection(db, CONVERSATIONS_COLLECTION, this.conversationId, LINES_SUBCOLLECTION);

    const unsubscribe = onSnapshot(
      linesRef,
      { includeMetadataChanges: true },
      (snapshot) => {
        const fromCache = snapshot.metadata.fromCache;

        const changes = snapshot.docChanges();
        if (!fromCache && changes.length > 0) {
          console.log(`📋 [Lines] ${changes.length} changes from server`);
        }

        changes.forEach((change: DocumentChange) => {
          const docId = change.doc.id;
          const data = change.doc.data();

          if (change.type === 'added' || change.type === 'modified') {
            const line: Line = {
              id: docId,
              name: data.name || '',
              messageIds: data.messageIds || [],
              startMessageId: data.startMessageId || '',
              endMessageId: data.endMessageId,
              branchFromMessageId: data.branchFromMessageId,
              tagIds: data.tagIds || [],
              created_at: data.created_at || data.createdAt?.toDate?.()?.toISOString() || '',
              updated_at: data.updated_at || data.updatedAt?.toDate?.()?.toISOString() || ''
            };

            const existingIndex = this.chatData.lines.findIndex(l => l.id === docId);
            if (existingIndex >= 0) {
              this.chatData.lines[existingIndex] = line;
            } else {
              this.chatData.lines.push(line);
            }
          } else if (change.type === 'removed') {
            this.chatData.lines = this.chatData.lines.filter(l => l.id !== docId);
          }
        });

        this.notifyChange(fromCache);
      },
      (error) => this.handleError('Lines', error)
    );

    this.unsubscribers.push(unsubscribe);
  }

  private setupBranchPointsListener(): void {
    const branchPointsRef = collection(db, CONVERSATIONS_COLLECTION, this.conversationId, BRANCH_POINTS_SUBCOLLECTION);

    const unsubscribe = onSnapshot(
      branchPointsRef,
      { includeMetadataChanges: true },
      (snapshot) => {
        const fromCache = snapshot.metadata.fromCache;

        const changes = snapshot.docChanges();
        if (!fromCache && changes.length > 0) {
          console.log(`🌿 [BranchPoints] ${changes.length} changes from server`);
        }

        changes.forEach((change: DocumentChange) => {
          const docId = change.doc.id;
          const data = change.doc.data();

          if (change.type === 'added' || change.type === 'modified') {
            this.chatData.branchPoints[docId] = {
              messageId: data.messageId || docId,
              lines: data.lines || []
            };
          } else if (change.type === 'removed') {
            delete this.chatData.branchPoints[docId];
          }
        });

        this.notifyChange(fromCache);
      },
      (error) => this.handleError('BranchPoints', error)
    );

    this.unsubscribers.push(unsubscribe);
  }

  private setupTagsListener(): void {
    const tagsRef = collection(db, CONVERSATIONS_COLLECTION, this.conversationId, TAGS_SUBCOLLECTION);

    const unsubscribe = onSnapshot(
      tagsRef,
      { includeMetadataChanges: true },
      (snapshot) => {
        const fromCache = snapshot.metadata.fromCache;

        const changes = snapshot.docChanges();
        if (!fromCache && changes.length > 0) {
          console.log(`🏷️  [Tags] ${changes.length} changes from server`);
        }

        changes.forEach((change: DocumentChange) => {
          const docId = change.doc.id;
          const data = change.doc.data();

          if (change.type === 'added' || change.type === 'modified') {
            this.chatData.tags[docId] = {
              id: docId,
              name: data.name || '',
              color: data.color,
              groupId: data.groupId
            };
          } else if (change.type === 'removed') {
            delete this.chatData.tags[docId];
          }
        });

        this.notifyChange(fromCache);
      },
      (error) => this.handleError('Tags', error)
    );

    this.unsubscribers.push(unsubscribe);
  }

  private setupTagGroupsListener(): void {
    const tagGroupsRef = collection(db, CONVERSATIONS_COLLECTION, this.conversationId, TAG_GROUPS_SUBCOLLECTION);

    const unsubscribe = onSnapshot(
      tagGroupsRef,
      { includeMetadataChanges: true },
      (snapshot) => {
        const fromCache = snapshot.metadata.fromCache;

        const changes = snapshot.docChanges();
        if (!fromCache && changes.length > 0) {
          console.log(`📁 [TagGroups] ${changes.length} changes from server`);
        }

        changes.forEach((change: DocumentChange) => {
          const docId = change.doc.id;
          const data = change.doc.data();

          if (change.type === 'added' || change.type === 'modified') {
            this.chatData.tagGroups[docId] = {
              id: docId,
              name: data.name || '',
              color: data.color || '',
              order: data.order || 0
            };
          } else if (change.type === 'removed') {
            delete this.chatData.tagGroups[docId];
          }
        });

        this.notifyChange(fromCache);
      },
      (error) => this.handleError('TagGroups', error)
    );

    this.unsubscribers.push(unsubscribe);
  }

  private notifyChange(fromCache: boolean): void {
    if (!this.isInitialized && !fromCache) {
      // 初回のサーバーからのデータ取得完了
      this.isInitialized = true;
      console.log('✅ [FirestoreRealtimeListener] Initial data loaded from server');
    }

    if (this.changeHandler) {
      this.changeHandler({ ...this.chatData }, fromCache);
    }
  }

  private handleError(listenerName: string, error: Error): void {
    console.error(`❌ [FirestoreRealtimeListener] ${listenerName} listener error:`, error);
    if (this.errorHandler) {
      this.errorHandler(error);
    }
  }
}

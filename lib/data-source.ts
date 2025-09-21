'use client';

import { collection, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp, writeBatch, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface Message {
  id: string;
  content: string;
  timestamp: string;
  lineId: string;
  prevInLine?: string;
  nextInLine?: string;
  branchFromMessageId?: string;
  tags?: string[];
  hasBookmark?: boolean;
  author?: string;
  images?: string[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

interface Line {
  id: string;
  name: string;
  messageIds: string[];
  startMessageId: string;
  endMessageId?: string;
  branchFromMessageId?: string;
  tagIds?: string[];
  created_at: string;
  updated_at: string;
}

interface BranchPoint {
  messageId: string;
  lines: string[];
}

interface Tag {
  id: string;
  name: string;
  color?: string;
  groupId?: string;
}

interface TagGroup {
  id: string;
  name: string;
  color: string;
  order: number;
}

interface ChatData {
  messages: Record<string, Message>;
  lines: Line[];
  branchPoints: Record<string, BranchPoint>;
  tags: Record<string, Tag>;
  tagGroups: Record<string, TagGroup>;
}

export type DataSource = 'firestore' | 'sample';

export class DataSourceManager {
  private static instance: DataSourceManager;
  private currentSource: DataSource = 'firestore';
  private conversationId = 'sample-conversation-1';

  static getInstance(): DataSourceManager {
    if (!DataSourceManager.instance) {
      DataSourceManager.instance = new DataSourceManager();
    }
    return DataSourceManager.instance;
  }

  setDataSource(source: DataSource): void {
    this.currentSource = source;
    console.log(`Data source switched to: ${source}`);
  }

  getCurrentSource(): DataSource {
    return this.currentSource;
  }

  async loadChatData(): Promise<ChatData> {
    if (this.currentSource === 'firestore') {
      return this.loadFromFirestore();
    } else {
      return this.loadFromSample();
    }
  }

  private async loadFromFirestore(): Promise<ChatData> {
    try {
      console.log('🔍 Loading data from Firestore...');

      const conversationRef = doc(db, 'conversations', this.conversationId);

      // Check if conversation exists
      const conversationDoc = await getDoc(conversationRef);
      if (!conversationDoc.exists()) {
        throw new Error(`Conversation ${this.conversationId} not found in Firestore`);
      }

      // Load messages
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
          images: data.images
        };
      });

      // Load lines
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

      // Load branch points
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

      // Load tags
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

      // Load tag groups
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

      console.log(`✅ Loaded from Firestore: ${Object.keys(messages).length} messages, ${lines.length} lines`);

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

  private async loadFromSample(): Promise<ChatData> {
    try {
      console.log('📄 Loading sample data...');
      const response = await fetch('/data/chat-sample.json');
      const data = await response.json();

      console.log(`✅ Loaded sample data: ${Object.keys(data.messages || {}).length} messages, ${data.lines?.length || 0} lines`);

      return {
        messages: data.messages || {},
        lines: data.lines || [],
        branchPoints: data.branchPoints || {},
        tags: data.tags || {},
        tagGroups: data.tagGroups || {}
      };
    } catch (error) {
      console.error('❌ Failed to load sample data:', error);
      throw error;
    }
  }

  // Message CRUD Operations
  async createMessage(message: Omit<Message, 'id'>): Promise<string> {
    try {
      // バリデーション
      this.validateMessage(message);

      console.log('📝 Creating new message in Firestore...');

      const messagesRef = collection(db, 'conversations', this.conversationId, 'messages');

      const messageData = {
        ...message,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      const docRef = await addDoc(messagesRef, messageData);

      console.log(`✅ Message created with ID: ${docRef.id}`);
      return docRef.id;

    } catch (error) {
      console.error('❌ Failed to create message:', error);
      this.handleFirestoreError(error, 'create');
      throw error;
    }
  }

  async updateMessage(id: string, updates: Partial<Message>): Promise<void> {
    try {
      // バリデーション
      this.validateMessageId(id);
      this.validateMessageUpdates(updates);

      console.log(`📝 Updating message ${id} in Firestore...`);

      const messageRef = doc(db, 'conversations', this.conversationId, 'messages', id);

      // メッセージ存在確認
      const messageDoc = await getDoc(messageRef);
      if (!messageDoc.exists()) {
        throw new Error(`Message with ID ${id} not found`);
      }

      const updateData = {
        ...updates,
        updatedAt: serverTimestamp()
      };

      await updateDoc(messageRef, updateData);

      console.log(`✅ Message ${id} updated successfully`);

    } catch (error) {
      console.error(`❌ Failed to update message ${id}:`, error);
      this.handleFirestoreError(error, 'update');
      throw error;
    }
  }

  async deleteMessage(id: string): Promise<void> {
    try {
      // バリデーション
      this.validateMessageId(id);

      console.log(`🗑️ Deleting message ${id} from Firestore...`);

      const messageRef = doc(db, 'conversations', this.conversationId, 'messages', id);

      // メッセージ存在確認
      const messageDoc = await getDoc(messageRef);
      if (!messageDoc.exists()) {
        throw new Error(`Message with ID ${id} not found`);
      }

      await deleteDoc(messageRef);

      console.log(`✅ Message ${id} deleted successfully`);

    } catch (error) {
      console.error(`❌ Failed to delete message ${id}:`, error);
      this.handleFirestoreError(error, 'delete');
      throw error;
    }
  }

  // バリデーション関数
  private validateMessage(message: Omit<Message, 'id'>): void {
    if (!message.content || message.content.trim() === '') {
      throw new Error('Message content is required');
    }

    if (!message.lineId || message.lineId.trim() === '') {
      throw new Error('LineId is required');
    }

    if (!message.timestamp) {
      throw new Error('Timestamp is required');
    }

    // タイムスタンプ形式チェック
    if (isNaN(Date.parse(message.timestamp))) {
      throw new Error('Invalid timestamp format');
    }
  }

  private validateMessageId(id: string): void {
    if (!id || id.trim() === '') {
      throw new Error('Message ID is required');
    }
  }

  private validateMessageUpdates(updates: Partial<Message>): void {
    if (Object.keys(updates).length === 0) {
      throw new Error('No updates provided');
    }

    // contentが空文字列でないことをチェック
    if (updates.content !== undefined && updates.content.trim() === '') {
      throw new Error('Message content cannot be empty');
    }

    // lineIdが空文字列でないことをチェック
    if (updates.lineId !== undefined && updates.lineId.trim() === '') {
      throw new Error('LineId cannot be empty');
    }

    // timestampの形式チェック
    if (updates.timestamp !== undefined && isNaN(Date.parse(updates.timestamp))) {
      throw new Error('Invalid timestamp format');
    }
  }

  // TagGroup CRUD Operations
  async createTagGroup(tagGroup: Omit<TagGroup, 'id'>): Promise<string> {
    try {
      // バリデーション
      this.validateTagGroup(tagGroup);

      // 名前の重複チェック
      await this.checkTagGroupNameDuplicate(tagGroup.name);

      // order の重複チェック
      await this.checkTagGroupOrderDuplicate(tagGroup.order);

      console.log('📝 Creating new tag group in Firestore...');

      const tagGroupsRef = collection(db, 'conversations', this.conversationId, 'tagGroups');

      const tagGroupData = {
        ...tagGroup,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      const docRef = await addDoc(tagGroupsRef, tagGroupData);

      console.log(`✅ TagGroup created with ID: ${docRef.id}`);
      return docRef.id;

    } catch (error) {
      console.error('❌ Failed to create tag group:', error);
      this.handleFirestoreError(error, 'createTagGroup');
      throw error;
    }
  }

  async updateTagGroup(id: string, updates: Partial<TagGroup>): Promise<void> {
    try {
      // バリデーション
      this.validateTagGroupId(id);
      this.validateTagGroupUpdates(updates);

      console.log(`📝 Updating tag group ${id} in Firestore...`);

      const tagGroupRef = doc(db, 'conversations', this.conversationId, 'tagGroups', id);

      // タググループ存在確認
      const tagGroupDoc = await getDoc(tagGroupRef);
      if (!tagGroupDoc.exists()) {
        throw new Error(`TagGroup with ID ${id} not found`);
      }

      // 名前の重複チェック（変更される場合）
      if (updates.name) {
        await this.checkTagGroupNameDuplicate(updates.name, id);
      }

      // order の重複チェック（変更される場合）
      if (updates.order !== undefined) {
        await this.checkTagGroupOrderDuplicate(updates.order, id);
      }

      const updateData = {
        ...updates,
        updatedAt: serverTimestamp()
      };

      await updateDoc(tagGroupRef, updateData);

      console.log(`✅ TagGroup ${id} updated successfully`);

    } catch (error) {
      console.error(`❌ Failed to update tag group ${id}:`, error);
      this.handleFirestoreError(error, 'updateTagGroup');
      throw error;
    }
  }

  async deleteTagGroup(id: string, tagHandlingOption: 'delete' | 'unlink' = 'unlink'): Promise<void> {
    try {
      // バリデーション
      this.validateTagGroupId(id);

      console.log(`🗑️ Deleting tag group ${id} from Firestore...`);

      const tagGroupRef = doc(db, 'conversations', this.conversationId, 'tagGroups', id);

      // タググループ存在確認
      const tagGroupDoc = await getDoc(tagGroupRef);
      if (!tagGroupDoc.exists()) {
        throw new Error(`TagGroup with ID ${id} not found`);
      }

      // 関連Tagの処理
      await this.handleRelatedTagsForDeletion(id, tagHandlingOption);

      // タググループ削除
      await deleteDoc(tagGroupRef);

      console.log(`✅ TagGroup ${id} deleted successfully`);

    } catch (error) {
      console.error(`❌ Failed to delete tag group ${id}:`, error);
      this.handleFirestoreError(error, 'deleteTagGroup');
      throw error;
    }
  }

  async reorderTagGroups(orderedIds: string[]): Promise<void> {
    try {
      console.log('📝 Reordering tag groups in Firestore...');

      if (orderedIds.length === 0) {
        throw new Error('Ordered IDs array cannot be empty');
      }

      // バッチ処理で順序を更新
      const batch = writeBatch(db);

      for (let i = 0; i < orderedIds.length; i++) {
        const tagGroupId = orderedIds[i];
        const tagGroupRef = doc(db, 'conversations', this.conversationId, 'tagGroups', tagGroupId);

        // 存在確認
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

      console.log(`✅ TagGroups reordered successfully`);

    } catch (error) {
      console.error('❌ Failed to reorder tag groups:', error);
      this.handleFirestoreError(error, 'reorderTagGroups');
      throw error;
    }
  }

  // バリデーション関数（TagGroup）
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

  // 制約チェック関数
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

  // 関連Tag処理
  private async handleRelatedTagsForDeletion(tagGroupId: string, option: 'delete' | 'unlink'): Promise<void> {
    const tagsRef = collection(db, 'conversations', this.conversationId, 'tags');
    const q = query(tagsRef, where('groupId', '==', tagGroupId));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      console.log('No related tags found');
      return;
    }

    const batch = writeBatch(db);

    querySnapshot.forEach((tagDoc) => {
      if (option === 'delete') {
        // 関連Tagも削除
        batch.delete(tagDoc.ref);
      } else {
        // 関連TagのgroupIdをnullに設定
        batch.update(tagDoc.ref, {
          groupId: null,
          updatedAt: serverTimestamp()
        });
      }
    });

    await batch.commit();

    console.log(`✅ Related tags ${option === 'delete' ? 'deleted' : 'unlinked'} successfully`);
  }

  // エラーハンドリング
  private handleFirestoreError(error: unknown, operation: string): void {
    if (error instanceof Error) {
      if (error.message.includes('permission-denied')) {
        console.error(`❌ Permission denied for ${operation} operation. Check Firestore security rules.`);
      } else if (error.message.includes('not-found')) {
        console.error(`❌ Document not found for ${operation} operation.`);
      } else if (error.message.includes('already-exists')) {
        console.error(`❌ Document already exists for ${operation} operation.`);
      } else if (error.message.includes('network')) {
        console.error(`❌ Network error during ${operation} operation. Please check your connection.`);
      } else {
        console.error(`❌ Unexpected error during ${operation} operation:`, error.message);
      }
    } else {
      console.error(`❌ Unknown error during ${operation} operation:`, error);
    }
  }
}

export const dataSourceManager = DataSourceManager.getInstance();
'use client';

import { collection, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp, writeBatch, query, where, runTransaction, Transaction, FieldValue, deleteField } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { config } from '@/lib/config';

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
  createdAt?: Timestamp | FieldValue;
  updatedAt?: Timestamp | FieldValue;
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
  private conversationId = config.conversationId;

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
      if (!this.conversationId) {
        throw new Error('NEXT_PUBLIC_CONVERSATION_ID環境変数が設定されていません');
      }

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

      // nullの値をdeleteField()に変換
      const updateData: Record<string, unknown> = {
        updatedAt: serverTimestamp()
      };

      for (const [key, value] of Object.entries(updates)) {
        if (value === null) {
          updateData[key] = deleteField();
        } else if (value !== undefined) {
          updateData[key] = value;
        }
        // undefinedの場合は何もしない（フィールドは更新されない）
      }

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

  // Line CRUD Operations
  async createLine(line: Omit<Line, 'id'>): Promise<string> {
    try {
      // バリデーション
      this.validateLine(line);

      console.log('📝 Creating new line in Firestore...');

      return await runTransaction(db, async (transaction) => {
        const linesRef = collection(db, 'conversations', this.conversationId, 'lines');

        // Line名の重複チェック
        await this.checkLineNameDuplicate(line.name);

        // 開始メッセージの存在確認
        if (line.startMessageId) {
          const startMessageRef = doc(db, 'conversations', this.conversationId, 'messages', line.startMessageId);
          const startMessageDoc = await transaction.get(startMessageRef);
          if (!startMessageDoc.exists()) {
            throw new Error(`Start message with ID ${line.startMessageId} not found`);
          }
        }

        // 分岐元メッセージの存在確認
        if (line.branchFromMessageId) {
          const branchMessageRef = doc(db, 'conversations', this.conversationId, 'messages', line.branchFromMessageId);
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

        console.log(`✅ Line created with ID: ${docRef.id}`);
        return docRef.id;
      });

    } catch (error) {
      console.error('❌ Failed to create line:', error);
      this.handleFirestoreError(error, 'createLine');
      throw error;
    }
  }

  async updateLine(id: string, updates: Partial<Line>): Promise<void> {
    try {
      // バリデーション
      this.validateLineId(id);
      this.validateLineUpdates(updates);

      console.log(`📝 Updating line ${id} in Firestore...`);

      await runTransaction(db, async (transaction) => {
        const lineRef = doc(db, 'conversations', this.conversationId, 'lines', id);

        // Line存在確認
        const lineDoc = await transaction.get(lineRef);
        if (!lineDoc.exists()) {
          throw new Error(`Line with ID ${id} not found`);
        }

        // 名前の重複チェック（変更される場合）
        if (updates.name) {
          await this.checkLineNameDuplicate(updates.name, id);
        }

        // 開始メッセージの存在確認（変更される場合）
        if (updates.startMessageId) {
          const startMessageRef = doc(db, 'conversations', this.conversationId, 'messages', updates.startMessageId);
          const startMessageDoc = await transaction.get(startMessageRef);
          if (!startMessageDoc.exists()) {
            throw new Error(`Start message with ID ${updates.startMessageId} not found`);
          }
        }

        // 分岐元メッセージの存在確認（変更される場合）
        if (updates.branchFromMessageId) {
          const branchMessageRef = doc(db, 'conversations', this.conversationId, 'messages', updates.branchFromMessageId);
          const branchMessageDoc = await transaction.get(branchMessageRef);
          if (!branchMessageDoc.exists()) {
            throw new Error(`Branch from message with ID ${updates.branchFromMessageId} not found`);
          }
        }

        const updateData = {
          ...updates,
          updatedAt: serverTimestamp()
        };

        transaction.update(lineRef, updateData);
      });

      console.log(`✅ Line ${id} updated successfully`);

    } catch (error) {
      console.error(`❌ Failed to update line ${id}:`, error);
      this.handleFirestoreError(error, 'updateLine');
      throw error;
    }
  }

  async deleteLine(id: string): Promise<void> {
    try {
      // バリデーション
      this.validateLineId(id);

      console.log(`🗑️ Deleting line ${id} from Firestore...`);

      await runTransaction(db, async (transaction) => {
        const lineRef = doc(db, 'conversations', this.conversationId, 'lines', id);

        // Line存在確認
        const lineDoc = await transaction.get(lineRef);
        if (!lineDoc.exists()) {
          throw new Error(`Line with ID ${id} not found`);
        }

        const lineData = lineDoc.data() as Line;

        // 関連メッセージの処理 - メッセージのlineIdをnullに設定
        if (lineData.messageIds && lineData.messageIds.length > 0) {
          for (const messageId of lineData.messageIds) {
            const messageRef = doc(db, 'conversations', this.conversationId, 'messages', messageId);
            const messageDoc = await transaction.get(messageRef);
            if (messageDoc.exists()) {
              transaction.update(messageRef, {
                lineId: null,
                updatedAt: serverTimestamp()
              });
            }
          }
        }

        // BranchPointからLineを削除
        const branchPointsRef = collection(db, 'conversations', this.conversationId, 'branchPoints');
        const branchPointsSnapshot = await getDocs(query(branchPointsRef, where('lines', 'array-contains', id)));

        branchPointsSnapshot.forEach((branchPointDoc) => {
          const branchPointData = branchPointDoc.data() as BranchPoint;
          const updatedLines = branchPointData.lines.filter(lineId => lineId !== id);

          if (updatedLines.length === 0) {
            // BranchPointにLineが残っていない場合は削除
            transaction.delete(branchPointDoc.ref);
          } else {
            // 他のLineが残っている場合は更新
            transaction.update(branchPointDoc.ref, {
              lines: updatedLines,
              updatedAt: serverTimestamp()
            });
          }
        });

        // Line削除
        transaction.delete(lineRef);
      });

      console.log(`✅ Line ${id} deleted successfully`);

    } catch (error) {
      console.error(`❌ Failed to delete line ${id}:`, error);
      this.handleFirestoreError(error, 'deleteLine');
      throw error;
    }
  }

  // Line バリデーション関数
  private validateLine(line: Omit<Line, 'id'>): void {
    if (!line.name || line.name.trim() === '') {
      throw new Error('Line name is required');
    }

    // startMessageIdは新規ライン作成時は空でも良い（メッセージが追加された時に設定される）
    // if (!line.startMessageId || line.startMessageId.trim() === '') {
    //   throw new Error('Start message ID is required');
    // }

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

    // startMessageIdは空文字列でも良い（新規ライン作成時や初期状態）
    // if (updates.startMessageId !== undefined && updates.startMessageId.trim() === '') {
    //   throw new Error('Start message ID cannot be empty');
    // }

    if (updates.messageIds !== undefined && (!Array.isArray(updates.messageIds))) {
      throw new Error('Message IDs must be an array');
    }
  }

  // Line制約チェック関数
  private async checkLineNameDuplicate(name: string, excludeId?: string): Promise<void> {
    const linesRef = collection(db, 'conversations', this.conversationId, 'lines');
    const q = query(linesRef, where('name', '==', name));
    const querySnapshot = await getDocs(q);

    const duplicates = querySnapshot.docs.filter(doc => doc.id !== excludeId);

    if (duplicates.length > 0) {
      throw new Error(`Line with name "${name}" already exists`);
    }
  }

  // BranchPoint CRUD Operations
  async createBranchPoint(messageId: string): Promise<void> {
    try {
      // バリデーション
      this.validateMessageId(messageId);

      console.log(`📝 Creating branch point for message ${messageId} in Firestore...`);

      await runTransaction(db, async (transaction) => {
        // メッセージ存在確認
        const messageRef = doc(db, 'conversations', this.conversationId, 'messages', messageId);
        const messageDoc = await transaction.get(messageRef);
        if (!messageDoc.exists()) {
          throw new Error(`Message with ID ${messageId} not found`);
        }

        // 既存のBranchPointチェック
        const branchPointRef = doc(db, 'conversations', this.conversationId, 'branchPoints', messageId);
        const existingBranchPoint = await transaction.get(branchPointRef);
        if (existingBranchPoint.exists()) {
          throw new Error(`BranchPoint for message ${messageId} already exists`);
        }

        // BranchPoint作成
        const branchPointData = {
          messageId: messageId,
          lines: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };

        transaction.set(branchPointRef, branchPointData);
      });

      console.log(`✅ BranchPoint created for message ${messageId}`);

    } catch (error) {
      console.error(`❌ Failed to create branch point for message ${messageId}:`, error);
      this.handleFirestoreError(error, 'createBranchPoint');
      throw error;
    }
  }

  async addLineToBranchPoint(messageId: string, lineId: string): Promise<void> {
    try {
      // バリデーション
      this.validateMessageId(messageId);
      this.validateLineId(lineId);

      console.log(`📝 Adding line ${lineId} to branch point ${messageId} in Firestore...`);

      await runTransaction(db, async (transaction) => {
        // メッセージ存在確認
        const messageRef = doc(db, 'conversations', this.conversationId, 'messages', messageId);
        const messageDoc = await transaction.get(messageRef);
        if (!messageDoc.exists()) {
          throw new Error(`Message with ID ${messageId} not found`);
        }

        // Line存在確認
        const lineRef = doc(db, 'conversations', this.conversationId, 'lines', lineId);
        const lineDoc = await transaction.get(lineRef);
        if (!lineDoc.exists()) {
          throw new Error(`Line with ID ${lineId} not found`);
        }

        // BranchPoint存在確認と作成
        const branchPointRef = doc(db, 'conversations', this.conversationId, 'branchPoints', messageId);
        const branchPointDoc = await transaction.get(branchPointRef);

        let branchPointData: BranchPoint;

        if (!branchPointDoc.exists()) {
          // BranchPointが存在しない場合は作成
          console.log(`📝 Creating branch point for message ${messageId} during line addition...`);
          branchPointData = {
            messageId: messageId,
            lines: [],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          };
          transaction.set(branchPointRef, branchPointData);
        } else {
          branchPointData = branchPointDoc.data() as BranchPoint;
        }

        // 既にLineが追加されているかチェック
        if (branchPointData.lines.includes(lineId)) {
          throw new Error(`Line ${lineId} is already in branch point ${messageId}`);
        }

        // Lineを追加
        const updatedLines = [...branchPointData.lines, lineId];

        transaction.update(branchPointRef, {
          lines: updatedLines,
          updatedAt: serverTimestamp()
        });
      });

      console.log(`✅ Line ${lineId} added to branch point ${messageId}`);

    } catch (error) {
      console.error(`❌ Failed to add line ${lineId} to branch point ${messageId}:`, error);
      this.handleFirestoreError(error, 'addLineToBranchPoint');
      throw error;
    }
  }

  async removeLineFromBranchPoint(messageId: string, lineId: string): Promise<void> {
    try {
      // バリデーション
      this.validateMessageId(messageId);
      this.validateLineId(lineId);

      console.log(`📝 Removing line ${lineId} from branch point ${messageId} in Firestore...`);

      await runTransaction(db, async (transaction) => {
        // BranchPoint存在確認
        const branchPointRef = doc(db, 'conversations', this.conversationId, 'branchPoints', messageId);
        const branchPointDoc = await transaction.get(branchPointRef);
        if (!branchPointDoc.exists()) {
          throw new Error(`BranchPoint for message ${messageId} not found`);
        }

        const branchPointData = branchPointDoc.data() as BranchPoint;

        // Lineが存在するかチェック
        if (!branchPointData.lines.includes(lineId)) {
          throw new Error(`Line ${lineId} is not in branch point ${messageId}`);
        }

        // Lineを削除
        const updatedLines = branchPointData.lines.filter(id => id !== lineId);

        if (updatedLines.length === 0) {
          // Lineが残っていない場合はBranchPoint自体を削除
          transaction.delete(branchPointRef);
          console.log(`✅ BranchPoint ${messageId} deleted (no lines remaining)`);
        } else {
          // 他のLineが残っている場合は更新
          transaction.update(branchPointRef, {
            lines: updatedLines,
            updatedAt: serverTimestamp()
          });
          console.log(`✅ Line ${lineId} removed from branch point ${messageId}`);
        }
      });

    } catch (error) {
      console.error(`❌ Failed to remove line ${lineId} from branch point ${messageId}:`, error);
      this.handleFirestoreError(error, 'removeLineFromBranchPoint');
      throw error;
    }
  }

  async deleteBranchPoint(messageId: string): Promise<void> {
    try {
      // バリデーション
      this.validateMessageId(messageId);

      console.log(`🗑️ Deleting branch point ${messageId} from Firestore...`);

      await runTransaction(db, async (transaction) => {
        // BranchPoint存在確認
        const branchPointRef = doc(db, 'conversations', this.conversationId, 'branchPoints', messageId);
        const branchPointDoc = await transaction.get(branchPointRef);
        if (!branchPointDoc.exists()) {
          throw new Error(`BranchPoint for message ${messageId} not found`);
        }

        const branchPointData = branchPointDoc.data() as BranchPoint;

        // 関連するLineの処理（branchFromMessageIdをクリア）
        if (branchPointData.lines && branchPointData.lines.length > 0) {
          for (const lineId of branchPointData.lines) {
            const lineRef = doc(db, 'conversations', this.conversationId, 'lines', lineId);
            const lineDoc = await transaction.get(lineRef);
            if (lineDoc.exists()) {
              const lineData = lineDoc.data() as Line;
              if (lineData.branchFromMessageId === messageId) {
                transaction.update(lineRef, {
                  branchFromMessageId: null,
                  updatedAt: serverTimestamp()
                });
              }
            }
          }
        }

        // BranchPoint削除
        transaction.delete(branchPointRef);
      });

      console.log(`✅ BranchPoint ${messageId} deleted successfully`);

    } catch (error) {
      console.error(`❌ Failed to delete branch point ${messageId}:`, error);
      this.handleFirestoreError(error, 'deleteBranchPoint');
      throw error;
    }
  }

  // Message Linking Management
  async linkMessages(prevMessageId: string, nextMessageId: string): Promise<void> {
    try {
      // バリデーション
      this.validateMessageId(prevMessageId);
      this.validateMessageId(nextMessageId);

      if (prevMessageId === nextMessageId) {
        throw new Error('Cannot link a message to itself');
      }

      console.log(`📝 Linking messages ${prevMessageId} -> ${nextMessageId} in Firestore...`);

      await runTransaction(db, async (transaction) => {
        // 両方のメッセージの存在確認
        const prevMessageRef = doc(db, 'conversations', this.conversationId, 'messages', prevMessageId);
        const nextMessageRef = doc(db, 'conversations', this.conversationId, 'messages', nextMessageId);

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

        const prevMessageData = prevMessageDoc.data() as Message;
        const nextMessageData = nextMessageDoc.data() as Message;

        // 循環参照チェック
        await this.checkForCircularReference(prevMessageId, nextMessageId, transaction);

        // 同じLine内のメッセージか確認
        if (prevMessageData.lineId !== nextMessageData.lineId) {
          throw new Error('Messages must be in the same line to be linked');
        }

        // 前のメッセージの nextInLine を更新
        transaction.update(prevMessageRef, {
          nextInLine: nextMessageId,
          updatedAt: serverTimestamp()
        });

        // 次のメッセージの prevInLine を更新
        transaction.update(nextMessageRef, {
          prevInLine: prevMessageId,
          updatedAt: serverTimestamp()
        });

        // Line の messageIds を更新
        await this.updateLineMessageIds(prevMessageData.lineId, transaction);
      });

      console.log(`✅ Messages linked: ${prevMessageId} -> ${nextMessageId}`);

    } catch (error) {
      console.error(`❌ Failed to link messages ${prevMessageId} -> ${nextMessageId}:`, error);
      this.handleFirestoreError(error, 'linkMessages');
      throw error;
    }
  }

  async unlinkMessages(messageId: string): Promise<void> {
    try {
      // バリデーション
      this.validateMessageId(messageId);

      console.log(`📝 Unlinking message ${messageId} in Firestore...`);

      await runTransaction(db, async (transaction) => {
        // メッセージ存在確認
        const messageRef = doc(db, 'conversations', this.conversationId, 'messages', messageId);
        const messageDoc = await transaction.get(messageRef);

        if (!messageDoc.exists()) {
          throw new Error(`Message with ID ${messageId} not found`);
        }

        const messageData = messageDoc.data() as Message;

        // 前のメッセージのnextInLineをクリア
        if (messageData.prevInLine) {
          const prevMessageRef = doc(db, 'conversations', this.conversationId, 'messages', messageData.prevInLine);
          const prevMessageDoc = await transaction.get(prevMessageRef);
          if (prevMessageDoc.exists()) {
            transaction.update(prevMessageRef, {
              nextInLine: null,
              updatedAt: serverTimestamp()
            });
          }
        }

        // 次のメッセージのprevInLineをクリア
        if (messageData.nextInLine) {
          const nextMessageRef = doc(db, 'conversations', this.conversationId, 'messages', messageData.nextInLine);
          const nextMessageDoc = await transaction.get(nextMessageRef);
          if (nextMessageDoc.exists()) {
            transaction.update(nextMessageRef, {
              prevInLine: null,
              updatedAt: serverTimestamp()
            });
          }
        }

        // 現在のメッセージのリンクをクリア
        transaction.update(messageRef, {
          prevInLine: null,
          nextInLine: null,
          updatedAt: serverTimestamp()
        });

        // Line の messageIds を更新
        if (messageData.lineId) {
          await this.updateLineMessageIds(messageData.lineId, transaction);
        }
      });

      console.log(`✅ Message ${messageId} unlinked successfully`);

    } catch (error) {
      console.error(`❌ Failed to unlink message ${messageId}:`, error);
      this.handleFirestoreError(error, 'unlinkMessages');
      throw error;
    }
  }

  async moveMessageToLine(messageId: string, targetLineId: string, position?: number): Promise<void> {
    try {
      // バリデーション
      this.validateMessageId(messageId);
      this.validateLineId(targetLineId);

      console.log(`📝 Moving message ${messageId} to line ${targetLineId} in Firestore...`);

      await runTransaction(db, async (transaction) => {
        // メッセージ存在確認
        const messageRef = doc(db, 'conversations', this.conversationId, 'messages', messageId);
        const messageDoc = await transaction.get(messageRef);

        if (!messageDoc.exists()) {
          throw new Error(`Message with ID ${messageId} not found`);
        }

        // ターゲットLine存在確認
        const targetLineRef = doc(db, 'conversations', this.conversationId, 'lines', targetLineId);
        const targetLineDoc = await transaction.get(targetLineRef);

        if (!targetLineDoc.exists()) {
          throw new Error(`Target line with ID ${targetLineId} not found`);
        }

        const messageData = messageDoc.data() as Message;
        const oldLineId = messageData.lineId;

        // 現在のLineから切断
        if (oldLineId) {
          await this.unlinkMessageFromCurrentPosition(messageId, transaction);
        }

        // 新しいLineに移動
        transaction.update(messageRef, {
          lineId: targetLineId,
          prevInLine: null,
          nextInLine: null,
          updatedAt: serverTimestamp()
        });

        // 指定された位置に挿入
        if (position !== undefined) {
          await this.insertMessageAtPosition(messageId, targetLineId, position, transaction);
        }

        // 両方のLineのmessageIdsを更新
        if (oldLineId && oldLineId !== targetLineId) {
          await this.updateLineMessageIds(oldLineId, transaction);
        }
        await this.updateLineMessageIds(targetLineId, transaction);
      });

      console.log(`✅ Message ${messageId} moved to line ${targetLineId}`);

    } catch (error) {
      console.error(`❌ Failed to move message ${messageId} to line ${targetLineId}:`, error);
      this.handleFirestoreError(error, 'moveMessageToLine');
      throw error;
    }
  }

  // Helper functions for message linking
  private async checkForCircularReference(prevMessageId: string, nextMessageId: string, transaction: Transaction): Promise<void> {
    const visited = new Set<string>();
    let currentId: string | null = nextMessageId;

    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);

      if (currentId === prevMessageId) {
        throw new Error('Linking these messages would create a circular reference');
      }

      const messageRef = doc(db, 'conversations', this.conversationId, 'messages', currentId);
      const messageDoc = await transaction.get(messageRef);

      if (!messageDoc.exists()) {
        break;
      }

      const messageData = messageDoc.data() as Message;
      currentId = messageData.nextInLine || null;
    }
  }

  private async updateLineMessageIds(lineId: string, transaction: Transaction): Promise<void> {
    const messagesRef = collection(db, 'conversations', this.conversationId, 'messages');
    const q = query(messagesRef, where('lineId', '==', lineId));
    const messagesSnapshot = await getDocs(q);

    const messagesMap = new Map<string, Message>();

    messagesSnapshot.forEach((doc) => {
      const messageData = doc.data() as Message;
      messagesMap.set(doc.id, messageData);
    });

    // メッセージチェーンを辿って正しい順序を構築
    const orderedIds = this.buildMessageChain(messagesMap);

    const lineRef = doc(db, 'conversations', this.conversationId, 'lines', lineId);
    transaction.update(lineRef, {
      messageIds: orderedIds,
      updatedAt: serverTimestamp()
    });
  }

  private buildMessageChain(messagesMap: Map<string, Message>): string[] {
    const orderedIds: string[] = [];
    const visited = new Set<string>();

    // 開始メッセージを見つける（prevInLineがnullのもの）
    let startMessageId: string | null = null;
    for (const [id, message] of Array.from(messagesMap.entries())) {
      if (!message.prevInLine) {
        startMessageId = id;
        break;
      }
    }

    // チェーンを辿る
    let currentId: string | null = startMessageId;
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      orderedIds.push(currentId);

      const currentMessage = messagesMap.get(currentId);
      currentId = currentMessage?.nextInLine || null;
    }

    // 訪問されていないメッセージを追加（孤立したメッセージ）
    for (const [id] of Array.from(messagesMap.entries())) {
      if (!visited.has(id)) {
        orderedIds.push(id);
      }
    }

    return orderedIds;
  }

  private async unlinkMessageFromCurrentPosition(messageId: string, transaction: Transaction): Promise<void> {
    const messageRef = doc(db, 'conversations', this.conversationId, 'messages', messageId);
    const messageDoc = await transaction.get(messageRef);

    if (!messageDoc.exists()) {
      return;
    }

    const messageData = messageDoc.data() as Message;

    // 前のメッセージと次のメッセージを直接リンク
    if (messageData.prevInLine && messageData.nextInLine) {
      const prevMessageRef = doc(db, 'conversations', this.conversationId, 'messages', messageData.prevInLine);
      const nextMessageRef = doc(db, 'conversations', this.conversationId, 'messages', messageData.nextInLine);

      transaction.update(prevMessageRef, {
        nextInLine: messageData.nextInLine,
        updatedAt: serverTimestamp()
      });

      transaction.update(nextMessageRef, {
        prevInLine: messageData.prevInLine,
        updatedAt: serverTimestamp()
      });
    } else if (messageData.prevInLine) {
      // 前のメッセージのnextInLineをクリア
      const prevMessageRef = doc(db, 'conversations', this.conversationId, 'messages', messageData.prevInLine);
      transaction.update(prevMessageRef, {
        nextInLine: null,
        updatedAt: serverTimestamp()
      });
    } else if (messageData.nextInLine) {
      // 次のメッセージのprevInLineをクリア
      const nextMessageRef = doc(db, 'conversations', this.conversationId, 'messages', messageData.nextInLine);
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

    const messagesMap = new Map<string, Message>();
    messagesSnapshot.forEach((doc) => {
      if (doc.id !== messageId) { // 移動中のメッセージは除外
        const messageData = doc.data() as Message;
        messagesMap.set(doc.id, messageData);
      }
    });

    const orderedIds = this.buildMessageChain(messagesMap);

    if (position >= orderedIds.length) {
      // 末尾に追加
      if (orderedIds.length > 0) {
        const lastMessageId = orderedIds[orderedIds.length - 1];
        const lastMessageRef = doc(db, 'conversations', this.conversationId, 'messages', lastMessageId);
        const messageRef = doc(db, 'conversations', this.conversationId, 'messages', messageId);

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
      // 先頭に挿入
      if (orderedIds.length > 0) {
        const firstMessageId = orderedIds[0];
        const firstMessageRef = doc(db, 'conversations', this.conversationId, 'messages', firstMessageId);
        const messageRef = doc(db, 'conversations', this.conversationId, 'messages', messageId);

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
      // 中間に挿入
      const prevMessageId = orderedIds[position - 1];
      const nextMessageId = orderedIds[position];

      const prevMessageRef = doc(db, 'conversations', this.conversationId, 'messages', prevMessageId);
      const nextMessageRef = doc(db, 'conversations', this.conversationId, 'messages', nextMessageId);
      const messageRef = doc(db, 'conversations', this.conversationId, 'messages', messageId);

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

  // Tag CRUD Operations
  async createTag(tag: Omit<Tag, 'id'>): Promise<string> {
    try {
      // バリデーション
      this.validateTag(tag);

      // 名前の重複チェック
      await this.checkTagNameDuplicate(tag.name);

      console.log('📝 Creating new tag in Firestore...');

      const tagsRef = collection(db, 'conversations', this.conversationId, 'tags');

      // Firestoreに送信するデータからundefinedを除去
      const tagData: Record<string, unknown> = {
        name: tag.name,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      // オプションフィールドをundefinedでない場合のみ追加
      if (tag.color !== undefined) {
        tagData.color = tag.color;
      }
      if (tag.groupId !== undefined) {
        tagData.groupId = tag.groupId;
      }

      const docRef = await addDoc(tagsRef, tagData);

      console.log(`✅ Tag created with ID: ${docRef.id}`);
      return docRef.id;

    } catch (error) {
      console.error('❌ Failed to create tag:', error);
      this.handleFirestoreError(error, 'createTag');
      throw error;
    }
  }

  async updateTag(id: string, updates: Partial<Tag>): Promise<void> {
    try {
      // バリデーション
      this.validateTagId(id);
      this.validateTagUpdates(updates);

      console.log(`📝 Updating tag ${id} in Firestore...`);

      const tagRef = doc(db, 'conversations', this.conversationId, 'tags', id);

      // タグ存在確認
      const tagDoc = await getDoc(tagRef);
      if (!tagDoc.exists()) {
        throw new Error(`Tag with ID ${id} not found`);
      }

      // 名前の重複チェック（変更される場合）
      if (updates.name) {
        await this.checkTagNameDuplicate(updates.name, id);
      }

      // Firestoreに送信するデータからundefinedを除去
      const updateData: Record<string, unknown> = {
        updatedAt: serverTimestamp()
      };

      // 実際に更新されるフィールドのみ追加
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

      console.log(`✅ Tag ${id} updated successfully`);

    } catch (error) {
      console.error(`❌ Failed to update tag ${id}:`, error);
      this.handleFirestoreError(error, 'updateTag');
      throw error;
    }
  }

  async deleteTag(id: string): Promise<void> {
    try {
      // バリデーション
      this.validateTagId(id);

      console.log(`🗑️ Deleting tag ${id} from Firestore...`);

      const tagRef = doc(db, 'conversations', this.conversationId, 'tags', id);

      // タグ存在確認
      const tagDoc = await getDoc(tagRef);
      if (!tagDoc.exists()) {
        throw new Error(`Tag with ID ${id} not found`);
      }

      // 関連するメッセージからタグを削除
      await this.removeTagFromAllMessages(id);

      // 関連するラインからタグを削除
      await this.removeTagFromAllLines(id);

      // タグ削除
      await deleteDoc(tagRef);

      console.log(`✅ Tag ${id} deleted successfully`);

    } catch (error) {
      console.error(`❌ Failed to delete tag ${id}:`, error);
      this.handleFirestoreError(error, 'deleteTag');
      throw error;
    }
  }

  // Tag バリデーション関数
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

  // Tag制約チェック関数
  private async checkTagNameDuplicate(name: string, excludeId?: string): Promise<void> {
    const tagsRef = collection(db, 'conversations', this.conversationId, 'tags');
    const q = query(tagsRef, where('name', '==', name));
    const querySnapshot = await getDocs(q);

    const duplicates = querySnapshot.docs.filter(doc => doc.id !== excludeId);

    if (duplicates.length > 0) {
      throw new Error(`Tag with name "${name}" already exists`);
    }
  }

  // 関連データ処理
  private async removeTagFromAllMessages(tagId: string): Promise<void> {
    const messagesRef = collection(db, 'conversations', this.conversationId, 'messages');
    const q = query(messagesRef, where('tags', 'array-contains', tagId));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      console.log('No messages with this tag found');
      return;
    }

    const batch = writeBatch(db);

    querySnapshot.forEach((messageDoc) => {
      const messageData = messageDoc.data() as Message;
      const updatedTags = (messageData.tags || []).filter(id => id !== tagId);

      batch.update(messageDoc.ref, {
        tags: updatedTags,
        updatedAt: serverTimestamp()
      });
    });

    await batch.commit();
    console.log(`✅ Tag ${tagId} removed from all messages`);
  }

  private async removeTagFromAllLines(tagId: string): Promise<void> {
    const linesRef = collection(db, 'conversations', this.conversationId, 'lines');
    const q = query(linesRef, where('tagIds', 'array-contains', tagId));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      console.log('No lines with this tag found');
      return;
    }

    const batch = writeBatch(db);

    querySnapshot.forEach((lineDoc) => {
      const lineData = lineDoc.data() as Line;
      const updatedTagIds = (lineData.tagIds || []).filter(id => id !== tagId);

      batch.update(lineDoc.ref, {
        tagIds: updatedTagIds,
        updatedAt: serverTimestamp()
      });
    });

    await batch.commit();
    console.log(`✅ Tag ${tagId} removed from all lines`);
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
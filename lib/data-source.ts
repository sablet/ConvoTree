'use client';

import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
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
}

export const dataSourceManager = DataSourceManager.getInstance();
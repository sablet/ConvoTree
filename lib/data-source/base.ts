import type { Message, Line, Tag, TagGroup, BranchPoint } from '@/lib/types';

export interface ChatData {
  messages: Record<string, Message>;
  lines: Line[];
  branchPoints: Record<string, BranchPoint>;
  tags: Record<string, Tag>;
  tagGroups: Record<string, TagGroup>;
}

export type MessageInput = Omit<Message, 'id' | 'timestamp'> & {
  timestamp: string | Date;
};

export interface IDataSource {
  // Data loading
  loadChatData(): Promise<ChatData>;

  // Message operations
  createMessage(message: MessageInput): Promise<string>;
  updateMessage(id: string, updates: Partial<Omit<Message, 'timestamp'>> & { timestamp?: string | Date }): Promise<void>;
  deleteMessage(id: string): Promise<void>;

  // Line operations
  createLine(line: Omit<Line, 'id'>): Promise<string>;
  updateLine(id: string, updates: Partial<Line>): Promise<void>;
  deleteLine(id: string): Promise<void>;

  // Tag operations
  createTag(tag: Omit<Tag, 'id'>): Promise<string>;
  updateTag(id: string, updates: Partial<Tag>): Promise<void>;
  deleteTag(id: string): Promise<void>;

  // TagGroup operations
  createTagGroup(tagGroup: Omit<TagGroup, 'id'>): Promise<string>;
  updateTagGroup(id: string, updates: Partial<TagGroup>): Promise<void>;
  deleteTagGroup(id: string, tagHandlingOption?: 'delete' | 'unlink'): Promise<void>;
  reorderTagGroups(orderedIds: string[]): Promise<void>;

  // BranchPoint operations
  createBranchPoint(messageId: string): Promise<void>;
  addLineToBranchPoint(messageId: string, lineId: string): Promise<void>;
  removeLineFromBranchPoint(messageId: string, lineId: string): Promise<void>;
  deleteBranchPoint(messageId: string): Promise<void>;

  // Message linking operations
  linkMessages(prevMessageId: string, nextMessageId: string): Promise<void>;
  unlinkMessages(messageId: string): Promise<void>;
  moveMessageToLine(messageId: string, targetLineId: string, position?: number): Promise<void>;

  // Atomic operations
  createMessageWithLineUpdate(
    messageData: MessageInput,
    lineId: string,
    prevMessageId?: string
  ): Promise<string>;
}

export type DataSource = 'firestore' | 'sample' | 'cache';

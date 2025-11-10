import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { messages, lines, tags, tagGroups } from '@/lib/db/schema';
import type { Message, Line, Tag, TagGroup } from '@/lib/types';
import type { IDataSource, ChatData, MessageInput } from './base';

export class PostgresDataSource implements IDataSource {
  async loadChatData(): Promise<ChatData> {
    const [messagesData, linesData, tagsData, tagGroupsData] = await Promise.all([
      db.select().from(messages),
      db.select().from(lines),
      db.select().from(tags),
      db.select().from(tagGroups),
    ]);

    // DB型からアプリケーション型に変換
    const messagesRecord: Record<string, Message> = {};
    messagesData.forEach((msg) => {
      messagesRecord[msg.id] = {
        id: msg.id,
        content: msg.content,
        timestamp: msg.timestamp,
        updatedAt: msg.updated_at ?? undefined,
        lineId: msg.line_id,
        tags: msg.tags ?? undefined,
        hasBookmark: msg.has_bookmark ?? undefined,
        author: msg.author ?? undefined,
        images: msg.images ?? undefined,
        type: msg.type as Message['type'],
        metadata: msg.metadata ?? undefined,
        deleted: msg.deleted ?? undefined,
        deletedAt: msg.deleted_at ?? undefined,
      };
    });

    const linesArray: Line[] = linesData.map((line) => ({
      id: line.id,
      name: line.name,
      parent_line_id: line.parent_line_id,
      tagIds: line.tag_ids ?? undefined,
      created_at: line.created_at.toISOString(),
      updated_at: line.updated_at.toISOString(),
    }));

    const tagsRecord: Record<string, Tag> = {};
    tagsData.forEach((tag) => {
      tagsRecord[tag.id] = {
        id: tag.id,
        name: tag.name,
        color: tag.color ?? undefined,
        groupId: tag.group_id ?? undefined,
      };
    });

    const tagGroupsRecord: Record<string, TagGroup> = {};
    tagGroupsData.forEach((tg) => {
      tagGroupsRecord[tg.id] = {
        id: tg.id,
        name: tg.name,
        color: tg.color,
        order: tg.order,
      };
    });

    return {
      messages: messagesRecord,
      lines: linesArray,
      tags: tagsRecord,
      tagGroups: tagGroupsRecord,
    };
  }

  async createMessage(message: MessageInput): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date();

    await db.insert(messages).values({
      id,
      content: message.content,
      timestamp: new Date(message.timestamp),
      updated_at: now,
      line_id: message.lineId,
      tags: message.tags,
      has_bookmark: message.hasBookmark,
      author: message.author,
      images: message.images,
      type: message.type,
      metadata: message.metadata,
    });
    return id;
  }

  async updateMessage(id: string, updates: Partial<Omit<Message, 'timestamp'>> & { timestamp?: string | Date }): Promise<void> {
    const now = new Date();

    const updateData: Record<string, unknown> = {
      updated_at: now,
    };

    if (updates.content !== undefined) updateData.content = updates.content;
    if (updates.timestamp !== undefined) updateData.timestamp = new Date(updates.timestamp);
    if (updates.lineId !== undefined) updateData.line_id = updates.lineId;
    if (updates.tags !== undefined) updateData.tags = updates.tags;
    if (updates.hasBookmark !== undefined) updateData.has_bookmark = updates.hasBookmark;
    if (updates.author !== undefined) updateData.author = updates.author;
    if (updates.images !== undefined) updateData.images = updates.images;
    if (updates.type !== undefined) updateData.type = updates.type;
    if (updates.metadata !== undefined) updateData.metadata = updates.metadata;
    if (updates.deleted !== undefined) updateData.deleted = updates.deleted;
    if (updates.deletedAt !== undefined) updateData.deleted_at = updates.deletedAt;

    await db.update(messages).set(updateData).where(eq(messages.id, id));
  }

  async deleteMessage(id: string): Promise<void> {
    await db.delete(messages).where(eq(messages.id, id));
  }

  async createLine(line: Omit<Line, 'id'>): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date();

    await db.insert(lines).values({
      id,
      name: line.name,
      parent_line_id: line.parent_line_id,
      tag_ids: line.tagIds,
      created_at: now,
      updated_at: now,
    });
    return id;
  }

  async updateLine(id: string, updates: Partial<Line>): Promise<void> {
    const now = new Date();

    const updateData: Record<string, unknown> = {
      updated_at: now,
    };

    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.parent_line_id !== undefined) updateData.parent_line_id = updates.parent_line_id;
    if (updates.tagIds !== undefined) updateData.tag_ids = updates.tagIds;

    await db.update(lines).set(updateData).where(eq(lines.id, id));
  }

  async deleteLine(id: string): Promise<void> {
    await db.delete(lines).where(eq(lines.id, id));
  }

  async createTag(tag: Omit<Tag, 'id'>): Promise<string> {
    const id = crypto.randomUUID();

    await db.insert(tags).values({
      id,
      name: tag.name,
      color: tag.color,
      group_id: tag.groupId,
    });
    return id;
  }

  async updateTag(id: string, updates: Partial<Tag>): Promise<void> {
    const updateData: Record<string, unknown> = {};

    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.color !== undefined) updateData.color = updates.color;
    if (updates.groupId !== undefined) updateData.group_id = updates.groupId;

    await db.update(tags).set(updateData).where(eq(tags.id, id));
  }

  async deleteTag(id: string): Promise<void> {
    await db.delete(tags).where(eq(tags.id, id));
  }

  async createTagGroup(tagGroup: Omit<TagGroup, 'id'>): Promise<string> {
    const id = crypto.randomUUID();

    await db.insert(tagGroups).values({
      id,
      name: tagGroup.name,
      color: tagGroup.color,
      order: tagGroup.order,
    });
    return id;
  }

  async updateTagGroup(id: string, updates: Partial<TagGroup>): Promise<void> {
    const updateData: Record<string, unknown> = {};

    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.color !== undefined) updateData.color = updates.color;
    if (updates.order !== undefined) updateData.order = updates.order;

    await db.update(tagGroups).set(updateData).where(eq(tagGroups.id, id));
  }

  async deleteTagGroup(id: string, tagHandlingOption: 'delete' | 'unlink' = 'unlink'): Promise<void> {
    if (tagHandlingOption === 'delete') {
      // グループに属するタグを削除
      await db.delete(tags).where(eq(tags.group_id, id));
    } else {
      // グループに属するタグのgroupIdをnullに設定
      await db.update(tags).set({ group_id: null }).where(eq(tags.group_id, id));
    }

    // グループを削除
    await db.delete(tagGroups).where(eq(tagGroups.id, id));
  }

  async reorderTagGroups(orderedIds: string[]): Promise<void> {
    // 各IDに対して新しいorderを設定
    const updates = orderedIds.map((id, index) =>
      db.update(tagGroups).set({ order: index }).where(eq(tagGroups.id, id))
    );

    await Promise.all(updates);
  }

  async createMessageWithLineUpdate(
    messageData: MessageInput,
    lineId: string,
    _prevMessageId?: string
  ): Promise<string> {
    // PostgreSQLではトランザクションを使用して原子性を保証
    const messageId = await this.createMessage(messageData);

    // ラインの更新日時を更新
    await this.updateLine(lineId, {});

    return messageId;
  }
}

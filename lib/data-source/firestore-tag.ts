'use client';

import { collection, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, writeBatch, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { CONVERSATIONS_COLLECTION, TAGS_SUBCOLLECTION, TAG_GROUPS_SUBCOLLECTION } from '@/lib/firestore-constants';
import type { Tag, TagGroup } from '@/lib/types';

export class FirestoreTagOperations {
  private conversationId: string;

  constructor(conversationId: string) {
    this.conversationId = conversationId;
  }

  async createTagGroup(tagGroup: Omit<TagGroup, 'id'>): Promise<string> {
    try {
      this.validateTagGroup(tagGroup);

      await this.checkTagGroupNameDuplicate(tagGroup.name);

      await this.checkTagGroupOrderDuplicate(tagGroup.order);

      const tagGroupsRef = collection(db, 'conversations', this.conversationId, 'tagGroups');

      const tagGroupData = {
        ...tagGroup,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      const docRef = await addDoc(tagGroupsRef, tagGroupData);

      return docRef.id;

    } catch (error) {
      console.error('❌ Failed to create tag group:', error);
      throw error;
    }
  }

  async updateTagGroup(id: string, updates: Partial<TagGroup>): Promise<void> {
    try {
      this.validateTagGroupId(id);
      this.validateTagGroupUpdates(updates);

      const tagGroupRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, TAG_GROUPS_SUBCOLLECTION, id);

      const tagGroupDoc = await getDoc(tagGroupRef);
      if (!tagGroupDoc.exists()) {
        throw new Error(`TagGroup with ID ${id} not found`);
      }

      if (updates.name) {
        await this.checkTagGroupNameDuplicate(updates.name, id);
      }

      if (updates.order !== undefined) {
        await this.checkTagGroupOrderDuplicate(updates.order, id);
      }

      const updateData = {
        ...updates,
        updatedAt: serverTimestamp()
      };

      await updateDoc(tagGroupRef, updateData);

    } catch (error) {
      console.error(`❌ Failed to update tag group ${id}:`, error);
      throw error;
    }
  }

  async deleteTagGroup(id: string, tagHandlingOption: 'delete' | 'unlink' = 'unlink'): Promise<void> {
    try {
      this.validateTagGroupId(id);

      const tagGroupRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, TAG_GROUPS_SUBCOLLECTION, id);

      const tagGroupDoc = await getDoc(tagGroupRef);
      if (!tagGroupDoc.exists()) {
        throw new Error(`TagGroup with ID ${id} not found`);
      }

      await this.handleRelatedTagsForDeletion(id, tagHandlingOption);

      await deleteDoc(tagGroupRef);

    } catch (error) {
      console.error(`❌ Failed to delete tag group ${id}:`, error);
      throw error;
    }
  }

  async reorderTagGroups(orderedIds: string[]): Promise<void> {
    try {
      if (orderedIds.length === 0) {
        throw new Error('Ordered IDs array cannot be empty');
      }

      const batch = writeBatch(db);

      for (let i = 0; i < orderedIds.length; i++) {
        const tagGroupId = orderedIds[i];
        const tagGroupRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, TAG_GROUPS_SUBCOLLECTION, tagGroupId);

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

    } catch (error) {
      console.error('❌ Failed to reorder tag groups:', error);
      throw error;
    }
  }

  async createTag(tag: Omit<Tag, 'id'>): Promise<string> {
    try {
      this.validateTag(tag);

      await this.checkTagNameDuplicate(tag.name);

      const tagsRef = collection(db, 'conversations', this.conversationId, 'tags');

      const tagData: Record<string, unknown> = {
        name: tag.name,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      if (tag.color !== undefined) {
        tagData.color = tag.color;
      }
      if (tag.groupId !== undefined) {
        tagData.groupId = tag.groupId;
      }

      const docRef = await addDoc(tagsRef, tagData);

      return docRef.id;

    } catch (error) {
      console.error('❌ Failed to create tag:', error);
      throw error;
    }
  }

  async updateTag(id: string, updates: Partial<Tag>): Promise<void> {
    try {
      this.validateTagId(id);
      this.validateTagUpdates(updates);

      const tagRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, TAGS_SUBCOLLECTION, id);

      const tagDoc = await getDoc(tagRef);
      if (!tagDoc.exists()) {
        throw new Error(`Tag with ID ${id} not found`);
      }

      if (updates.name) {
        await this.checkTagNameDuplicate(updates.name, id);
      }

      const updateData: Record<string, unknown> = {
        updatedAt: serverTimestamp()
      };

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

    } catch (error) {
      console.error(`❌ Failed to update tag ${id}:`, error);
      throw error;
    }
  }

  async deleteTag(id: string): Promise<void> {
    try {
      this.validateTagId(id);

      const tagRef = doc(db, CONVERSATIONS_COLLECTION, this.conversationId, TAGS_SUBCOLLECTION, id);

      const tagDoc = await getDoc(tagRef);
      if (!tagDoc.exists()) {
        throw new Error(`Tag with ID ${id} not found`);
      }

      await this.removeTagFromAllMessages(id);

      await this.removeTagFromAllLines(id);

      await deleteDoc(tagRef);

    } catch (error) {
      console.error(`❌ Failed to delete tag ${id}:`, error);
      throw error;
    }
  }

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

  private async handleRelatedTagsForDeletion(tagGroupId: string, option: 'delete' | 'unlink'): Promise<void> {
    const tagsRef = collection(db, 'conversations', this.conversationId, 'tags');
    const q = query(tagsRef, where('groupId', '==', tagGroupId));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return;
    }

    const batch = writeBatch(db);

    querySnapshot.forEach((tagDoc) => {
      if (option === 'delete') {
        batch.delete(tagDoc.ref);
      } else {
        batch.update(tagDoc.ref, {
          groupId: null,
          updatedAt: serverTimestamp()
        });
      }
    });

    await batch.commit();
  }

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

  private async checkTagNameDuplicate(name: string, excludeId?: string): Promise<void> {
    const tagsRef = collection(db, 'conversations', this.conversationId, 'tags');
    const q = query(tagsRef, where('name', '==', name));
    const querySnapshot = await getDocs(q);

    const duplicates = querySnapshot.docs.filter(doc => doc.id !== excludeId);

    if (duplicates.length > 0) {
      throw new Error(`Tag with name "${name}" already exists`);
    }
  }

  private async removeTagFromAllMessages(tagId: string): Promise<void> {
    const messagesRef = collection(db, 'conversations', this.conversationId, 'messages');
    const q = query(messagesRef, where('tags', 'array-contains', tagId));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return;
    }

    const batch = writeBatch(db);

    querySnapshot.forEach((messageDoc) => {
      const messageData = messageDoc.data();
      const updatedTags = (messageData.tags || []).filter((id: string) => id !== tagId);

      batch.update(messageDoc.ref, {
        tags: updatedTags,
        updatedAt: serverTimestamp()
      });
    });

    await batch.commit();
  }

  private async removeTagFromAllLines(tagId: string): Promise<void> {
    const linesRef = collection(db, 'conversations', this.conversationId, 'lines');
    const q = query(linesRef, where('tagIds', 'array-contains', tagId));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return;
    }

    const batch = writeBatch(db);

    querySnapshot.forEach((lineDoc) => {
      const lineData = lineDoc.data();
      const updatedTagIds = (lineData.tagIds || []).filter((id: string) => id !== tagId);

      batch.update(lineDoc.ref, {
        tagIds: updatedTagIds,
        updated_at: new Date().toISOString(),
        updatedAt: serverTimestamp()
      });
    });

    await batch.commit();
  }
}

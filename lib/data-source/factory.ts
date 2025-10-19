'use client';

import { config } from '@/lib/config';
import type { DataSource, IDataSource } from './base';
import { FirestoreDataSource } from './firestore';
import { SampleDataSource } from './sample';

export class DataSourceFactory {
  static create(type: DataSource, conversationId: string): IDataSource {
    switch (type) {
      case 'firestore':
        return new FirestoreDataSource(conversationId);
      case 'sample':
        return new SampleDataSource();
      default:
        throw new Error(`Unknown data source type: ${type}`);
    }
  }
}

// eslint-disable-next-line no-use-before-define
export class DataSourceManager {
  // eslint-disable-next-line no-use-before-define
  private static instance: DataSourceManager | undefined;
  private currentSource: DataSource = config.defaultDataSource;
  private conversationId = config.conversationId;
  private dataSource: IDataSource;

  private constructor() {
    console.log(`🚀 DataSource initialized: ${this.currentSource}, Conversation: ${this.conversationId}`);
    this.dataSource = DataSourceFactory.create(this.currentSource, this.conversationId);
  }

  static getInstance(): DataSourceManager {
    if (!this.instance) {
      this.instance = new DataSourceManager();
    }
    return this.instance;
  }

  setDataSource(source: DataSource): void {
    this.currentSource = source;
    this.dataSource = DataSourceFactory.create(source, this.conversationId);
  }

  getCurrentSource(): DataSource {
    return this.currentSource;
  }

  getDataSource(): IDataSource {
    return this.dataSource;
  }

  async loadChatData() {
    return this.dataSource.loadChatData();
  }

  async createMessage(message: Parameters<IDataSource['createMessage']>[0]) {
    return this.dataSource.createMessage(message);
  }

  async updateMessage(id: string, updates: Parameters<IDataSource['updateMessage']>[1]) {
    return this.dataSource.updateMessage(id, updates);
  }

  async deleteMessage(id: string) {
    return this.dataSource.deleteMessage(id);
  }

  async createLine(line: Parameters<IDataSource['createLine']>[0]) {
    return this.dataSource.createLine(line);
  }

  async updateLine(id: string, updates: Parameters<IDataSource['updateLine']>[1]) {
    return this.dataSource.updateLine(id, updates);
  }

  async deleteLine(id: string) {
    return this.dataSource.deleteLine(id);
  }

  async createTag(tag: Parameters<IDataSource['createTag']>[0]) {
    return this.dataSource.createTag(tag);
  }

  async updateTag(id: string, updates: Parameters<IDataSource['updateTag']>[1]) {
    return this.dataSource.updateTag(id, updates);
  }

  async deleteTag(id: string) {
    return this.dataSource.deleteTag(id);
  }

  async createTagGroup(tagGroup: Parameters<IDataSource['createTagGroup']>[0]) {
    return this.dataSource.createTagGroup(tagGroup);
  }

  async updateTagGroup(id: string, updates: Parameters<IDataSource['updateTagGroup']>[1]) {
    return this.dataSource.updateTagGroup(id, updates);
  }

  async deleteTagGroup(id: string, tagHandlingOption?: Parameters<IDataSource['deleteTagGroup']>[1]) {
    return this.dataSource.deleteTagGroup(id, tagHandlingOption);
  }

  async reorderTagGroups(orderedIds: string[]) {
    return this.dataSource.reorderTagGroups(orderedIds);
  }

  async createBranchPoint(messageId: string) {
    return this.dataSource.createBranchPoint(messageId);
  }

  async addLineToBranchPoint(messageId: string, lineId: string) {
    return this.dataSource.addLineToBranchPoint(messageId, lineId);
  }

  async removeLineFromBranchPoint(messageId: string, lineId: string) {
    return this.dataSource.removeLineFromBranchPoint(messageId, lineId);
  }

  async deleteBranchPoint(messageId: string) {
    return this.dataSource.deleteBranchPoint(messageId);
  }

  async linkMessages(prevMessageId: string, nextMessageId: string) {
    return this.dataSource.linkMessages(prevMessageId, nextMessageId);
  }

  async unlinkMessages(messageId: string) {
    return this.dataSource.unlinkMessages(messageId);
  }

  async moveMessageToLine(messageId: string, targetLineId: string, position?: number) {
    return this.dataSource.moveMessageToLine(messageId, targetLineId, position);
  }

  async createMessageWithLineUpdate(
    messageData: Parameters<IDataSource['createMessageWithLineUpdate']>[0],
    lineId: string,
    prevMessageId?: string
  ) {
    return this.dataSource.createMessageWithLineUpdate(messageData, lineId, prevMessageId);
  }

  async createLineAndMoveMessages(messageIds: string[], lineName: string) {
    return this.dataSource.createLineAndMoveMessages(messageIds, lineName);
  }
}

export const dataSourceManager = DataSourceManager.getInstance();

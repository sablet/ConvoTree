import type { IDataSource } from './base';

export async function migrateData(
  from: IDataSource,
  to: IDataSource
): Promise<void> {
  const data = await from.loadChatData();

  for (const message of Object.values(data.messages)) {
    const { id: _id, ...messageData } = message;
    await to.createMessage(messageData);
  }

  for (const line of data.lines) {
    const { id: _id, ...lineData } = line;
    await to.createLine(lineData);
  }

  for (const tag of Object.values(data.tags)) {
    const { id: _id, ...tagData } = tag;
    await to.createTag(tagData);
  }

  for (const tagGroup of Object.values(data.tagGroups)) {
    const { id: _id, ...tagGroupData } = tagGroup;
    await to.createTagGroup(tagGroupData);
  }

  for (const [messageId, branchPoint] of Object.entries(data.branchPoints)) {
    await to.createBranchPoint(messageId);
    for (const lineId of branchPoint.lines) {
      await to.addLineToBranchPoint(messageId, lineId);
    }
  }
}

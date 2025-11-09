import { dataSourceManager } from '@/lib/data-source';
import type { Message } from '@/lib/types';
import { createNewMessage } from './message-send';

/**
 * Create a message with a specific timestamp
 */
export const createMessageWithTimestamp = (
  content: string,
  images: string[],
  targetLineId: string,
  timestamp: Date
): Promise<{ messageId: string; message: Message }> => {
  return createNewMessage({
    content,
    images,
    targetLineId
  }).then(async ({ messageId, message }) => {
    // Update the timestamp in Firestore
    await dataSourceManager.updateMessage(messageId, {
      timestamp: timestamp.toISOString()
    });

    return { messageId, message };
  });
};

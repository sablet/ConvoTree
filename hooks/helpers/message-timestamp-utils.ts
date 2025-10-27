import { dataSourceManager } from '@/lib/data-source';
import type { Message } from '@/lib/types';
import { createNewMessage } from './message-send';

/**
 * Create a message with a specific timestamp
 */
export const createMessageWithTimestamp = (
  content: string,
  images: string[],
  baseMessageId: string | null,  // Update this to handle null properly
  targetLineId: string,
  timestamp: Date
): Promise<{ messageId: string; message: Message }> => {
  return createNewMessage({
    content,
    images,
    targetLineId,
    baseMessageId: baseMessageId || undefined  // Convert null to undefined if needed
  }).then(async ({ messageId, message }) => {
    // Update the timestamp in Firestore
    await dataSourceManager.updateMessage(messageId, {
      timestamp: timestamp.toISOString()
    });

    return { messageId, message };
  });
};

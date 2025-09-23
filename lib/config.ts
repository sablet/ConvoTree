export const config = {
  conversationId: process.env.NEXT_PUBLIC_CONVERSATION_ID || "",
  defaultDataSource: (process.env.NEXT_PUBLIC_DEFAULT_DATA_SOURCE as 'firestore' | 'sample') || 'firestore',
} as const;
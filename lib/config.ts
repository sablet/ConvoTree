export const config = {
  conversationId: (process.env.NEXT_PUBLIC_CONVERSATION_ID || "").trim(),
  defaultDataSource: ((process.env.NEXT_PUBLIC_DEFAULT_DATA_SOURCE || 'firestore').trim() as 'firestore' | 'sample' | 'cache' | 'postgres'),
} as const;
export const config = {
  conversationId: (process.env.NEXT_PUBLIC_CONVERSATION_ID || "").trim(),
  defaultDataSource: ((process.env.NEXT_PUBLIC_DEFAULT_DATA_SOURCE || 'postgres').trim() as 'sample' | 'postgres'),
} as const;
export const config = {
  defaultDataSource: ((process.env.NEXT_PUBLIC_DEFAULT_DATA_SOURCE || 'postgres').trim() as 'sample' | 'postgres'),
} as const;
'use client';

import { createContext, useContext, ReactNode, useRef } from 'react';
import { ChatRepository } from '@/lib/repositories/chat-repository';
import { config } from '@/lib/config';

interface ChatRepositoryContextType {
  repository: ChatRepository;
}

const ChatRepositoryContext = createContext<ChatRepositoryContextType | undefined>(undefined);

export function useChatRepository() {
  const context = useContext(ChatRepositoryContext);
  if (!context) {
    throw new Error('useChatRepository must be used within a ChatRepositoryProvider');
  }
  return context.repository;
}

interface ChatRepositoryProviderProps {
  children: ReactNode;
  conversationId?: string;
}

/**
 * ChatRepositoryをReact Contextで管理し、
 * アプリケーション全体で単一のインスタンスを保証する
 */
export function ChatRepositoryProvider({ children, conversationId }: ChatRepositoryProviderProps) {
  const repositoryRef = useRef<ChatRepository | null>(null);

  // 初回レンダリング時にRepositoryインスタンスを作成
  if (!repositoryRef.current) {
    repositoryRef.current = new ChatRepository(conversationId ?? config.conversationId);
  }

  const repository = repositoryRef.current;

  return (
    <ChatRepositoryContext.Provider value={{ repository }}>
      {children}
    </ChatRepositoryContext.Provider>
  );
}

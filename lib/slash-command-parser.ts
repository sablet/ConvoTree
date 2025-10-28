// スラッシュコマンドの解析とメッセージタイプの判定
import {
  MESSAGE_TYPE_TEXT,
  MESSAGE_TYPE_TASK,
  MESSAGE_TYPE_DOCUMENT,
  MESSAGE_TYPE_SESSION,
  SLASH_COMMAND_TASK,
  SLASH_COMMAND_TASK_HIGH,
  SLASH_COMMAND_TASK_MEDIUM,
  SLASH_COMMAND_TASK_LOW,
  SLASH_COMMAND_TASK_COMPLETED,
  SLASH_COMMAND_DOCUMENT,
  SLASH_COMMAND_SESSION
} from '@/lib/constants'
import type { MessageType } from '@/lib/constants'
import type { TaskPriority } from '@/lib/types/task'

interface ParsedMessage {
  content: string // コマンドを除いた実際のメッセージ内容
  type: MessageType
  metadata?: Record<string, unknown>
}

interface SlashCommandPattern {
  pattern: RegExp
  type: ParsedMessage['type']
  metadata?: ParsedMessage['metadata']
}

type TaskCommandMetadata = Record<string, unknown> & {
  completed?: boolean
  completedAt?: string
  createdAt?: string
}

// サポートするスラッシュコマンドパターン
const escapeForRegExp = (command: string) => command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const buildCommandPattern = (command: string) => new RegExp(`^${escapeForRegExp(command)}\\s+([\\s\\S]*)$`)

const createTaskCommand = (
  command: string,
  priority: TaskPriority,
  overrides?: Record<string, unknown>
): SlashCommandPattern => ({
  pattern: buildCommandPattern(command),
  type: MESSAGE_TYPE_TASK,
  metadata: {
    priority,
    completed: false,
    tags: [],
    ...(overrides ? { ...overrides } : {})
  }
})

const COMMAND_PATTERNS: SlashCommandPattern[] = [
  createTaskCommand(SLASH_COMMAND_TASK_HIGH, 'high'),
  createTaskCommand(SLASH_COMMAND_TASK_MEDIUM, 'medium'),
  createTaskCommand(SLASH_COMMAND_TASK_LOW, 'low'),
  createTaskCommand(SLASH_COMMAND_TASK, 'medium'),
  createTaskCommand(SLASH_COMMAND_TASK_COMPLETED, 'medium', { completed: true }),
  {
    pattern: buildCommandPattern(SLASH_COMMAND_DOCUMENT),
    type: MESSAGE_TYPE_DOCUMENT,
    metadata: {
      isCollapsed: false,
      wordCount: 0, // 後で設定
      originalLength: 0, // 後で設定
      title: '' // タイトル（最初の行）
    }
  },
  {
    pattern: buildCommandPattern(SLASH_COMMAND_SESSION),
    type: MESSAGE_TYPE_SESSION,
    metadata: {
      timeSpent: 0,
      autoStart: true
    }
  }
]

const createDocumentMessage = (
  content: string,
  baseMetadata?: ParsedMessage['metadata']
): ParsedMessage => {
  const lines = content.split('\n')
  const title = lines[0]?.trim() || ''
  const metadata = {
    ...(baseMetadata ? { ...baseMetadata } : {}),
    wordCount: content.length,
    originalLength: content.length,
    title
  }

  return {
    content,
    type: MESSAGE_TYPE_DOCUMENT,
    metadata
  }
}

const createTaskMessage = (
  content: string,
  baseMetadata?: ParsedMessage['metadata']
): ParsedMessage => {
  const nowIso = new Date().toISOString()
  const base = (baseMetadata ?? {}) as TaskCommandMetadata
  const metadata: TaskCommandMetadata = {
    ...base,
    createdAt: nowIso
  }

  if (metadata.completed === true && metadata.completedAt === undefined) {
    metadata.completedAt = nowIso
  }

  return {
    content,
    type: MESSAGE_TYPE_TASK,
    metadata
  }
}

const createParsedMessage = (
  content: string,
  type: ParsedMessage['type'],
  metadata?: ParsedMessage['metadata']
): ParsedMessage => {
  if (type === MESSAGE_TYPE_DOCUMENT) {
    return createDocumentMessage(content, metadata)
  }

  if (type === MESSAGE_TYPE_TASK) {
    return createTaskMessage(content, metadata)
  }

  return {
    content,
    type,
    metadata
  }
}

/**
 * 入力されたメッセージからスラッシュコマンドを解析する
 */
export function parseSlashCommand(input: string): ParsedMessage {
  const trimmedInput = input.trim()

  // 各パターンをチェック
  for (const { pattern, type, metadata } of COMMAND_PATTERNS) {
    const match = trimmedInput.match(pattern)
    if (match) {
      const content = match[1]?.trim() || ''
      return createParsedMessage(content, type, metadata)
    }
  }

  // スラッシュコマンドが見つからない場合は通常のテキストメッセージ
  return {
    content: trimmedInput,
    type: MESSAGE_TYPE_TEXT
  }
}

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

      // ドキュメントの場合、文字数とタイトルを設定
      if (type === MESSAGE_TYPE_DOCUMENT && metadata) {
        const lines = content.split('\n')
        const title = lines[0]?.trim() || ''

        const updatedMetadata = {
          ...metadata,
          wordCount: content.length,
          originalLength: content.length,
          title
        }
        return {
          content,
          type,
          metadata: updatedMetadata
        }
      }

      if (type === MESSAGE_TYPE_TASK) {
        const nowIso = new Date().toISOString()
        const baseMetadata = metadata ? { ...metadata } : {}
        const isCompleted = baseMetadata.completed === true
        const taskMetadata: Record<string, unknown> = {
          ...baseMetadata,
          createdAt: nowIso
        }

        if (isCompleted && baseMetadata.completedAt === undefined) {
          taskMetadata.completedAt = nowIso
        }

        return {
          content,
          type,
          metadata: taskMetadata
        }
      }

      return {
        content,
        type,
        metadata
      }
    }
  }

  // スラッシュコマンドが見つからない場合は通常のテキストメッセージ
  return {
    content: trimmedInput,
    type: MESSAGE_TYPE_TEXT
  }
}

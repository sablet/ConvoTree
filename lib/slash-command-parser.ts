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
  SLASH_COMMAND_DOCUMENT,
  SLASH_COMMAND_SESSION
} from '@/lib/constants'
import type { MessageType } from '@/lib/constants'
import type { TaskPriority } from '@/lib/types/task'

export interface ParsedMessage {
  content: string // コマンドを除いた実際のメッセージ内容
  type: MessageType
  metadata?: Record<string, unknown>
}

export interface SlashCommandPattern {
  pattern: RegExp
  type: ParsedMessage['type']
  metadata?: ParsedMessage['metadata']
}

// サポートするスラッシュコマンドパターン
const escapeForRegExp = (command: string) => command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const buildCommandPattern = (command: string) => new RegExp(`^${escapeForRegExp(command)}\\s+([\\s\\S]*)$`)

const createTaskCommand = (command: string, priority: TaskPriority): SlashCommandPattern => ({
  pattern: buildCommandPattern(command),
  type: MESSAGE_TYPE_TASK,
  metadata: {
    priority,
    completed: false,
    tags: []
  }
})

const COMMAND_PATTERNS: SlashCommandPattern[] = [
  createTaskCommand(SLASH_COMMAND_TASK_HIGH, 'high'),
  createTaskCommand(SLASH_COMMAND_TASK_MEDIUM, 'medium'),
  createTaskCommand(SLASH_COMMAND_TASK_LOW, 'low'),
  createTaskCommand(SLASH_COMMAND_TASK, 'medium'),
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


/**
 * スラッシュコマンド一覧を取得（UI表示用）
 */
export function getAvailableCommands() {
  return [
    { command: SLASH_COMMAND_TASK_HIGH, description: '高優先度タスクを作成' },
    { command: SLASH_COMMAND_TASK, description: '中優先度タスクを作成' },
    { command: SLASH_COMMAND_TASK_MEDIUM, description: '中優先度タスクを作成 (/task_medium)' },
    { command: SLASH_COMMAND_TASK_LOW, description: '低優先度タスクを作成' },
    { command: SLASH_COMMAND_DOCUMENT, description: '長文ドキュメントを作成' },
    { command: SLASH_COMMAND_SESSION, description: '作業セッションを開始' }
  ]
}

// スラッシュコマンドの解析とメッセージタイプの判定

export interface ParsedMessage {
  content: string // コマンドを除いた実際のメッセージ内容
  type: 'text' | 'task' | 'document' | 'session'
  metadata?: Record<string, unknown>
}

export interface SlashCommandPattern {
  pattern: RegExp
  type: ParsedMessage['type']
  metadata?: ParsedMessage['metadata']
}

// サポートするスラッシュコマンドパターン
const COMMAND_PATTERNS: SlashCommandPattern[] = [
  {
    pattern: /^\/task_high\s+([\s\S]*)$/,
    type: 'task',
    metadata: {
      priority: 'high',
      completed: false,
      tags: []
    }
  },
  {
    pattern: /^\/task_medium\s+([\s\S]*)$/,
    type: 'task',
    metadata: {
      priority: 'medium',
      completed: false,
      tags: []
    }
  },
  {
    pattern: /^\/task_low\s+([\s\S]*)$/,
    type: 'task',
    metadata: {
      priority: 'low',
      completed: false,
      tags: []
    }
  },
  {
    pattern: /^\/task\s+([\s\S]*)$/,
    type: 'task',
    metadata: {
      priority: 'medium',
      completed: false,
      tags: []
    }
  },
  {
    pattern: /^\/document\s+([\s\S]*)$/,
    type: 'document',
    metadata: {
      isCollapsed: false,
      wordCount: 0, // 後で設定
      originalLength: 0 // 後で設定
    }
  },
  {
    pattern: /^\/session\s+([\s\S]*)$/,
    type: 'session',
    metadata: {
      checkedInAt: new Date().toISOString(),
      timeSpent: 0
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

      // ドキュメントの場合、文字数を設定
      if (type === 'document' && metadata) {
        const updatedMetadata = {
          ...metadata,
          wordCount: content.length,
          originalLength: content.length
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
    type: 'text'
  }
}


/**
 * スラッシュコマンド一覧を取得（UI表示用）
 */
export function getAvailableCommands() {
  return [
    { command: '/task_high', description: '高優先度タスクを作成' },
    { command: '/task_medium', description: '中優先度タスクを作成' },
    { command: '/task_low', description: '低優先度タスクを作成' },
    { command: '/document', description: '長文ドキュメントを作成' },
    { command: '/session', description: '作業セッションを開始' }
  ]
}
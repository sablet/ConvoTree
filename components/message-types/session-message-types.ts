/**
 * SessionMessage コンポーネントの型定義
 */

export interface SessionMessageData {
  checkedInAt?: string
  checkedOutAt?: string
  timeSpent?: number // 分単位
  autoStart?: boolean // 自動開始フラグ
}

export interface SessionMessageProps {
  messageId: string
  content: string
  data: SessionMessageData
  onUpdate?: (data: SessionMessageData) => void
  isEditable?: boolean
}

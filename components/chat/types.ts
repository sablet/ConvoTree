import type { Message, Line, Tag, MessageType } from "@/lib/types"

/**
 * メッセージ操作用の共通Props型
 */
export interface MessageOperationProps {
  editingMessageId: string | null
  editingContent: string
  editingMessageType: MessageType | null
  editingMetadata: Record<string, unknown>
  hoveredMessageId: string | null
  hoveredImageId: string | null
  copySuccessMessageId: string | null
  hasSetCursorToEnd: string | null
  currentLineId: string
  messages: Record<string, Message>
  tags: Record<string, Tag>
  isUpdating: boolean
  onStartEdit: (messageId: string) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onDelete: (messageId: string) => void
  onCopy: (messageId: string) => void
  onImageDelete: (messageId: string, imageIndex: number) => void
  onMessageTap: (messageId: string) => void
  onSwitchLine: (lineId: string) => void
  onHoverMessage: (messageId: string | null) => void
  onHoverImage: (imageId: string | null) => void
  setEditingContent: (content: string) => void
  setEditingMessageType: (type: MessageType | null) => void
  setEditingMetadata: (metadata: Record<string, unknown>) => void
  setHasSetCursorToEnd: (value: string | null) => void
  isValidImageUrl: (url: string) => boolean
  getRelativeTime: (dateString: string) => string
}

/**
 * MessageItemコンポーネント用のProps型
 */
export interface MessageItemProps extends MessageOperationProps {
  message: Message
  isCurrentLine: boolean
  isSelected: boolean
  isSelectionMode: boolean
  isSelectedInBulk: boolean
  branchingLines: Line[]
}

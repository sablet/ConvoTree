import { ListTodo, MessageSquareText } from "lucide-react"
import { EditingMessageForm } from "./EditingMessageForm"
import { MessageTimeColumn, type MessageConvertButtonConfig } from "./MessageTimeColumn"
import { createTaskTimeTrackingButton } from "./task-time-actions"
import { DefaultMessageContent, MessageSelectionCheckbox } from "./message-item-internals"
import type { MessageItemProps } from "./types"
import { MESSAGE_TYPE_TASK, MESSAGE_TYPE_TEXT } from "@/lib/constants"
import { getDefaultMetadataForType } from "@/hooks/helpers/message-metadata"
import {
  ACTION_CONVERT_TO_TASK,
  ACTION_CONVERT_TO_TEXT
} from "@/lib/ui-strings"

const TIME_FORMAT = new Intl.DateTimeFormat("ja-JP", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
})

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("ja-JP", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
})

const TOOLTIP_DISPLAY_OPTIONS = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit"
} as const

/**
 * 個別メッセージ表示コンポーネント
 */
export function MessageItem({
  message,
  isCurrentLine,
  isSelected,
  isSelectionMode,
  isSelectedInBulk,
  editingMessageId,
  editingContent,
  editingMessageType,
  editingMetadata,
  hoveredMessageId,
  hoveredImageId,
  copySuccessMessageId,
  hasSetCursorToEnd,
  isUpdating,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onCopy,
  onImageDelete,
  onMessageTap,
  onHoverMessage,
  onHoverImage,
  setEditingContent,
  setEditingMessageType,
  setEditingMetadata,
  setHasSetCursorToEnd,
  isValidImageUrl,
  onUpdateMessage,
  isDraggable = false,
  onDragStart,
  onDragEnd
}: MessageItemProps) {
  const isEditing = editingMessageId === message.id
  const createdAtDate = toValidDate(message.timestamp)
  const updatedAtDate = toValidDate(message.updatedAt)
  const showEditedTimestamp = shouldShowEditedTimestamp(createdAtDate, updatedAtDate)
  const createdLabel = formatTimeLabel(createdAtDate)
  const createdTooltip = formatTooltip(createdAtDate)
  const editedLabel = showEditedTimestamp ? formatEditedLabel(createdAtDate, updatedAtDate) : ""
  const editedTooltip = showEditedTimestamp ? formatTooltip(updatedAtDate) : undefined
  const isTaskMessage = message.type === MESSAGE_TYPE_TASK
  const isTextMessage = !message.type || message.type === MESSAGE_TYPE_TEXT

  const handleConvertToTask = () => {
    const defaultMetadata = (getDefaultMetadataForType(MESSAGE_TYPE_TASK, message.content) ?? {}) as Record<string, unknown>
    const metadataWithCreatedAt = {
      ...defaultMetadata,
      createdAt: new Date().toISOString()
    }

    void onUpdateMessage(message.id, {
      type: MESSAGE_TYPE_TASK,
      metadata: metadataWithCreatedAt
    })
  }

  const handleConvertToText = () => {
    void onUpdateMessage(message.id, {
      type: MESSAGE_TYPE_TEXT,
      metadata: null as unknown as Record<string, unknown>
    })
  }

  const convertButtonConfig: MessageConvertButtonConfig | undefined = isSelectionMode
    ? undefined
    : isTaskMessage
      ? {
          label: ACTION_CONVERT_TO_TEXT,
          icon: <MessageSquareText className="h-4 w-4 text-blue-600" />,
          onClick: handleConvertToText
        }
      : isTextMessage
        ? {
            label: ACTION_CONVERT_TO_TASK,
            icon: <ListTodo className="h-4 w-4 text-green-600" />,
            onClick: handleConvertToTask
          }
        : undefined
  const timeTrackingButtonConfig: MessageConvertButtonConfig | undefined = createTaskTimeTrackingButton({
    message,
    isTaskMessage,
    isSelectionMode,
    isEditing,
    onUpdateMessage
  })
  const selectionCheckbox = isSelectionMode ? (
    <MessageSelectionCheckbox
      messageId={message.id}
      isChecked={isSelectedInBulk}
      onToggle={onMessageTap}
    />
  ) : null
  const messageContent = isEditing ? (
    <EditingMessageForm
      message={message}
      editingMessageId={editingMessageId}
      editingContent={editingContent}
      editingMessageType={editingMessageType}
      editingMetadata={editingMetadata}
      hasSetCursorToEnd={hasSetCursorToEnd}
      isUpdating={isUpdating}
      setEditingContent={setEditingContent}
      setEditingMessageType={setEditingMessageType}
      setEditingMetadata={setEditingMetadata}
      setHasSetCursorToEnd={setHasSetCursorToEnd}
      onSaveEdit={onSaveEdit}
      onCancelEdit={onCancelEdit}
    />
  ) : (
    <DefaultMessageContent
      message={message}
      hoveredImageId={hoveredImageId}
      copySuccessMessageId={copySuccessMessageId}
      hoveredMessageId={hoveredMessageId}
      isSelectionMode={isSelectionMode}
      isValidImageUrl={isValidImageUrl}
      onImageDelete={onImageDelete}
      onHoverImage={onHoverImage}
      onCopy={onCopy}
      onStartEdit={onStartEdit}
      onDelete={onDelete}
      showEditedTimestamp={showEditedTimestamp}
      editedLabel={editedLabel}
      editedTooltip={editedTooltip}
      onUpdateMessage={onUpdateMessage}
    />
  )

  return (
    <div
      id={`message-${message.id}`}
      draggable={isDraggable}
      onDragStart={(e) => {
        if (isDraggable && onDragStart) {
          onDragStart(e, message.id)
        }
      }}
      onDragEnd={(e) => {
        if (isDraggable && onDragEnd) {
          onDragEnd(e)
        }
      }}
      className={`group relative transition-all duration-200 ${
        isDraggable ? 'cursor-move' : ''
      } ${
        isSelected ? "bg-gray-100 -mx-2 px-2 py-2 rounded-lg border-2 border-green-600" : ""
      } ${
        isSelectedInBulk ? "bg-blue-100 -mx-2 px-2 py-2 rounded-lg border-2 border-blue-500" : ""
      } ${
        !isCurrentLine ? "border-l-2 border-blue-200 pl-3 ml-1" : ""
      }`}
      onMouseEnter={() => onHoverMessage(message.id)}
      onMouseLeave={() => onHoverMessage(null)}
      onClick={() => {
        if (isSelectionMode) {
          onMessageTap(message.id)
        }
      }}
      onDoubleClick={() => {
        if (!isSelectionMode) {
          onMessageTap(message.id)
        }
      }}
    >
      <div className="flex gap-3">
        {/* 選択チェックボックス（選択モード時のみ表示） */}
        {selectionCheckbox}

        {/* 時刻表示 */}
        <MessageTimeColumn
          createdLabel={createdLabel}
          createdTooltip={createdTooltip}
          isCurrentLine={isCurrentLine}
          convertButton={convertButtonConfig}
          timeTrackingButton={timeTrackingButtonConfig}
        />

        {/* メッセージ内容 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            {message.hasBookmark && <div className="w-3 h-3 border border-gray-300 mt-1 flex-shrink-0" />}

            {messageContent}
          </div>
        </div>
      </div>
    </div>
  )
}

function toValidDate(value: Date | string | undefined): Date | null {
  if (!value) {
    return null
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function shouldShowEditedTimestamp(createdAt: Date | null, updatedAt: Date | null): updatedAt is Date {
  if (!createdAt || !updatedAt) {
    return false
  }
  const diffMs = Math.abs(updatedAt.getTime() - createdAt.getTime())
  const thresholdMs = 5 * 60 * 1000
  return diffMs >= thresholdMs
}

function formatTimeLabel(date: Date | null): string {
  return date ? TIME_FORMAT.format(date) : "--:--"
}

function formatTooltip(date: Date | null): string | undefined {
  return date ? date.toLocaleString("ja-JP", TOOLTIP_DISPLAY_OPTIONS) : undefined
}

function formatEditedLabel(createdAt: Date | null, updatedAt: Date | null): string {
  if (!updatedAt) {
    return ""
  }

  const sameDay = Boolean(createdAt && updatedAt && createdAt.toDateString() === updatedAt.toDateString())
  const formatter = sameDay ? TIME_FORMAT : DATE_TIME_FORMAT
  return formatter.format(updatedAt)
}

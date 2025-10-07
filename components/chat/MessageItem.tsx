import { Button } from "@/components/ui/button"
import { Copy, CheckCircle, Edit3, Trash2 } from "lucide-react"
import Image from "next/image"
import { MessageTypeRenderer } from "@/components/message-types/message-type-renderer"
import { EditingMessageForm } from "./EditingMessageForm"
import { BranchingLinesPanel } from "./BranchingLinesPanel"
import type { Message } from "@/lib/types"
import type { MessageItemProps } from "./types"

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
  branchingLines,
  currentLineId,
  messages,
  tags,
  isUpdating,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onCopy,
  onImageDelete,
  onMessageTap,
  onSwitchLine,
  onHoverMessage,
  onHoverImage,
  setEditingContent,
  setEditingMessageType,
  setEditingMetadata,
  setHasSetCursorToEnd,
  isValidImageUrl,
  getRelativeTime
}: MessageItemProps) {
  const isEditing = editingMessageId === message.id
  const createdAtDate = toValidDate(message.timestamp)
  const updatedAtDate = toValidDate(message.updatedAt)
  const showEditedTimestamp = shouldShowEditedTimestamp(createdAtDate, updatedAtDate)
  const createdLabel = formatTimeLabel(createdAtDate)
  const createdTooltip = formatTooltip(createdAtDate)
  const editedLabel = showEditedTimestamp ? formatEditedLabel(createdAtDate, updatedAtDate) : ""
  const editedTooltip = showEditedTimestamp ? formatTooltip(updatedAtDate) : undefined
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
    />
  )

  return (
    <div
      id={`message-${message.id}`}
      className={`group relative transition-all duration-200 ${
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
        />

        {/* メッセージ内容 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            {message.hasBookmark && <div className="w-3 h-3 border border-gray-300 mt-1 flex-shrink-0" />}

            {messageContent}
          </div>

          {/* 分岐情報表示 */}
          <BranchingLinesPanel
            branchingLines={branchingLines}
            currentLineId={currentLineId}
            messages={messages}
            tags={tags}
            messageId={message.id}
            onSwitchLine={onSwitchLine}
            getRelativeTime={getRelativeTime}
          />
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

interface MessageSelectionCheckboxProps {
  messageId: string
  isChecked: boolean
  onToggle: (messageId: string) => void
}

function MessageSelectionCheckbox({ messageId, isChecked, onToggle }: MessageSelectionCheckboxProps) {
  return (
    <div
      className="flex items-center pt-0.5 cursor-pointer"
      onClick={(event) => {
        event.stopPropagation()
        onToggle(messageId)
      }}
    >
      <input
        type="checkbox"
        checked={isChecked}
        onChange={() => {}}
        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2 pointer-events-none"
      />
    </div>
  )
}

interface MessageTimeColumnProps {
  createdLabel: string
  createdTooltip?: string
  isCurrentLine: boolean
}

function MessageTimeColumn({ createdLabel, createdTooltip, isCurrentLine }: MessageTimeColumnProps) {
  return (
    <div className={`flex flex-col gap-0.5 text-xs font-mono min-w-[35px] pt-0.5 leading-tight ${
      !isCurrentLine ? 'text-blue-400' : 'text-gray-400'
    }`}>
      <span title={createdTooltip}>{createdLabel}</span>
    </div>
  )
}

interface DefaultMessageContentProps {
  message: Message
  hoveredImageId: string | null
  copySuccessMessageId: string | null
  hoveredMessageId: string | null
  isSelectionMode: boolean
  isValidImageUrl: (url: string) => boolean
  onImageDelete: (messageId: string, imageIndex: number) => void
  onHoverImage: (imageId: string | null) => void
  onCopy: (messageId: string) => void
  onStartEdit: (messageId: string) => void
  onDelete: (messageId: string) => void
  showEditedTimestamp: boolean
  editedLabel: string
  editedTooltip?: string
}

function DefaultMessageContent({
  message,
  hoveredImageId,
  copySuccessMessageId,
  hoveredMessageId,
  isSelectionMode,
  isValidImageUrl,
  onImageDelete,
  onHoverImage,
  onCopy,
  onStartEdit,
  onDelete,
  showEditedTimestamp,
  editedLabel,
  editedTooltip
}: DefaultMessageContentProps) {
  const validImages = Array.isArray(message.images)
    ? message.images.filter((imageUrl) => isValidImageUrl(imageUrl))
    : []
  const hasImages = validImages.length > 0
  const showCopySuccess = copySuccessMessageId === message.id
  const showHoverActions = hoveredMessageId === message.id && !isSelectionMode

  return (
    <div className="flex-1 min-w-0">
      <MessageTypeRenderer message={message} />

      {hasImages && (
        <MessageImages
          messageId={message.id}
          images={validImages}
          hoveredImageId={hoveredImageId}
          onHoverImage={onHoverImage}
          onImageDelete={onImageDelete}
        />
      )}

      {showCopySuccess && <CopySuccessFeedback />}

      {showHoverActions && (
        <HoverActionButtons
          messageId={message.id}
          onCopy={onCopy}
          onStartEdit={onStartEdit}
          onDelete={onDelete}
          showEditedTimestamp={showEditedTimestamp}
          editedLabel={editedLabel}
          editedTooltip={editedTooltip}
        />
      )}
    </div>
  )
}

interface MessageImagesProps {
  messageId: string
  images: string[]
  hoveredImageId: string | null
  onHoverImage: (imageId: string | null) => void
  onImageDelete: (messageId: string, imageIndex: number) => void
}

function MessageImages({ messageId, images, hoveredImageId, onHoverImage, onImageDelete }: MessageImagesProps) {
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {images.map((imageUrl, index) => {
        const hoverKey = `${messageId}-${index}`
        const isHovered = hoveredImageId === hoverKey
        return (
          <div
            key={hoverKey}
            className="relative group"
            onMouseEnter={() => onHoverImage(hoverKey)}
            onMouseLeave={() => onHoverImage(null)}
          >
            <Image
              src={imageUrl}
              alt={`Image ${index + 1}`}
              width={200}
              height={200}
              className="rounded border border-gray-300 object-cover max-w-[200px] max-h-[200px]"
            />
            {isHovered && (
              <div className="absolute top-1 right-1 flex gap-1">
                <Button
                  onClick={() => onImageDelete(messageId, index)}
                  size="sm"
                  className="h-6 px-2 bg-red-500 hover:bg-red-600 text-white"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function CopySuccessFeedback() {
  return (
    <div className="absolute -top-8 right-0 flex items-center gap-1 bg-gray-100 text-gray-700 px-2 py-1 rounded-md text-xs border border-gray-200 shadow-sm animate-in fade-in slide-in-from-top-1 duration-300">
      <CheckCircle className="h-3 w-3" />
      <span>コピーしました</span>
    </div>
  )
}

interface HoverActionButtonsProps {
  messageId: string
  onCopy: (messageId: string) => void
  onStartEdit: (messageId: string) => void
  onDelete: (messageId: string) => void
  showEditedTimestamp: boolean
  editedLabel: string
  editedTooltip?: string
}

function HoverActionButtons({
  messageId,
  onCopy,
  onStartEdit,
  onDelete,
  showEditedTimestamp,
  editedLabel,
  editedTooltip
}: HoverActionButtonsProps) {
  return (
    <div className="absolute bottom-0 right-0 flex gap-1 bg-white shadow-md border border-gray-200 rounded-md p-1">
      {showEditedTimestamp && editedLabel && (
        <span
          className="px-2 text-[11px] text-gray-600 flex items-center gap-1"
          title={editedTooltip ? `編集: ${editedTooltip}` : undefined}
        >
          ↺ {editedLabel}
        </span>
      )}
      <Button
        onClick={(event) => {
          event.stopPropagation()
          onCopy(messageId)
        }}
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 hover:bg-gray-50"
        title="コピー"
        data-copy-message-id={messageId}
      >
        <Copy className="h-3 w-3 text-gray-600" />
      </Button>
      <Button
        onClick={(event) => {
          event.stopPropagation()
          onStartEdit(messageId)
        }}
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 hover:bg-blue-50"
        title="編集"
      >
        <Edit3 className="h-3 w-3 text-blue-600" />
      </Button>
      <Button
        onClick={(event) => {
          event.stopPropagation()
          onDelete(messageId)
        }}
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 hover:bg-red-50"
        title="削除"
      >
        <Trash2 className="h-3 w-3 text-red-600" />
      </Button>
    </div>
  )
}

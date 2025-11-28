import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Copy, CheckCircle, Edit3, Trash2, ImageOff } from "lucide-react"
import Image from "next/image"
import { MessageTypeRenderer } from "@/components/message-types/message-type-renderer"
import type { Message } from "@/lib/types"
import type { MessageConvertButtonConfig } from "./MessageTimeColumn"
import { countTextLengthWithoutUrls as calculateMessageCharCount } from "@/lib/utils/linkify"

interface MessageSelectionCheckboxProps {
  messageId: string
  isChecked: boolean
  onToggle: (messageId: string, shiftKey?: boolean) => void
}

export function MessageSelectionCheckbox({ messageId, isChecked, onToggle }: MessageSelectionCheckboxProps) {
  return (
    <div
      className="flex items-center pt-0.5 cursor-pointer"
      onClick={(event) => {
        event.stopPropagation()
        onToggle(messageId, event.shiftKey)
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
  onUpdateMessage: (messageId: string, updates: Partial<Message>) => Promise<void>
  convertButton?: MessageConvertButtonConfig
  timeTrackingButton?: MessageConvertButtonConfig
}

export function DefaultMessageContent({
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
  editedTooltip,
  onUpdateMessage,
  convertButton,
  timeTrackingButton
}: DefaultMessageContentProps) {
  const validImages = Array.isArray(message.images)
    ? message.images.filter((imageUrl) => isValidImageUrl(imageUrl))
    : []
  const hasImages = validImages.length > 0
  const showCopySuccess = copySuccessMessageId === message.id
  const showHoverActions = hoveredMessageId === message.id && !isSelectionMode

  return (
    <div className="relative flex-1 min-w-0">
      <MessageTypeRenderer
        message={message}
        onUpdate={(messageId, updates) => {
          void onUpdateMessage(messageId, updates)
        }}
      />

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
          messageContent={message.content}
          onCopy={onCopy}
          onStartEdit={onStartEdit}
          onDelete={onDelete}
          showEditedTimestamp={showEditedTimestamp}
          editedLabel={editedLabel}
          editedTooltip={editedTooltip}
          convertButton={convertButton}
          timeTrackingButton={timeTrackingButton}
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
      {images.map((imageUrl, index) => (
        <MessageImageItem
          key={`${messageId}-${index}`}
          messageId={messageId}
          imageUrl={imageUrl}
          index={index}
          isHovered={hoveredImageId === `${messageId}-${index}`}
          onHoverImage={onHoverImage}
          onImageDelete={onImageDelete}
        />
      ))}
    </div>
  )
}

interface MessageImageItemProps {
  messageId: string
  imageUrl: string
  index: number
  isHovered: boolean
  onHoverImage: (imageId: string | null) => void
  onImageDelete: (messageId: string, imageIndex: number) => void
}

function MessageImageItem({ messageId, imageUrl, index, isHovered, onHoverImage, onImageDelete }: MessageImageItemProps) {
  const [hasError, setHasError] = useState(false)
  const hoverKey = `${messageId}-${index}`

  if (hasError) {
    return (
      <div
        className="relative flex items-center justify-center w-[200px] h-[100px] rounded border border-gray-300 bg-gray-100"
        title="画像を読み込めませんでした"
      >
        <ImageOff className="h-8 w-8 text-gray-400" />
      </div>
    )
  }

  return (
    <div
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
        onError={() => setHasError(true)}
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
  messageContent: string
  onCopy: (messageId: string) => void
  onStartEdit: (messageId: string) => void
  onDelete: (messageId: string) => void
  showEditedTimestamp: boolean
  editedLabel: string
  editedTooltip?: string
  convertButton?: MessageConvertButtonConfig
  timeTrackingButton?: MessageConvertButtonConfig
}

function HoverActionButtons({
  messageId,
  messageContent,
  onCopy,
  onStartEdit,
  onDelete,
  showEditedTimestamp,
  editedLabel,
  editedTooltip,
  convertButton,
  timeTrackingButton
}: HoverActionButtonsProps) {
  const charCount = calculateMessageCharCount(messageContent)

  return (
    <div className="absolute bottom-0 right-0 flex gap-1 bg-white shadow-md border border-gray-200 rounded-md p-1 transform translate-y-full z-10">
      {showEditedTimestamp && editedLabel && (
        <span
          className="px-2 text-[11px] text-gray-600 flex items-center gap-1"
          title={editedTooltip ? `編集: ${editedTooltip}` : undefined}
        >
          ↺ {editedLabel}
        </span>
      )}
      <span className="px-2 text-[11px] text-gray-500 flex items-center">
        {charCount}文字
      </span>
      {convertButton && (
        <Button
          onClick={(event) => {
            event.stopPropagation()
            convertButton.onClick()
          }}
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 hover:bg-gray-50"
          title={convertButton.label}
        >
          {convertButton.icon}
        </Button>
      )}
      {timeTrackingButton && (
        <Button
          onClick={(event) => {
            event.stopPropagation()
            timeTrackingButton.onClick()
          }}
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 hover:bg-gray-50"
          title={timeTrackingButton.label}
        >
          {timeTrackingButton.icon}
        </Button>
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

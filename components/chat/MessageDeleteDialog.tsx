import { Button } from "@/components/ui/button"
import { Trash2 } from "lucide-react"
import type { Message } from "@/lib/types"

interface MessageDeleteDialogProps {
  isOpen: boolean
  message: Message | null
  messageId: string | null
  isUpdating: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * MessageDeleteDialog Component
 *
 * Modal dialog for confirming message deletion
 */
export function MessageDeleteDialog({
  isOpen,
  message,
  messageId,
  isUpdating,
  onConfirm,
  onCancel
}: MessageDeleteDialogProps) {
  if (!isOpen || !message || !messageId) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <Trash2 className="h-6 w-6 text-red-600" />
            <h3 className="text-lg font-semibold text-gray-900">メッセージを削除</h3>
          </div>

          <p className="text-gray-600 mb-4">
            このメッセージを削除してもよろしいですか？
          </p>

          <div className="bg-gray-50 rounded-md p-3 mb-4">
            <p className="text-sm text-gray-700 line-clamp-3">
              {message.content}
            </p>
          </div>

          <div className="flex gap-3 justify-end">
            <Button
              onClick={onCancel}
              variant="outline"
              disabled={isUpdating}
            >
              キャンセル
            </Button>
            <Button
              onClick={onConfirm}
              disabled={isUpdating}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isUpdating ? "削除中..." : "削除"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

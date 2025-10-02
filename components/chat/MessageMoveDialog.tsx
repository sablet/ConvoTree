import { Button } from "@/components/ui/button"
import { GitBranch } from "lucide-react"
import type { Line, Tag } from "@/lib/types"

interface MessageMoveDialogProps {
  isOpen: boolean
  selectedMessagesCount: number
  currentLineId: string
  lines: Record<string, Line>
  tags: Record<string, Tag>
  isUpdating: boolean
  onConfirm: (targetLineId: string) => void
  onCancel: () => void
}

/**
 * MessageMoveDialog Component
 *
 * Modal dialog for moving messages to another line
 */
export function MessageMoveDialog({
  isOpen,
  selectedMessagesCount,
  currentLineId,
  lines,
  tags,
  isUpdating,
  onConfirm,
  onCancel
}: MessageMoveDialogProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <GitBranch className="h-6 w-6 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-900">メッセージを移動</h3>
          </div>

          <p className="text-gray-600 mb-4">
            {selectedMessagesCount}件のメッセージを移動先のラインを選択してください：
          </p>

          <div className="max-h-60 overflow-y-auto space-y-2 mb-4">
            {Object.values(lines)
              .filter(line => line.id !== currentLineId) // 現在のラインは除外
              .map(line => (
                <button
                  key={line.id}
                  onClick={() => onConfirm(line.id)}
                  disabled={isUpdating}
                  className="w-full text-left p-3 border border-gray-200 rounded-md hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-50"
                >
                  <div className="font-medium text-gray-900">{line.name}</div>
                  <div className="text-sm text-gray-500">
                    {line.messageIds.length}件のメッセージ
                    {line.tagIds && line.tagIds.length > 0 && (
                      <span className="ml-2">
                        {line.tagIds.slice(0, 2).map(tagId => {
                          const tag = tags[tagId]
                          return tag ? `#${tag.name}` : ''
                        }).filter(Boolean).join(' ')}
                      </span>
                    )}
                  </div>
                </button>
              ))}
          </div>

          <div className="flex gap-3 justify-end">
            <Button
              onClick={onCancel}
              variant="outline"
              disabled={isUpdating}
            >
              キャンセル
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

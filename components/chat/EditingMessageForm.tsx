import { Button } from "@/components/ui/button"
import { Check } from "lucide-react"
import type { Message, MessageType } from "@/lib/types"
import { MESSAGE_TYPE_TEXT, MESSAGE_TYPE_TASK, MESSAGE_TYPE_DOCUMENT, MESSAGE_TYPE_SESSION } from "@/lib/constants"
import { FILTER_TEXT, FILTER_TASK, FILTER_DOCUMENT, FILTER_SESSION } from "@/lib/ui-strings"

interface EditingMessageFormProps {
  message: Message
  editingMessageId: string
  editingContent: string
  editingMessageType: MessageType | null
  editingMetadata: Record<string, unknown>
  hasSetCursorToEnd: string | null
  isUpdating: boolean
  setEditingContent: (content: string) => void
  setEditingMessageType: (type: MessageType | null) => void
  setEditingMetadata: (metadata: Record<string, unknown>) => void
  setHasSetCursorToEnd: (value: string | null) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
}

/**
 * メッセージ編集フォームコンポーネント
 */
export function EditingMessageForm({
  message,
  editingMessageId,
  editingContent,
  editingMessageType,
  editingMetadata,
  hasSetCursorToEnd,
  isUpdating,
  setEditingContent,
  setEditingMessageType,
  setEditingMetadata,
  setHasSetCursorToEnd,
  onSaveEdit,
  onCancelEdit
}: EditingMessageFormProps) {
  return (
    <div className="flex-1 space-y-4">
      {/* メッセージタイプ選択 */}
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-gray-600">タイプ:</label>
        <select
          value={editingMessageType || message.type || 'text'}
          onChange={(e) => setEditingMessageType(e.target.value as MessageType)}
          className="text-xs border border-gray-300 rounded px-2 py-1 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        >
          <option value={MESSAGE_TYPE_TEXT}>{FILTER_TEXT}</option>
          <option value={MESSAGE_TYPE_TASK}>{FILTER_TASK}</option>
          <option value={MESSAGE_TYPE_DOCUMENT}>{FILTER_DOCUMENT}</option>
          <option value={MESSAGE_TYPE_SESSION}>{FILTER_SESSION}</option>
        </select>
      </div>

      {/* テキスト内容編集と保存ボタン */}
      <div className="flex gap-2">
        <textarea
          value={editingContent}
          onChange={(e) => setEditingContent(e.target.value)}
          className="flex-1 min-h-[80px] p-2 border border-blue-300 rounded-md resize-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none text-sm"
          placeholder="メッセージ内容"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              onSaveEdit()
            } else if (e.key === "Escape") {
              e.preventDefault()
              onCancelEdit()
            }
          }}
          ref={(textarea) => {
            if (textarea && editingMessageId && hasSetCursorToEnd !== editingMessageId) {
              textarea.focus()
              textarea.setSelectionRange(textarea.value.length, textarea.value.length)
              setHasSetCursorToEnd(editingMessageId)
            }
          }}
        />
        {/* 保存・キャンセルボタン */}
        <div className="flex flex-col gap-1">
          <Button
            onClick={onSaveEdit}
            disabled={!editingContent.trim() || isUpdating}
            size="sm"
            className="h-8 px-3 bg-blue-500 hover:bg-blue-600 text-white"
          >
            <Check className="h-3 w-3 mr-1" />
            保存
          </Button>
          <Button
            onClick={onCancelEdit}
            disabled={isUpdating}
            variant="outline"
            size="sm"
            className="h-8 px-3"
          >
            キャンセル
          </Button>
        </div>
      </div>

      {/* タイプ別プロパティ編集 */}
      {(editingMessageType === MESSAGE_TYPE_TASK || (editingMessageType === null && message.type === MESSAGE_TYPE_TASK)) && (
        <div className="bg-orange-50 p-3 rounded-md border border-orange-200">
          <h4 className="text-xs font-medium text-orange-800 mb-2">タスクプロパティ</h4>
          <div>
            <label className="text-xs text-gray-600">優先度</label>
            <select
              className="w-full text-xs border border-gray-300 rounded px-2 py-1"
              value={(editingMetadata.priority as string) || (message.metadata?.priority as string) || 'medium'}
              onChange={(e) => setEditingMetadata({ ...editingMetadata, priority: e.target.value })}
            >
              <option value="low">低</option>
              <option value="medium">中</option>
              <option value="high">高</option>
            </select>
          </div>
          <div className="mt-2">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={(editingMetadata.completed as boolean) ?? (message.metadata?.completed as boolean) ?? false}
                onChange={(e) => setEditingMetadata({ ...editingMetadata, completed: e.target.checked })}
                className="rounded"
              />
              完了
            </label>
          </div>
        </div>
      )}

      {(editingMessageType === MESSAGE_TYPE_SESSION || (editingMessageType === null && message.type === MESSAGE_TYPE_SESSION)) && (
        <div className="bg-purple-50 p-3 rounded-md border border-purple-200">
          <h4 className="text-xs font-medium text-purple-800 mb-2">セッションプロパティ</h4>
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-600">開始日時</label>
                <input
                  type="datetime-local"
                  className="w-full text-xs border border-gray-300 rounded px-2 py-1"
                  value={(() => {
                    const checkedInAt = (editingMetadata.checkedInAt as string) ?? (message.metadata?.checkedInAt as string) ?? ''
                    if (!checkedInAt) return ''
                    const date = new Date(checkedInAt)
                    const year = date.getFullYear()
                    const month = String(date.getMonth() + 1).padStart(2, '0')
                    const day = String(date.getDate()).padStart(2, '0')
                    const hours = String(date.getHours()).padStart(2, '0')
                    const minutes = String(date.getMinutes()).padStart(2, '0')
                    return `${year}-${month}-${day}T${hours}:${minutes}`
                  })()}
                  onChange={(e) => {
                    const isoString = e.target.value ? new Date(e.target.value).toISOString() : ''
                    const newMetadata: Record<string, unknown> = {
                      ...editingMetadata,
                      checkedInAt: isoString
                    }
                    if (isoString && editingMetadata.timeSpent) {
                      newMetadata.checkedOutAt = new Date(new Date(isoString).getTime() + (editingMetadata.timeSpent as number) * 60000).toISOString()
                    }
                    setEditingMetadata(newMetadata)
                  }}
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">経過分数</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="w-full text-xs border border-gray-300 rounded px-2 py-1"
                  value={(editingMetadata.timeSpent as number) ?? (message.metadata?.timeSpent as number) ?? 0}
                  onChange={(e) => {
                    const minutes = parseInt(e.target.value) || 0
                    const checkedInAt = (editingMetadata.checkedInAt as string) || (message.metadata?.checkedInAt as string)
                    const newMetadata: Record<string, unknown> = {
                      ...editingMetadata,
                      timeSpent: minutes
                    }
                    if (checkedInAt && minutes > 0) {
                      newMetadata.checkedOutAt = new Date(new Date(checkedInAt).getTime() + minutes * 60000).toISOString()
                    } else if (minutes === 0) {
                      newMetadata.checkedOutAt = ''
                    }
                    setEditingMetadata(newMetadata)
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

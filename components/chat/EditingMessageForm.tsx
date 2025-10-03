import { Button } from "@/components/ui/button"
import { Check } from "lucide-react"
import type { Message, MessageType } from "@/lib/types"
import { MESSAGE_TYPE_TEXT, MESSAGE_TYPE_TASK, MESSAGE_TYPE_DOCUMENT, MESSAGE_TYPE_SESSION } from "@/lib/constants"
import { FILTER_TEXT, FILTER_TASK, FILTER_DOCUMENT, FILTER_SESSION } from "@/lib/ui-strings"
import { TaskProperties } from "./EditingMessageForm/TaskProperties"
import { SessionProperties } from "./EditingMessageForm/SessionProperties"

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
  const isTaskType = editingMessageType === MESSAGE_TYPE_TASK || (editingMessageType === null && message.type === MESSAGE_TYPE_TASK)
  const isSessionType = editingMessageType === MESSAGE_TYPE_SESSION || (editingMessageType === null && message.type === MESSAGE_TYPE_SESSION)

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
      {isTaskType && (
        <TaskProperties
          message={message}
          editingMetadata={editingMetadata}
          setEditingMetadata={setEditingMetadata}
        />
      )}

      {isSessionType && (
        <SessionProperties
          message={message}
          editingMetadata={editingMetadata}
          setEditingMetadata={setEditingMetadata}
        />
      )}
    </div>
  )
}

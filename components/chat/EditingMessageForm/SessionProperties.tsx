import type { Message } from "@/lib/types"
import { formatDatetimeLocal, updateCheckedInAt, updateTimeSpent } from "./utils"

interface SessionPropertiesProps {
  message: Message
  editingMetadata: Record<string, unknown>
  setEditingMetadata: (metadata: Record<string, unknown>) => void
}

/**
 * セッションプロパティ編集コンポーネント
 */
export function SessionProperties({
  message,
  editingMetadata,
  setEditingMetadata
}: SessionPropertiesProps) {
  return (
    <div className="bg-purple-50 p-3 rounded-md border border-purple-200">
      <h4 className="text-xs font-medium text-purple-800 mb-2">セッションプロパティ</h4>
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-gray-600">開始日時</label>
            <input
              type="datetime-local"
              className="w-full text-xs border border-gray-300 rounded px-2 py-1"
              value={formatDatetimeLocal(
                (editingMetadata.checkedInAt as string) ?? (message.metadata?.checkedInAt as string) ?? ''
              )}
              onChange={(e) => {
                const isoString = e.target.value ? new Date(e.target.value).toISOString() : ''
                setEditingMetadata(updateCheckedInAt(editingMetadata, isoString))
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
                setEditingMetadata(updateTimeSpent(editingMetadata, message.metadata, minutes))
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

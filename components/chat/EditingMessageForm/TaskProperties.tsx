import type { Message } from "@/lib/types"

interface TaskPropertiesProps {
  message: Message
  editingMetadata: Record<string, unknown>
  setEditingMetadata: (metadata: Record<string, unknown>) => void
}

/**
 * タスクプロパティ編集コンポーネント
 */
export function TaskProperties({
  message,
  editingMetadata,
  setEditingMetadata
}: TaskPropertiesProps) {
  return (
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
  )
}

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { X, Plus } from "lucide-react"
import type { Line, Message, Tag } from "@/lib/types"

interface LineEditDialogProps {
  isOpen: boolean
  currentLine: Line | null
  editingBranchData: {
    name: string
    tagIds: string[]
    newTag: string
  }
  tags: Record<string, Tag>
  messages: Record<string, Message>
  onSave: () => void
  onCancel: () => void
  onAddTag: () => void
  onRemoveTag: (tagIndex: number) => void
  onDataChange: (data: { name: string; tagIds: string[]; newTag: string }) => void
}

/**
 * LineEditDialog Component
 *
 * Inline line editing form (not a modal dialog)
 */
export function LineEditDialog({
  isOpen,
  currentLine,
  editingBranchData,
  tags,
  messages,
  onSave,
  onCancel,
  onAddTag,
  onRemoveTag,
  onDataChange
}: LineEditDialogProps) {
  if (!isOpen || !currentLine) {
    return (
      <div className="px-2 sm:px-4 py-3 border-b border-gray-100 bg-gray-50">
        {currentLine && (
          <div>
            <h2 className="font-medium text-gray-800">{currentLine.name}</h2>
            {currentLine.branchFromMessageId && (
              <p className="text-xs text-blue-500">
                分岐元: {messages[currentLine.branchFromMessageId]?.content.slice(0, 20)}...
              </p>
            )}
            {currentLine.tagIds && currentLine.tagIds.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {currentLine.tagIds.map((tagId, tagIndex) => {
                  const tag = tags[tagId]
                  if (!tag) return null
                  return (
                    <Badge
                      key={`current-line-tag-${tagIndex}`}
                      variant="secondary"
                      className="text-xs bg-emerald-100 text-emerald-700"
                    >
                      {tag.name}
                    </Badge>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="px-2 sm:px-4 py-3 border-b border-gray-100 bg-gray-50">
      <div className="space-y-3">
        {/* タイトル編集 */}
        <div>
          <Input
            value={editingBranchData.name}
            onChange={(e) => onDataChange({ ...editingBranchData, name: e.target.value })}
            placeholder="ラインタイトル"
            className="text-sm font-medium"
          />
        </div>

        {/* タグ編集 */}
        <div>
          <div className="flex flex-wrap gap-1 mb-2">
            {editingBranchData.tagIds.map((tagId, tagIndex) => {
              const tag = tags[tagId]
              if (!tag) return null
              return (
                <div key={tagIndex} className="flex items-center">
                  <Badge variant="secondary" className="text-xs bg-emerald-100 text-emerald-700 pr-1">
                    {tag.name}
                    <button
                      onClick={() => onRemoveTag(tagIndex)}
                      className="ml-1 text-emerald-500 hover:text-emerald-700"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                </div>
              )
            })}
          </div>
          <div className="flex gap-2">
            <Input
              value={editingBranchData.newTag}
              onChange={(e) => onDataChange({ ...editingBranchData, newTag: e.target.value })}
              placeholder="新しいタグ"
              className="text-xs flex-1"
              onKeyPress={(e) => e.key === "Enter" && onAddTag()}
            />
            <Button
              onClick={onAddTag}
              size="sm"
              variant="outline"
              className="px-2"
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* 保存・キャンセルボタン */}
        <div className="flex gap-2 justify-end">
          <Button
            onClick={onCancel}
            size="sm"
            variant="outline"
            className="text-xs"
          >
            キャンセル
          </Button>
          <Button
            onClick={onSave}
            size="sm"
            className="text-xs bg-emerald-500 hover:bg-emerald-600"
          >
            保存
          </Button>
        </div>
      </div>
    </div>
  )
}

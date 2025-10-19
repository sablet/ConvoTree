import { Button } from "@/components/ui/button"
import { GitBranch } from "lucide-react"
import type { Line, Tag } from "@/lib/types"
import { buildLineTree } from "@/lib/line-tree-builder"
import { LineBreadcrumb } from "./LineBreadcrumb"

interface MessageMoveDialogProps {
  isOpen: boolean
  selectedMessagesCount: number
  currentLineId: string
  lines: Record<string, Line>
  tags: Record<string, Tag>
  isUpdating: boolean
  getLineAncestry: (lineId: string) => string[]
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
  getLineAncestry,
  onConfirm,
  onCancel
}: MessageMoveDialogProps) {
  if (!isOpen) return null

  // ツリー構造を構築
  const treeNodes = buildLineTree(lines, currentLineId)

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <GitBranch className="h-6 w-6 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-900">メッセージを移動</h3>
          </div>

          <p className="text-gray-600 mb-4">
            {selectedMessagesCount}件のメッセージを移動先のラインを選択してください：
          </p>

          <div className="max-h-96 overflow-y-auto space-y-2 mb-4">
            {treeNodes.map((node) => {
              const line = node.line

              return (
                <button
                  key={line.id}
                  onClick={() => onConfirm(line.id)}
                  disabled={isUpdating}
                  className="w-full text-left p-3 border border-gray-200 rounded-md hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-50"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Breadcrumb-style display */}
                      <LineBreadcrumb
                        lineId={line.id}
                        lines={lines}
                        getLineAncestry={getLineAncestry}
                        isLeafNode={true}
                      />
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-gray-400">({line.messageIds.length})</span>
                      {line.tagIds && line.tagIds.length > 0 && (
                        <span className="text-xs text-gray-500">
                          {line.tagIds.slice(0, 2).map(tagId => {
                            const tag = tags[tagId]
                            return tag ? `#${tag.name}` : ''
                          }).filter(Boolean).join(' ')}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
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

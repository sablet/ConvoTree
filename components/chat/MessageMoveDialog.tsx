import { Button } from "@/components/ui/button"
import { GitBranch, Plus } from "lucide-react"
import type { Line, Tag } from "@/lib/types"
import { buildLineTree } from "@/lib/line-tree-builder"
import { LineBreadcrumb } from "./LineBreadcrumb"
import { useState } from "react"

interface MessageMoveDialogProps {
  isOpen: boolean
  selectedMessagesCount: number
  currentLineId: string
  lines: Record<string, Line>
  tags: Record<string, Tag>
  isUpdating: boolean
  getLineAncestry: (lineId: string) => string[]
  onConfirm: (targetLineId: string) => void
  onCreateNewLine: (lineName: string) => void
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
  onCreateNewLine,
  onCancel
}: MessageMoveDialogProps) {
  const [newLineName, setNewLineName] = useState("")
  const [isCreatingNew, setIsCreatingNew] = useState(false)

  if (!isOpen) return null

  // ツリー構造を構築
  const treeNodes = buildLineTree(lines, currentLineId)

  const handleCreateNew = () => {
    if (newLineName.trim()) {
      onCreateNewLine(newLineName.trim())
      setNewLineName("")
      setIsCreatingNew(false)
    }
  }

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

          {/* 新しいライン作成ボタン */}
          <div className="mb-4">
            {!isCreatingNew ? (
              <button
                onClick={() => setIsCreatingNew(true)}
                disabled={isUpdating}
                className="w-full text-left p-3 border-2 border-dashed border-blue-300 rounded-md hover:bg-blue-50 hover:border-blue-400 transition-colors disabled:opacity-50 flex items-center gap-2 text-blue-600"
              >
                <Plus className="h-5 w-5" />
                <span className="font-medium">新しいラインを作成</span>
              </button>
            ) : (
              <div className="p-3 border-2 border-blue-300 rounded-md bg-blue-50">
                <div className="flex flex-col gap-2">
                  <input
                    type="text"
                    value={newLineName}
                    onChange={(e) => setNewLineName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleCreateNew()
                      } else if (e.key === 'Escape') {
                        setIsCreatingNew(false)
                        setNewLineName("")
                      }
                    }}
                    placeholder="新しいライン名を入力..."
                    disabled={isUpdating}
                    className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button
                      onClick={handleCreateNew}
                      disabled={isUpdating || !newLineName.trim()}
                      className="flex-1"
                    >
                      作成して移動
                    </Button>
                    <Button
                      onClick={() => {
                        setIsCreatingNew(false)
                        setNewLineName("")
                      }}
                      variant="outline"
                      disabled={isUpdating}
                    >
                      キャンセル
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

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
              閉じる
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

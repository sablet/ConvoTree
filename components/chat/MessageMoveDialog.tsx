import { Button } from "@/components/ui/button"
import { GitBranch, Link2, AlertCircle } from "lucide-react"
import type { Line, Tag, Message } from "@/lib/types"
import { buildLineTree, type LineTreeNode } from "@/lib/line-tree-builder"
import { LineBreadcrumb } from "./LineBreadcrumb"
import { useState } from "react"
import { getLineConnectionInfo } from "@/hooks/helpers/line-connection"
import { getLineMessageCount } from "@/lib/data-helpers"

/**
 * Flatten tree structure to include all descendants
 */
function flattenLineTree(nodes: LineTreeNode[]): LineTreeNode[] {
  const result: LineTreeNode[] = []
  
  function traverse(node: LineTreeNode) {
    result.push(node)
    if (node.children && node.children.length > 0) {
      node.children.forEach(traverse)
    }
  }
  
  nodes.forEach(traverse)
  return result
}

type DialogMode = 'message-move' | 'line-connection'

interface MessageMoveDialogProps {
  isOpen: boolean
  mode?: DialogMode
  selectedMessagesCount?: number
  currentLineId: string
  lines: Record<string, Line>
  messages: Record<string, Message>
  tags: Record<string, Tag>
  isUpdating: boolean
  getLineAncestry: (lineId: string) => string[]
  onConfirm: (targetLineId: string) => void
  onCancel: () => void
}

/** Line selection button component */
function LineButton({
  line,
  isSelected,
  isCurrent,
  isLineConnectionMode: _isLineConnectionMode,
  isUpdating,
  lines,
  messages,
  tags,
  getLineAncestry,
  onSelect
}: {
  line: Line
  isSelected: boolean
  isCurrent: boolean
  isLineConnectionMode: boolean
  isUpdating: boolean
  lines: Record<string, Line>
  messages: Record<string, Message>
  tags: Record<string, Tag>
  getLineAncestry: (lineId: string) => string[]
  onSelect: (lineId: string) => void
}) {
  const buttonClass = isSelected
    ? 'border-blue-500 bg-blue-50'
    : isCurrent
    ? 'border-gray-300 bg-gray-100 cursor-not-allowed'
    : 'border-gray-200 hover:bg-gray-50 hover:border-gray-300'

  return (
    <button
      onClick={() => onSelect(line.id)}
      disabled={isUpdating || isCurrent}
      className={`w-full text-left p-3 border rounded-md transition-colors disabled:opacity-50 ${buttonClass}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <LineBreadcrumb lineId={line.id} lines={lines} getLineAncestry={getLineAncestry} isLeafNode={true} />
            {isCurrent && (
              <span className="text-xs font-medium text-gray-500 bg-gray-200 px-2 py-0.5 rounded">現在のライン</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-gray-400">({getLineMessageCount(messages, line.id)})</span>
          {line.tagIds && line.tagIds.length > 0 && (
            <span className="text-xs text-gray-500">
              {line.tagIds.slice(0, 2).map(tagId => tags[tagId]).filter(Boolean).map(tag => `#${tag.name}`).join(' ')}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

/** Connection warnings for line connection mode */
function ConnectionWarnings({ connectionInfo }: { connectionInfo: ReturnType<typeof getLineConnectionInfo> | null }) {
  if (!connectionInfo) return null
  if (connectionInfo.willCreateCircular) {
    return (
      <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 p-3 rounded">
        <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
        <div>
          <p className="font-medium">循環参照エラー</p>
          <p className="text-xs mt-1">この接続は循環参照を引き起こすため実行できません</p>
        </div>
      </div>
    )
  }
  if (connectionInfo.currentParentLine) {
    return (
      <div className="flex items-start gap-2 text-sm text-orange-600 bg-orange-50 p-3 rounded">
        <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-xs">
            元の親ライン「{connectionInfo.currentParentLine.name}」との関係は切断されます
          </p>
        </div>
      </div>
    )
  }
  return null
}

/** Get mode-specific UI configuration */
function getModeConfig(mode: DialogMode, selectedMessagesCount: number) {
  const isLineConnectionMode = mode === 'line-connection'
  return {
    isLineConnectionMode,
    Icon: isLineConnectionMode ? Link2 : GitBranch,
    title: isLineConnectionMode ? 'ライン接続' : 'メッセージを移動',
    promptMessage: isLineConnectionMode
      ? '現在のラインを接続する親ラインを選択してください：'
      : `${selectedMessagesCount}件のメッセージを移動先のラインを選択してください：`,
    cancelLabel: isLineConnectionMode ? 'キャンセル' : '閉じる'
  }
}

/** Check if connection is valid */
function checkCanConnect(
  isLineConnectionMode: boolean,
  selectedTargetLineId: string | null,
  currentLineId: string,
  connectionInfo: ReturnType<typeof getLineConnectionInfo> | null
): boolean {
  return Boolean(
    isLineConnectionMode &&
    selectedTargetLineId &&
    selectedTargetLineId !== currentLineId &&
    !connectionInfo?.willCreateCircular
  )
}

/** Modal dialog for moving messages or connecting current line to another line */
export function MessageMoveDialog({
  isOpen,
  mode = 'message-move',
  selectedMessagesCount = 0,
  currentLineId,
  lines,
  messages,
  tags,
  isUpdating,
  getLineAncestry,
  onConfirm,
  onCancel
}: MessageMoveDialogProps) {
  const [selectedTargetLineId, setSelectedTargetLineId] = useState<string | null>(null)

  if (!isOpen) return null

  const config = getModeConfig(mode, selectedMessagesCount)
  const treeNodes = buildLineTree(lines, currentLineId)
  const flattenedNodes = flattenLineTree(treeNodes)
  const connectionInfo = config.isLineConnectionMode && selectedTargetLineId
    ? getLineConnectionInfo(currentLineId, selectedTargetLineId, Object.values(lines))
    : null
  const canConnect = checkCanConnect(config.isLineConnectionMode, selectedTargetLineId, currentLineId, connectionInfo)

  const handleLineSelect = (targetLineId: string) => {
    if (!config.isLineConnectionMode) return onConfirm(targetLineId)
    setSelectedTargetLineId(targetLineId)
  }

  const handleConfirmConnection = () => {
    if (!selectedTargetLineId) return
    onConfirm(selectedTargetLineId)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <config.Icon className="h-6 w-6 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-900">{config.title}</h3>
          </div>
          <p className="text-gray-600 mb-4">{config.promptMessage}</p>

          <div className="max-h-96 overflow-y-auto space-y-2 mb-4">
            {flattenedNodes.map((node) => (
              <LineButton
                key={node.line.id}
                line={node.line}
                isSelected={config.isLineConnectionMode && selectedTargetLineId === node.line.id}
                isCurrent={node.line.id === currentLineId}
                isLineConnectionMode={config.isLineConnectionMode}
                isUpdating={isUpdating}
                lines={lines}
                messages={messages}
                tags={tags}
                getLineAncestry={getLineAncestry}
                onSelect={handleLineSelect}
              />
            ))}
          </div>
          {config.isLineConnectionMode && connectionInfo && (
            <div className="mb-4">
              <ConnectionWarnings connectionInfo={connectionInfo} />
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <Button onClick={onCancel} variant="outline" disabled={isUpdating}>
              {config.cancelLabel}
            </Button>
            {config.isLineConnectionMode && (
              <Button onClick={handleConfirmConnection} disabled={!canConnect || isUpdating}>
                {isUpdating ? '接続中...' : '接続する'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

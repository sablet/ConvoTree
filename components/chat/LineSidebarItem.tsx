import { ChevronDown, ChevronRight, Folder, FolderOpen } from "lucide-react"
import type { Message, Tag } from "@/lib/types"
import type { LineTreeNode } from "@/lib/line-tree-builder"
import { getTreePrefix } from "@/lib/line-tree-builder"
import { calculateLineCharCount } from "@/lib/utils/line-char-counter"

interface LineSidebarItemProps {
  node: LineTreeNode
  messages: Record<string, Message>
  tags: Record<string, Tag>
  currentLineId: string
  dragOverLineId: string | null
  draggedLineId: string | null
  expandedLines: Set<string>
  onLineSelect: (lineId: string) => void
  onDrop: (targetLineId: string, messageId: string) => void
  onLineDrop: (targetLineId: string, sourceLineId: string) => void
  onDragOver: (lineId: string | null) => void
  onToggleExpand: (lineId: string) => void
  onDragStart: (lineId: string) => void
  onDragEnd: () => void
}

// eslint-disable-next-line complexity
export function LineSidebarItem({
  node,
  messages,
  tags,
  currentLineId,
  dragOverLineId,
  draggedLineId,
  expandedLines,
  onLineSelect,
  onDrop,
  onLineDrop,
  onDragOver,
  onToggleExpand,
  onDragStart,
  onDragEnd
}: LineSidebarItemProps) {
  const { line, depth, children } = node
  const isCurrent = line.id === currentLineId
  const isDragOver = dragOverLineId === line.id
  const isDragging = draggedLineId === line.id
  const treePrefix = getTreePrefix(node)
  const hasChildren = Boolean(children?.length)
  const isExpanded = expandedLines.has(line.id)
  const charCount = calculateLineCharCount(line.messageIds, messages)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onDragOver(line.id)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onDragOver(null)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const data = e.dataTransfer.getData('text/plain')
    const dragType = e.dataTransfer.getData('application/x-drag-type')

    if (dragType === 'line') {
      if (data && data !== line.id) {
        onLineDrop(line.id, data)
      }
    } else if (data) {
      onDrop(line.id, data)
    }

    onDragOver(null)
  }

  const handleLineDragStart = (e: React.DragEvent) => {
    e.stopPropagation()
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', line.id)
    e.dataTransfer.setData('application/x-drag-type', 'line')
    onDragStart(line.id)
  }

  const handleLineDragEnd = (e: React.DragEvent) => {
    e.stopPropagation()
    onDragEnd()
  }

  const shouldShowChildren = hasChildren && isExpanded

  return (
    <>
      <div
        draggable
        onDragStart={handleLineDragStart}
        onDragEnd={handleLineDragEnd}
        className={`relative rounded-md transition-all cursor-move ${
          isDragging
            ? 'opacity-50'
            : isCurrent
            ? 'bg-blue-100 border border-blue-300'
            : isDragOver
            ? 'bg-green-100 border border-green-400'
            : 'hover:bg-gray-100 border border-transparent'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div
          className="flex items-center w-full text-left px-2 py-1.5 text-sm"
          style={{ paddingLeft: `${0.5 + depth * 0.75}rem` }}
        >
          {hasChildren && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onToggleExpand(line.id)
              }}
              className="mr-1 p-0.5 hover:bg-gray-200 rounded"
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3 text-gray-600" />
              ) : (
                <ChevronRight className="h-3 w-3 text-gray-600" />
              )}
            </button>
          )}

          {treePrefix && !hasChildren && (
            <span className="text-gray-400 font-mono text-xs whitespace-pre mr-1">
              {treePrefix}
            </span>
          )}

          {hasChildren ? (
            isExpanded ? (
              <FolderOpen className="h-4 w-4 text-gray-500 flex-shrink-0 mr-1.5" />
            ) : (
              <Folder className="h-4 w-4 text-gray-500 flex-shrink-0 mr-1.5" />
            )
          ) : (
            <Folder className="h-4 w-4 text-gray-400 flex-shrink-0 mr-1.5" />
          )}

          <button
            onClick={() => onLineSelect(line.id)}
            className="flex-1 min-w-0 overflow-hidden text-left"
          >
            <div className="text-xs font-medium text-gray-700 truncate">
              {line.name}
            </div>
            <div className="flex items-center gap-2 text-[10px] text-gray-500 mt-0.5">
              <span>{line.messageIds.length} msgs</span>
              <span>·</span>
              <span>{charCount} chars</span>
              {line.tagIds && line.tagIds.length > 0 && (
                <>
                  <span>·</span>
                  <span className="truncate">
                    {line.tagIds
                      .slice(0, 2)
                      .map(tagId => tags[tagId])
                      .filter(Boolean)
                      .map(tag => `#${tag.name}`)
                      .join(' ')}
                  </span>
                </>
              )}
            </div>
          </button>
        </div>
      </div>

      {shouldShowChildren && children && (
        <div className="ml-2">
          {children.map(childNode => (
            <LineSidebarItem
              key={childNode.line.id}
              node={childNode}
              messages={messages}
              tags={tags}
              currentLineId={currentLineId}
              dragOverLineId={dragOverLineId}
              draggedLineId={draggedLineId}
              expandedLines={expandedLines}
              onLineSelect={onLineSelect}
              onDrop={onDrop}
              onLineDrop={onLineDrop}
              onDragOver={onDragOver}
              onToggleExpand={onToggleExpand}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            />
          ))}
        </div>
      )}
    </>
  )
}


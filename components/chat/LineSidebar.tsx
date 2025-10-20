"use client"

import { useState, useEffect } from "react"
import { ChevronRight, ChevronDown, Folder, FolderOpen } from "lucide-react"
import type { Line, Tag } from "@/lib/types"
import { buildLineTree, getTreePrefix } from "@/lib/line-tree-builder"

interface LineSidebarProps {
  lines: Record<string, Line>
  tags: Record<string, Tag>
  currentLineId: string
  isVisible: boolean
  getLineAncestry: (lineId: string) => string[]
  onLineSelect: (lineId: string) => void
  onDrop: (targetLineId: string, messageId: string) => void
}

const COLLAPSED_KEY = 'chat-line-sidebar-collapsed'

/**
 * Line Sidebar Component for Desktop
 * 
 * Displays hierarchical line structure with drag-and-drop support.
 * Lines can be clicked to navigate, and messages can be dropped onto them.
 */
export function LineSidebar({
  lines,
  tags,
  currentLineId,
  isVisible,
  getLineAncestry,
  onLineSelect,
  onDrop
}: LineSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [dragOverLineId, setDragOverLineId] = useState<string | null>(null)

  // Load collapsed state from localStorage
  useEffect(() => {
    const saved = window.localStorage.getItem(COLLAPSED_KEY)
    if (saved !== null) {
      setIsCollapsed(saved === 'true')
    }
  }, [])

  // Save collapsed state to localStorage
  const handleToggleCollapse = () => {
    const newState = !isCollapsed
    setIsCollapsed(newState)
    window.localStorage.setItem(COLLAPSED_KEY, String(newState))
  }

  const treeNodes = buildLineTree(lines, undefined)

  if (!isVisible) {
    return null
  }

  return (
    <aside
      className={`bg-gray-50 border-r border-gray-200 flex-shrink-0 transition-all duration-300 ${
        isCollapsed ? 'w-12' : 'w-64'
      }`}
    >
      {/* Header */}
      <div className="h-14 border-b border-gray-200 flex items-center px-3 bg-white">
        <button
          onClick={handleToggleCollapse}
          className="p-1 hover:bg-gray-100 rounded transition-colors"
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? (
            <ChevronRight className="h-5 w-5 text-gray-600" />
          ) : (
            <ChevronDown className="h-5 w-5 text-gray-600" />
          )}
        </button>
        {!isCollapsed && (
          <h2 className="ml-2 text-sm font-semibold text-gray-700">Lines</h2>
        )}
      </div>

      {/* Line Tree */}
      {!isCollapsed && (
        <div className="overflow-y-auto h-[calc(100vh-3.5rem)] p-2 space-y-1">
          {treeNodes.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">
              <Folder className="w-6 h-6 mx-auto mb-2 text-gray-400" />
              <p>No lines</p>
            </div>
          ) : (
            treeNodes.map((node) => (
              <LineItem
                key={node.line.id}
                node={node}
                _lines={lines}
                tags={tags}
                currentLineId={currentLineId}
                dragOverLineId={dragOverLineId}
                _getLineAncestry={getLineAncestry}
                onLineSelect={onLineSelect}
                onDrop={onDrop}
                onDragOver={setDragOverLineId}
              />
            ))
          )}
        </div>
      )}
    </aside>
  )
}

interface LineItemProps {
  node: ReturnType<typeof buildLineTree>[number]
  _lines?: Record<string, Line>
  tags: Record<string, Tag>
  currentLineId: string
  dragOverLineId: string | null
  _getLineAncestry?: (lineId: string) => string[]
  onLineSelect: (lineId: string) => void
  onDrop: (targetLineId: string, messageId: string) => void
  onDragOver: (lineId: string | null) => void
}

/**
 * Individual line item in the sidebar tree
 */
function LineItem({
  node,
  _lines,
  tags,
  currentLineId,
  dragOverLineId,
  _getLineAncestry,
  onLineSelect,
  onDrop,
  onDragOver
}: LineItemProps) {
  const { line, depth } = node
  const isCurrent = line.id === currentLineId
  const isDragOver = dragOverLineId === line.id
  const treePrefix = getTreePrefix(node)
  const hasChildren = node.children && node.children.length > 0

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
    
    const messageId = e.dataTransfer.getData('text/plain')
    if (messageId) {
      onDrop(line.id, messageId)
    }
    
    onDragOver(null)
  }

  return (
    <div
      className={`relative rounded-md transition-all ${
        isCurrent
          ? 'bg-blue-100 border border-blue-300'
          : isDragOver
          ? 'bg-green-100 border border-green-400'
          : 'hover:bg-gray-100 border border-transparent'
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <button
        onClick={() => onLineSelect(line.id)}
        className="w-full text-left px-2 py-1.5 text-sm"
        style={{ paddingLeft: `${0.5 + depth * 0.75}rem` }}
      >
        <div className="flex items-center gap-1.5">
          {/* Tree prefix */}
          {treePrefix && (
            <span className="text-gray-400 font-mono text-xs whitespace-pre">
              {treePrefix}
            </span>
          )}

          {/* Folder icon */}
          {hasChildren ? (
            <FolderOpen className="h-4 w-4 text-gray-500 flex-shrink-0" />
          ) : (
            <Folder className="h-4 w-4 text-gray-400 flex-shrink-0" />
          )}

          {/* Line breadcrumb */}
          <div className="flex-1 min-w-0 overflow-hidden">
            <div className="text-xs font-medium text-gray-700 truncate">
              {line.name}
            </div>
            
            {/* Message count and tags */}
            <div className="flex items-center gap-2 text-[10px] text-gray-500 mt-0.5">
              <span>{line.messageIds.length} msgs</span>
              {line.tagIds && line.tagIds.length > 0 && (
                <span className="truncate">
                  {line.tagIds
                    .slice(0, 2)
                    .map((tagId) => tags[tagId])
                    .filter(Boolean)
                    .map((tag) => `#${tag.name}`)
                    .join(' ')}
                </span>
              )}
            </div>
          </div>
        </div>
      </button>
    </div>
  )
}


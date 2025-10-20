"use client"

import { useState, useEffect, useCallback } from "react"
import { ChevronRight, ChevronDown, Folder, FolderOpen } from "lucide-react"
import type { Line, Tag, Message } from "@/lib/types"
import { buildLineTree, getTreePrefix } from "@/lib/line-tree-builder"
import { MAIN_LINE_ID } from "@/lib/constants"
import { toast } from "sonner"
import { reparentLine, updateLocalStateAfterReparent, wouldCreateCircularReference } from "@/hooks/helpers/line-reparent"

const EXPANDED_LINES_KEY = 'chat-line-sidebar-expanded-lines-v2' // v2: Only expand root level by default

/**
 * Get line IDs that should be expanded by default
 * - Root level (depth=0) is always expanded
 * - Lines in the path to currentLineId are expanded
 * - Other lines are collapsed
 */
function getDefaultExpandedLines(
  lines: Record<string, Line>,
  currentLineId: string,
  getLineAncestry: (lineId: string) => string[]
): Set<string> {
  const tree = buildLineTree(lines, undefined)
  const expandedIds: string[] = []
  
  // Always expand depth=0 (root/Inbox) lines
  for (const node of tree) {
    if (node.depth === 0) {
      expandedIds.push(node.line.id)
    }
  }
  
  // Expand all lines in the ancestry path of currentLineId
  const ancestry = getLineAncestry(currentLineId)
  expandedIds.push(...ancestry)
  
  return new Set(expandedIds)
}

interface LineSidebarProps {
  lines: Record<string, Line>
  messages: Record<string, Message>
  tags: Record<string, Tag>
  currentLineId: string
  isVisible: boolean
  getLineAncestry: (lineId: string) => string[]
  onLineSelect: (lineId: string) => void
  onDrop: (targetLineId: string, messageId: string) => void
  setLines: React.Dispatch<React.SetStateAction<Record<string, Line>>>
  clearAllCaches: () => void
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
  messages,
  tags,
  currentLineId,
  isVisible,
  getLineAncestry,
  onLineSelect,
  onDrop,
  setLines,
  clearAllCaches
}: LineSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [dragOverLineId, setDragOverLineId] = useState<string | null>(null)
  const [draggedLineId, setDraggedLineId] = useState<string | null>(null)
  const [expandedLines, setExpandedLines] = useState<Set<string>>(() => {
    // Initialize with root lines and path to current line expanded
    return getDefaultExpandedLines(lines, currentLineId, getLineAncestry)
  })

  // Load collapsed state and expanded lines from localStorage
  useEffect(() => {
    const savedCollapsed = window.localStorage.getItem(COLLAPSED_KEY)
    const savedExpanded = window.localStorage.getItem(EXPANDED_LINES_KEY)
    
    // Open sidebar by default if not on main line
    if (savedCollapsed !== null) {
      setIsCollapsed(savedCollapsed === 'true')
    } else {
      setIsCollapsed(currentLineId === MAIN_LINE_ID)
    }
    
    if (savedExpanded) {
      try {
        const expanded = JSON.parse(savedExpanded)
        setExpandedLines(new Set(expanded))
      } catch (e) {
        console.error('Failed to parse expanded lines:', e)
      }
    } else {
      // No saved state, expand root lines and path to current line
      setExpandedLines(getDefaultExpandedLines(lines, currentLineId, getLineAncestry))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Expand newly added root-level lines automatically
  useEffect(() => {
    setExpandedLines(prev => {
      const tree = buildLineTree(lines, undefined)
      const newSet = new Set(prev)
      let hasNewLines = false
      
      // Only auto-expand new depth=0 lines
      for (const node of tree) {
        if (node.depth === 0 && !newSet.has(node.line.id)) {
          newSet.add(node.line.id)
          hasNewLines = true
        }
      }
      
      if (hasNewLines) {
        window.localStorage.setItem(EXPANDED_LINES_KEY, JSON.stringify(Array.from(newSet)))
      }
      return newSet
    })
  }, [lines])

  // Auto-expand path to current line when currentLineId changes
  useEffect(() => {
    setExpandedLines(prev => {
      const ancestry = getLineAncestry(currentLineId)
      const newSet = new Set(prev)
      let hasChanges = false
      
      // Add all ancestors of current line to expanded set
      for (const ancestorId of ancestry) {
        if (!newSet.has(ancestorId)) {
          newSet.add(ancestorId)
          hasChanges = true
        }
      }
      
      if (hasChanges) {
        window.localStorage.setItem(EXPANDED_LINES_KEY, JSON.stringify(Array.from(newSet)))
      }
      return newSet
    })
  }, [currentLineId, getLineAncestry])

  // Save collapsed state to localStorage
  const handleToggleCollapse = () => {
    const newState = !isCollapsed
    setIsCollapsed(newState)
    window.localStorage.setItem(COLLAPSED_KEY, String(newState))
  }

  // Toggle line expansion
  const handleToggleExpand = useCallback((lineId: string) => {
    setExpandedLines(prev => {
      const newSet = new Set(prev)
      if (newSet.has(lineId)) {
        newSet.delete(lineId)
      } else {
        newSet.add(lineId)
      }
      window.localStorage.setItem(EXPANDED_LINES_KEY, JSON.stringify(Array.from(newSet)))
      return newSet
    })
  }, [])

  // Handle line drag and drop - reparent source line under target line
  const handleLineDrop = useCallback(async (targetLineId: string, sourceLineId: string) => {
    if (targetLineId === sourceLineId) return
    
    // Check for circular reference before attempting the move
    if (wouldCreateCircularReference(sourceLineId, targetLineId, lines, messages)) {
      toast.error('Cannot move line: would create circular reference', {
        duration: 3000
      })
      return
    }
    
    try {
      // Perform the reparent operation
      await reparentLine(sourceLineId, targetLineId, lines, messages)
      
      // Update local state
      updateLocalStateAfterReparent(sourceLineId, targetLineId, lines, setLines)
      
      // Clear caches to refresh tree structure
      clearAllCaches()
      
      toast.success(`Line "${lines[sourceLineId]?.name}" moved under "${lines[targetLineId]?.name}"`, {
        duration: 3000
      })
    } catch (error) {
      console.error('Failed to reparent line:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to move line'
      toast.error(errorMessage, {
        duration: 3000
      })
    }
  }, [lines, messages, setLines, clearAllCaches])

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
        <div
          className="overflow-y-auto h-[calc(100vh-14rem)] p-2 space-y-1 pb-4"
          style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
        >
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
                draggedLineId={draggedLineId}
                expandedLines={expandedLines}
                _getLineAncestry={getLineAncestry}
                onLineSelect={onLineSelect}
                onDrop={onDrop}
                onLineDrop={handleLineDrop}
                onDragOver={setDragOverLineId}
                onToggleExpand={handleToggleExpand}
                onDragStart={setDraggedLineId}
                onDragEnd={() => setDraggedLineId(null)}
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
  draggedLineId: string | null
  expandedLines: Set<string>
  _getLineAncestry?: (lineId: string) => string[]
  onLineSelect: (lineId: string) => void
  onDrop: (targetLineId: string, messageId: string) => void
  onLineDrop: (targetLineId: string, sourceLineId: string) => void
  onDragOver: (lineId: string | null) => void
  onToggleExpand: (lineId: string) => void
  onDragStart: (lineId: string) => void
  onDragEnd: () => void
}

/**
 * Individual line item in the sidebar tree
 */
// eslint-disable-next-line complexity
function LineItem({
  node,
  _lines,
  tags,
  currentLineId,
  dragOverLineId,
  draggedLineId,
  expandedLines,
  _getLineAncestry,
  onLineSelect,
  onDrop,
  onLineDrop,
  onDragOver,
  onToggleExpand,
  onDragStart,
  onDragEnd
}: LineItemProps) {
  const { line, depth } = node
  const isCurrent = line.id === currentLineId
  const isDragOver = dragOverLineId === line.id
  const isDragging = draggedLineId === line.id
  const treePrefix = getTreePrefix(node)
  const hasChildren = node.children && node.children.length > 0
  const isExpanded = expandedLines.has(line.id)

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
      // Line drag and drop
      if (data && data !== line.id) {
        onLineDrop(line.id, data)
      }
    } else {
      // Message drag and drop
      if (data) {
        onDrop(line.id, data)
      }
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

  // Show children only if expanded
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
          {/* Expand/collapse button */}
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

          {/* Tree prefix */}
          {treePrefix && !hasChildren && (
            <span className="text-gray-400 font-mono text-xs whitespace-pre mr-1">
              {treePrefix}
            </span>
          )}

          {/* Folder icon */}
          {hasChildren ? (
            isExpanded ? (
              <FolderOpen className="h-4 w-4 text-gray-500 flex-shrink-0 mr-1.5" />
            ) : (
              <Folder className="h-4 w-4 text-gray-500 flex-shrink-0 mr-1.5" />
            )
          ) : (
            <Folder className="h-4 w-4 text-gray-400 flex-shrink-0 mr-1.5" />
          )}

          {/* Line name and info */}
          <button
            onClick={() => onLineSelect(line.id)}
            className="flex-1 min-w-0 overflow-hidden text-left"
          >
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
          </button>
        </div>
      </div>
      
      {/* Render children recursively if expanded */}
      {shouldShowChildren && node.children && (
        <div className="ml-2">
          {node.children.map((childNode) => (
            <LineItem
              key={childNode.line.id}
              node={childNode}
              _lines={_lines}
              tags={tags}
              currentLineId={currentLineId}
              dragOverLineId={dragOverLineId}
              draggedLineId={draggedLineId}
              expandedLines={expandedLines}
              _getLineAncestry={_getLineAncestry}
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


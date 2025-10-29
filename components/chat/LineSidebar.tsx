"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { ChevronRight, ChevronDown, Folder, Plus } from "lucide-react"
import type { Line, Tag, Message } from "@/lib/types"
import { buildLineTree, type LineTreeNode } from "@/lib/line-tree-builder"
import { MAIN_LINE_ID } from "@/lib/constants"
import { toast } from "sonner"
import { reparentLine, updateLocalStateAfterReparent, wouldCreateCircularReference } from "@/hooks/helpers/line-reparent"
import { LineSidebarNewLineForm } from "./LineSidebarNewLineForm"
import { LineSidebarItem } from "./LineSidebarItem"

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
  onCreateLine: (lineName: string, parentLineId?: string) => Promise<string>
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
  onCreateLine,
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
  const [isCreatingLine, setIsCreatingLine] = useState(false)
  const [newLineName, setNewLineName] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const createInputRef = useRef<HTMLInputElement | null>(null)
  const [selectedParentLineId, setSelectedParentLineId] = useState<string>("")

  const treeNodes = useMemo(() => buildLineTree(lines, undefined), [lines])

  const parentOptions = useMemo(() => {
    const options: Array<{ id: string; label: string; disabled: boolean }> = []

    const traverse = (nodes: LineTreeNode[]) => {
      nodes.forEach(node => {
        const indentation = node.depth > 0 ? `${"\u00A0\u00A0".repeat(node.depth)}└ ` : ""
        options.push({
          id: node.line.id,
          label: `${indentation}${node.line.name}`,
          disabled: node.line.messageIds.length === 0
        })

        if (node.children && node.children.length > 0) {
          traverse(node.children)
        }
      })
    }

    traverse(treeNodes)
    return options
  }, [treeNodes])

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

  useEffect(() => {
    if (isCreatingLine && createInputRef.current) {
      createInputRef.current.focus()
      createInputRef.current.select()
    }
  }, [isCreatingLine])

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

  const handleStartCreateLine = useCallback(() => {
    if (isSubmitting || isCreatingLine) return

    let defaultParent = ""
    const currentLine = lines[currentLineId]
    if (currentLine && currentLine.messageIds.length > 0) {
      defaultParent = currentLine.id
    }

    const openForm = () => {
      setSelectedParentLineId(defaultParent)
      setIsCreatingLine(true)
    }

    if (isCollapsed) {
      setIsCollapsed(false)
      window.localStorage.setItem(COLLAPSED_KEY, 'false')
      setTimeout(openForm, 0)
    } else {
      openForm()
    }
  }, [isCollapsed, isSubmitting, isCreatingLine, lines, currentLineId])

  const handleCancelCreate = useCallback(() => {
    if (isSubmitting) return
    setIsCreatingLine(false)
    setNewLineName("")
    setSelectedParentLineId("")
  }, [isSubmitting])

  const handleCreateLineSubmit = useCallback(async () => {
    if (isSubmitting) return
    const trimmed = newLineName.trim()
    if (!trimmed) {
      toast.error('ライン名を入力してください')
      return
    }

    setIsSubmitting(true)
    try {
      const parentId = selectedParentLineId || undefined
      const newLineId = await onCreateLine(trimmed, parentId)

      setExpandedLines(prev => {
        const newSet = new Set(prev)
        if (parentId) {
          newSet.add(parentId)
        }
        newSet.add(newLineId)
        window.localStorage.setItem(EXPANDED_LINES_KEY, JSON.stringify(Array.from(newSet)))
        return newSet
      })

      setNewLineName("")
      setSelectedParentLineId("")
      setIsCreatingLine(false)
    } catch {
      // Error is handled within onCreateLine
    } finally {
      setIsSubmitting(false)
    }
  }, [isSubmitting, newLineName, onCreateLine, selectedParentLineId])

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
      <div className="h-14 border-b border-gray-200 flex items-center px-3 bg-white gap-2">
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
          <h2 className="text-sm font-semibold text-gray-700">Lines</h2>
        )}
        <button
          onClick={handleStartCreateLine}
          className={`ml-auto p-1.5 rounded transition-colors ${
            isCollapsed ? 'hover:bg-blue-50 text-blue-600' : 'hover:bg-blue-100 text-blue-600'
          } disabled:opacity-40 disabled:cursor-not-allowed`}
          title="新しいラインを作成"
          aria-label="新しいラインを作成"
          disabled={isSubmitting}
          type="button"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Line Tree */}
      {!isCollapsed && (
        <div
          className="overflow-y-auto h-[calc(100vh-14rem)] p-2 space-y-1 pb-4"
          style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
        >
          {isCreatingLine && (
            <LineSidebarNewLineForm
              value={newLineName}
              isSubmitting={isSubmitting}
              onChange={setNewLineName}
              onSubmit={() => {
                void handleCreateLineSubmit()
              }}
              onCancel={handleCancelCreate}
              inputRef={createInputRef}
              parentOptions={parentOptions}
              selectedParentId={selectedParentLineId}
              onParentChange={setSelectedParentLineId}
            />
          )}
          {treeNodes.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">
              <Folder className="w-6 h-6 mx-auto mb-2 text-gray-400" />
              <p>No lines</p>
            </div>
          ) : (
            treeNodes.map((node) => (
              <LineSidebarItem
                key={node.line.id}
                node={node}
                messages={messages}
                tags={tags}
                currentLineId={currentLineId}
                dragOverLineId={dragOverLineId}
                draggedLineId={draggedLineId}
                expandedLines={expandedLines}
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


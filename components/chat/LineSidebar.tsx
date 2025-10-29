"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { ChevronRight, ChevronDown, Folder, Plus, Trash2 } from "lucide-react"
import type { Line, Tag, Message } from "@/lib/types"
import { toast } from "sonner"
import { reparentLine, updateLocalStateAfterReparent, wouldCreateCircularReference } from "@/hooks/helpers/line-reparent"
import { LineSidebarNewLineForm } from "./LineSidebarNewLineForm"
import { LineSidebarDeleteLineForm } from "./LineSidebarDeleteLineForm"
import { LineSidebarItem } from "./LineSidebarItem"
import { useLineTreeData } from "./useLineSidebarTree"
import { useLineSidebarExpansion, COLLAPSED_KEY, EXPANDED_LINES_KEY } from "./useLineSidebarExpansion"
import { useLineDeletionControls } from "./useLineSidebarDeletion"

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
  onDeleteLine: (lineId: string) => Promise<void>
  setLines: React.Dispatch<React.SetStateAction<Record<string, Line>>>
  clearAllCaches: () => void
}

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
  onDeleteLine,
  setLines,
  clearAllCaches
}: LineSidebarProps) {
  const [dragOverLineId, setDragOverLineId] = useState<string | null>(null)
  const [draggedLineId, setDraggedLineId] = useState<string | null>(null)
  const [isCreatingLine, setIsCreatingLine] = useState(false)
  const [newLineName, setNewLineName] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const createInputRef = useRef<HTMLInputElement | null>(null)
  const [selectedParentLineId, setSelectedParentLineId] = useState<string>("")
  const { treeNodes, parentOptions, deleteOptions } = useLineTreeData(lines)
  const {
    isCollapsed,
    setIsCollapsed,
    expandedLines,
    setExpandedLines,
    handleToggleCollapse,
    handleToggleExpand
  } = useLineSidebarExpansion({
    lines,
    currentLineId,
    getLineAncestry
  })
  const {
    isDeletingLine,
    isDeleting,
    selectedDeleteLineId,
    hasDeletableLines,
    startDeletion,
    cancelDeletion,
    submitDeletion,
    setSelectedDeleteLineId
  } = useLineDeletionControls({
    deleteOptions,
    lines,
    onDeleteLine,
    isCollapsed,
    setIsCollapsed,
    setExpandedLines
  })

  useEffect(() => {
    if (isCreatingLine && createInputRef.current) {
      createInputRef.current.focus()
      createInputRef.current.select()
    }
  }, [isCreatingLine])

  const handleStartCreateLine = useCallback(() => {
    if (isSubmitting || isCreatingLine) return

    let defaultParent = ""
    const currentLine = lines[currentLineId]
    if (currentLine && currentLine.messageIds.length > 0) {
      defaultParent = currentLine.id
    }

    const openForm = () => {
      cancelDeletion()
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
  }, [isCollapsed, setIsCollapsed, isSubmitting, isCreatingLine, lines, currentLineId, cancelDeletion])

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
  }, [isSubmitting, newLineName, onCreateLine, selectedParentLineId, setExpandedLines])

  const handleStartDeleteLine = useCallback(() => {
    startDeletion(() => {
      setIsCreatingLine(false)
      setNewLineName('')
      setSelectedParentLineId('')
    })
  }, [startDeletion])

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
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={handleStartDeleteLine}
            className={`p-1.5 rounded transition-colors ${
              isCollapsed ? 'hover:bg-red-50 text-red-500' : 'hover:bg-red-100 text-red-600'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
            title="既存ラインを削除"
            aria-label="既存ラインを削除"
            disabled={isDeleting || isSubmitting || !hasDeletableLines}
            type="button"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            onClick={handleStartCreateLine}
            className={`p-1.5 rounded transition-colors ${
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
      </div>

      {/* Line Tree */}
      {!isCollapsed && (
        <div
          className="overflow-y-auto h-[calc(100vh-14rem)] p-2 space-y-1 pb-4"
          style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
        >
          {isDeletingLine && (
            <LineSidebarDeleteLineForm
              options={deleteOptions}
              selectedLineId={selectedDeleteLineId}
              isDeleting={isDeleting}
              onSelect={setSelectedDeleteLineId}
              onConfirm={() => {
                void submitDeletion()
              }}
              onCancel={cancelDeletion}
            />
          )}
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


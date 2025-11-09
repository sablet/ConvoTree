"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Folder } from "lucide-react"
import type { Line, Tag, Message } from "@/lib/types"
import { toast } from "sonner"
import { reparentLine, updateLocalStateAfterReparent, wouldCreateCircularReference } from "@/hooks/helpers/line-reparent"
import { LineSidebarNewLineForm } from "./LineSidebarNewLineForm"
import { LineSidebarDeleteLineForm } from "./LineSidebarDeleteLineForm"
import { LineSidebarItem } from "./LineSidebarItem"
import { LineSidebarHeader } from "./LineSidebarHeader"
import { useLineTreeData } from "./useLineSidebarTree"
import { useLineSidebarExpansion, COLLAPSED_KEY, EXPANDED_LINES_KEY } from "./useLineSidebarExpansion"
import { useLineDeletionControls } from "./useLineSidebarDeletion"

interface LineSidebarProps {
  lines: Record<string, Line>
  messages: Record<string, Message>
  tags: Record<string, Tag>
  currentLineId: string
  forceCollapsed: boolean
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
  forceCollapsed,
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
  const [isTemporarilyExpanded, setIsTemporarilyExpanded] = useState(false)
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

  // Apply force collapse when window is small, unless temporarily expanded
  const effectiveIsCollapsed = forceCollapsed ? !isTemporarilyExpanded : isCollapsed

  // Handle toggle when force collapsed - show as overlay
  const handleToggleWhenForceCollapsed = useCallback(() => {
    if (forceCollapsed) {
      setIsTemporarilyExpanded(prev => !prev)
    } else {
      handleToggleCollapse()
    }
  }, [forceCollapsed, handleToggleCollapse])

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

    if (effectiveIsCollapsed && !forceCollapsed) {
      setIsCollapsed(false)
      window.localStorage.setItem(COLLAPSED_KEY, 'false')
      setTimeout(openForm, 0)
    } else if (!forceCollapsed) {
      openForm()
    }
  }, [effectiveIsCollapsed, forceCollapsed, setIsCollapsed, isSubmitting, isCreatingLine, lines, currentLineId, cancelDeletion])

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

  return (
    <>
      {/* Overlay backdrop for small screens when expanded */}
      {forceCollapsed && isTemporarilyExpanded && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setIsTemporarilyExpanded(false)}
        />
      )}

      <aside
        className={`bg-gray-50 border-r border-gray-200 flex-shrink-0 transition-all duration-300 ${
          effectiveIsCollapsed ? 'w-12' : 'w-64'
        } ${forceCollapsed && isTemporarilyExpanded ? 'fixed left-0 top-0 bottom-0 z-50' : ''}`}
      >
        <LineSidebarHeader
          effectiveIsCollapsed={effectiveIsCollapsed}
          forceCollapsed={forceCollapsed}
          isDeleting={isDeleting}
          isSubmitting={isSubmitting}
          hasDeletableLines={hasDeletableLines}
          onToggleCollapse={handleToggleWhenForceCollapsed}
          onStartDeleteLine={handleStartDeleteLine}
          onStartCreateLine={handleStartCreateLine}
        />

      {/* Line Tree */}
      {!effectiveIsCollapsed && (
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
    </>
  )
}


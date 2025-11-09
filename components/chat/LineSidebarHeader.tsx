"use client"

import { ChevronRight, ChevronDown, Plus, Trash2 } from "lucide-react"

interface LineSidebarHeaderProps {
  effectiveIsCollapsed: boolean
  forceCollapsed: boolean
  isDeleting: boolean
  isSubmitting: boolean
  hasDeletableLines: boolean
  onToggleCollapse: () => void
  onStartDeleteLine: () => void
  onStartCreateLine: () => void
}

/**
 * Header component for LineSidebar with collapse toggle and action buttons
 */
export function LineSidebarHeader({
  effectiveIsCollapsed,
  forceCollapsed,
  isDeleting,
  isSubmitting,
  hasDeletableLines,
  onToggleCollapse,
  onStartDeleteLine,
  onStartCreateLine
}: LineSidebarHeaderProps) {
  return (
    <div className="h-14 border-b border-gray-200 flex items-center px-3 bg-white gap-2">
      <button
        onClick={onToggleCollapse}
        className="p-1 hover:bg-gray-100 rounded transition-colors"
        title={effectiveIsCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {effectiveIsCollapsed ? (
          <ChevronRight className="h-5 w-5 text-gray-600" />
        ) : (
          <ChevronDown className="h-5 w-5 text-gray-600" />
        )}
      </button>
      {!effectiveIsCollapsed && (
        <h2 className="text-sm font-semibold text-gray-700">Lines</h2>
      )}
      <div className="ml-auto flex items-center gap-1">
        <button
          onClick={onStartDeleteLine}
          className={`p-1.5 rounded transition-colors ${
            effectiveIsCollapsed ? 'hover:bg-red-50 text-red-500' : 'hover:bg-red-100 text-red-600'
          } disabled:opacity-40 disabled:cursor-not-allowed`}
          title="既存ラインを削除"
          aria-label="既存ラインを削除"
          disabled={isDeleting || isSubmitting || !hasDeletableLines || forceCollapsed}
          type="button"
        >
          <Trash2 className="h-4 w-4" />
        </button>
        <button
          onClick={onStartCreateLine}
          className={`p-1.5 rounded transition-colors ${
            effectiveIsCollapsed ? 'hover:bg-blue-50 text-blue-600' : 'hover:bg-blue-100 text-blue-600'
          } disabled:opacity-40 disabled:cursor-not-allowed`}
          title="新しいラインを作成"
          aria-label="新しいラインを作成"
          disabled={isSubmitting || forceCollapsed}
          type="button"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

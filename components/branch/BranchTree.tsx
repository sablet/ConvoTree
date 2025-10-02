"use client"

import React from "react"
import { GitBranch } from "lucide-react"
import { Line } from "@/lib/types"
import { BranchNode as BranchNodeType } from "@/lib/branch-tree-builder"
import { BranchNode } from "./BranchNode"
import { BranchNodeHandlers, BranchDisplayData } from "./types"

interface BranchTreeProps extends BranchNodeHandlers, BranchDisplayData {
  tree: BranchNodeType[]
  currentLineId: string
  editingLineId: string | null
  canDeleteLine: (line: Line) => boolean
}

export function BranchTree({
  tree,
  currentLineId,
  editingLineId,
  editData,
  tags,
  tagGroups,
  onLineClick,
  onEditStart,
  onEditSave,
  onEditCancel,
  onEditDataChange,
  onAddExistingTag,
  onRemoveTag,
  onDeleteConfirm,
  onViewChange,
  canDeleteLine
}: BranchTreeProps) {
  if (tree.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <GitBranch className="w-8 h-8 mx-auto mb-2 text-gray-400" />
        <p>ブランチが見つかりません</p>
      </div>
    )
  }

  return (
    <div
      className="space-y-2 max-h-[70vh] overflow-y-auto"
      style={{
        wordWrap: 'break-word',
        overflowWrap: 'anywhere',
        maxWidth: '100%',
        width: '100%',
        boxSizing: 'border-box'
      }}
    >
      {tree.map(node => (
        <BranchNode
          key={node.line.id}
          node={node}
          isActive={node.line.id === currentLineId}
          isEditing={editingLineId === node.line.id}
          canDelete={canDeleteLine(node.line)}
          editData={editData}
          tags={tags}
          tagGroups={tagGroups}
          onLineClick={onLineClick}
          onEditStart={onEditStart}
          onEditSave={onEditSave}
          onEditCancel={onEditCancel}
          onEditDataChange={onEditDataChange}
          onAddExistingTag={onAddExistingTag}
          onRemoveTag={onRemoveTag}
          onDeleteConfirm={onDeleteConfirm}
          onViewChange={onViewChange}
        />
      ))}
    </div>
  )
}

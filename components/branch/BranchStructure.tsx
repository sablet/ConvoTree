"use client"

import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { BarChart3 } from "lucide-react"
import { Message, Line, Tag, BranchPoint, TagGroup } from "@/lib/types"
import { MAIN_LINE_ID } from "@/lib/constants"
import { BranchTreeBuilder } from "@/lib/branch-tree-builder"
import { BranchTree } from "./BranchTree"
import { StatisticsView } from "./StatisticsView"
import { DeleteConfirmDialog } from "./DeleteConfirmDialog"

interface BranchStructureProps {
  messages: Record<string, Message>
  lines: Line[]
  branchPoints: Record<string, BranchPoint>
  tags: Record<string, Tag>
  tagGroups: Record<string, TagGroup>
  currentLineId: string
  onLineSwitch: (lineId: string) => void
  onLineEdit: (lineId: string, updates: Partial<Line>) => void
  onLineDelete?: (lineId: string) => void
  onViewChange?: (view: 'chat' | 'management' | 'branches') => void
}

export function BranchStructure({
  messages,
  lines,
  branchPoints,
  tags,
  tagGroups,
  currentLineId,
  onLineSwitch,
  onLineEdit,
  onLineDelete,
  onViewChange
}: BranchStructureProps) {
  const [editingLineId, setEditingLineId] = useState<string | null>(null)
  const [editData, setEditData] = useState<{
    name: string
    tagIds: string[]
    availableTags: string[]
  }>({
    name: "",
    tagIds: [],
    availableTags: []
  })
  const [showStatistics, setShowStatistics] = useState(false)
  const [sortByTag, setSortByTag] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)

  const tagsByGroup = useMemo(() => {
    const grouped: Record<string, string[]> = {}

    Object.values(tagGroups).forEach(group => {
      grouped[group.name] = []
    })

    Object.values(tags).forEach(tag => {
      if (tag.groupId && tagGroups[tag.groupId]) {
        const groupName = tagGroups[tag.groupId].name
        if (!grouped[groupName]) {
          grouped[groupName] = []
        }
        grouped[groupName].push(tag.name)
      }
    })

    return grouped
  }, [tags, tagGroups])

  const allBranches = useMemo(() => {
    const flattened = BranchTreeBuilder.buildTree(messages, lines)

    if (sortByTag) {
      return flattened.filter(node => {
        const line = node.line
        if (!line.tagIds || line.tagIds.length === 0) return false
        return line.tagIds.some(tagId => {
          const tag = tags[tagId]
          return tag && tag.name === sortByTag
        })
      })
    }

    return flattened
  }, [messages, lines, sortByTag, tags])

  const statistics = useMemo(() => {
    const totalLines = lines.length
    const totalMessages = Object.keys(messages).length
    const totalBranches = Object.keys(branchPoints).length

    const linesByDepth: Record<number, number> = {}
    const messagesByLine: Record<string, number> = {}

    allBranches.forEach(node => {
      linesByDepth[node.depth] = (linesByDepth[node.depth] || 0) + 1
      messagesByLine[node.line.id] = node.messageCount
    })

    const maxDepth = Math.max(...Object.keys(linesByDepth).map(Number), 0)
    const avgMessagesPerLine = totalMessages / totalLines || 0

    return {
      totalLines,
      totalMessages,
      totalBranches,
      maxDepth,
      avgMessagesPerLine,
      linesByDepth,
      messagesByLine
    }
  }, [allBranches, lines, messages, branchPoints])

  const handleEditStart = (line: Line) => {
    const currentTagIds = line.tagIds || []
    const availableTags = Object.keys(tags).filter(tagId => !currentTagIds.includes(tagId))

    setEditData({
      name: line.name,
      tagIds: [...currentTagIds],
      availableTags
    })
    setEditingLineId(line.id)
  }

  const handleEditSave = () => {
    if (editingLineId) {
      onLineEdit(editingLineId, {
        name: editData.name,
        tagIds: editData.tagIds,
        updated_at: new Date().toISOString()
      })
      setEditingLineId(null)
    }
  }

  const handleAddExistingTag = (tagId: string) => {
    setEditData(prev => ({
      ...prev,
      tagIds: [...prev.tagIds, tagId],
      availableTags: prev.availableTags.filter(id => id !== tagId)
    }))
  }

  const handleRemoveTag = (tagId: string) => {
    setEditData(prev => ({
      ...prev,
      tagIds: prev.tagIds.filter(id => id !== tagId),
      availableTags: [...prev.availableTags, tagId]
    }))
  }

  const handleLineClick = (line: Line, event: React.MouseEvent) => {
    if (editingLineId === line.id) {
      return
    }

    if ((event.target as HTMLElement).closest('button') ||
        (event.target as HTMLElement).closest('input') ||
        (event.target as HTMLElement).tagName.toLowerCase() === 'input') {
      return
    }

    onLineSwitch(line.id)
    onViewChange?.('chat')
  }

  const handleDeleteConfirm = (lineId: string) => {
    if (onLineDelete) {
      onLineDelete(lineId)
    }
    setShowDeleteConfirm(null)
  }

  const canDeleteLine = (line: Line): boolean => {
    if (line.id === MAIN_LINE_ID) {
      return false
    }
    return true
  }

  if (showStatistics) {
    return (
      <StatisticsView
        statistics={statistics}
        onClose={() => setShowStatistics(false)}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">ブランチ構造</h2>
        <div className="flex gap-2">
          <select
            value={sortByTag || ""}
            onChange={(e) => setSortByTag(e.target.value || null)}
            className="text-xs border border-gray-300 rounded px-2 py-1"
          >
            <option value="">全て表示</option>
            {Object.entries(tagsByGroup).map(([groupName, tagNames]) => (
              <optgroup key={groupName} label={groupName}>
                {tagNames.map(tagName => (
                  <option key={tagName} value={tagName}>
                    {tagName}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <Button
            onClick={() => setShowStatistics(true)}
            variant="outline"
            size="sm"
          >
            <BarChart3 className="w-4 h-4 mr-1" />
            統計
          </Button>
        </div>
      </div>

      <BranchTree
        tree={allBranches}
        currentLineId={currentLineId}
        editingLineId={editingLineId}
        editData={editData}
        tags={tags}
        tagGroups={tagGroups}
        onLineClick={handleLineClick}
        onEditStart={handleEditStart}
        onEditSave={handleEditSave}
        onEditCancel={() => setEditingLineId(null)}
        onEditDataChange={setEditData}
        onAddExistingTag={handleAddExistingTag}
        onRemoveTag={handleRemoveTag}
        onDeleteConfirm={setShowDeleteConfirm}
        onViewChange={onViewChange}
        canDeleteLine={canDeleteLine}
      />

      {showDeleteConfirm && onLineDelete && (
        <DeleteConfirmDialog
          line={lines.find(l => l.id === showDeleteConfirm) || null}
          onConfirm={() => handleDeleteConfirm(showDeleteConfirm)}
          onCancel={() => setShowDeleteConfirm(null)}
        />
      )}
    </div>
  )
}

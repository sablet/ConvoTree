"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, Edit, Trash2, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useTagContext, Tag } from "@/lib/tag-context"
import { TagEditDialog } from "@/components/tag-edit-dialog"

interface TagManagementProps {
  className?: string
}

export function TagManagement({ className }: TagManagementProps) {
  const { state, actions } = useTagContext()
  const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set())
  const [editingTag, setEditingTag] = useState<Tag | null>(null)
  const [parentTagForNewSubtag, setParentTagForNewSubtag] = useState<Tag | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  if (state.isLoading) {
    return (
      <div className={`bg-white ${className || ''}`}>
        <div className="flex items-center justify-center p-8">
          <div className="text-gray-500">タグを読み込み中...</div>
        </div>
      </div>
    )
  }

  if (state.error) {
    return (
      <div className={`bg-white ${className || ''}`}>
        <div className="flex items-center justify-center p-8">
          <div className="text-red-500">エラー: {state.error}</div>
        </div>
      </div>
    )
  }

  const toggleExpanded = (tagId: string) => {
    const newExpanded = new Set(expandedTags)
    if (newExpanded.has(tagId)) {
      newExpanded.delete(tagId)
    } else {
      newExpanded.add(tagId)
    }
    setExpandedTags(newExpanded)
  }

  const handleEditTag = (tag: Tag) => {
    setEditingTag(tag)
    setParentTagForNewSubtag(null)
    setIsDialogOpen(true)
  }

  const handleAddSubtag = (parentTag: Tag) => {
    setEditingTag(null)
    setParentTagForNewSubtag(parentTag)
    setIsDialogOpen(true)
  }

  const handleAddNewTag = () => {
    setEditingTag(null)
    setParentTagForNewSubtag(null)
    setIsDialogOpen(true)
  }

  const handleSaveTag = async (tag: Tag) => {
    if (editingTag) {
      await actions.updateTag(tag)
    } else if (parentTagForNewSubtag) {
      await actions.addSubtag(parentTagForNewSubtag.id, tag)
    } else {
      await actions.addTag(tag)
      // 新しいタグを追加した後、データを再読み込み
      await actions.loadTags()
    }
  }

  const handleDeleteTag = async (tagId: string) => {
    if (confirm("このタグを削除しますか？関連するサブタグも削除されます。")) {
      await actions.deleteTag(tagId)
    }
  }

  const renderTag = (tag: Tag, level: number = 0) => {
    const hasSubtags = tag.subtags && tag.subtags.length > 0
    const isExpanded = expandedTags.has(tag.id)

    return (
      <div key={tag.id} className="w-full">
        <div
          className={`
            flex items-center justify-between py-3 px-4 hover:bg-gray-50
            ${level > 0 ? 'ml-6 border-l-2 border-gray-200' : ''}
          `}
        >
          <div className="flex items-center flex-1 min-w-0">
            {hasSubtags && (
              <button
                onClick={() => toggleExpanded(tag.id)}
                className="mr-2 p-1 hover:bg-gray-100 rounded"
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>
            )}

            <div className="flex items-center flex-1 min-w-0">
              <div
                className="w-4 h-4 rounded-full mr-3 flex-shrink-0"
                style={{ backgroundColor: tag.color }}
              />
              <span className="text-sm font-medium text-gray-900 truncate">
                {tag.name}
              </span>
              {hasSubtags && level === 0 && (
                <span className="text-xs text-gray-500 ml-2">
                  ({tag.subtags?.length}個のサブタグ)
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-3 flex-shrink-0">
            <span className="text-sm text-gray-600 min-w-[3rem] text-right">
              {tag.count || 0}
            </span>
            <div className="flex space-x-1">
              {/* サブタグ追加ボタン（レベル2まで） */}
              {level < 2 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-green-600 hover:text-green-700"
                  onClick={() => handleAddSubtag(tag)}
                  title="サブタグを追加"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => handleEditTag(tag)}
                title="編集"
              >
                <Edit className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                onClick={() => handleDeleteTag(tag.id)}
                title="削除"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {hasSubtags && isExpanded && (
          <div className="bg-gray-50">
            {tag.subtags?.map(subtag => renderTag(subtag, level + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={`bg-white ${className || ''}`}>
      {/* ヘッダー */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center space-x-4">
          <span className="text-sm font-medium text-gray-700">タグ名</span>
          <span className="text-sm font-medium text-gray-700">色</span>
          <span className="text-sm font-medium text-gray-700">使用数</span>
          <span className="text-sm font-medium text-gray-700">操作</span>
        </div>
        <Button
          onClick={handleAddNewTag}
          size="sm"
          className="flex items-center space-x-2"
        >
          <Plus className="w-4 h-4" />
          <span>新しいタグ</span>
        </Button>
      </div>

      {/* タグリスト */}
      <div className="divide-y divide-gray-200">
        {state.tags.map(tag => renderTag(tag))}
      </div>

      {/* 編集ダイアログ */}
      <TagEditDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        tag={editingTag}
        parentTag={parentTagForNewSubtag}
        onSave={handleSaveTag}
      />
    </div>
  )
}
"use client"

import React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  GitBranch,
  Edit3,
  MessageSquare,
  Clock,
  X,
  Plus,
  Circle,
  Dot,
  Trash2
} from "lucide-react"
import { formatRelativeTime } from "@/lib/utils/date"
import { BranchNode as BranchNodeType } from "@/lib/branch-tree-builder"
import { BranchNodeHandlers, BranchDisplayData } from "./types"
import type { Tag, Message } from "@/lib/types"
import { getLineCharCount } from "@/lib/data-helpers"

interface BranchNodeProps extends BranchNodeHandlers, BranchDisplayData {
  node: BranchNodeType
  messages: Record<string, Message>
  isActive: boolean
  isEditing: boolean
  canDelete: boolean
}

function BranchIcon({ depth, isActive }: { depth: number; isActive: boolean }) {
  return (
    <div className="flex items-center flex-shrink-0">
      {depth > 0 && (
        <div className="flex items-center">
          {Array.from({ length: depth }).map((_, i) => (
            <Dot key={i} className="w-3 h-3 text-gray-400" />
          ))}
        </div>
      )}
      <div className={`p-1 rounded-full flex-shrink-0 ${isActive ? 'bg-blue-100' : 'bg-gray-100'}`}>
        <GitBranch className={`w-4 h-4 ${isActive ? 'text-blue-600' : 'text-gray-600'}`} />
      </div>
    </div>
  )
}

function ViewModeContent({
  line,
  messages,
  isActive,
  messageCount,
  relativeTime,
  tags
}: {
  line: BranchNodeType['line']
  messages: Record<string, Message>
  isActive: boolean
  messageCount: number
  relativeTime: string | null
  tags: Record<string, Tag>
}) {
  const charCount = getLineCharCount(messages, line.id)
  
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <h3
          className={`font-medium truncate ${isActive ? 'text-blue-900' : 'text-gray-900'}`}
          style={{ wordWrap: 'break-word', overflowWrap: 'anywhere', wordBreak: 'break-word', maxWidth: '100%' }}
        >
          {line.name}
        </h3>
        {isActive && <Circle className="w-3 h-3 text-blue-500 fill-current flex-shrink-0" />}
      </div>

      <div className="flex items-center gap-3 text-xs text-gray-500 flex-shrink-0">
        <span className="flex items-center gap-1">
          <MessageSquare className="w-3 h-3" />
          {messageCount}
        </span>
        <span>·</span>
        <span>{charCount} chars</span>
        {relativeTime && (
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {relativeTime}
          </span>
        )}
      </div>

      {line.tagIds && line.tagIds.length > 0 && (
        <div className="flex gap-1 flex-shrink-0">
          {line.tagIds.slice(0, 2).map((tagId, index) => {
            const tag = tags[tagId]
            if (!tag) return null
            return (
              <Badge
                key={index}
                variant="secondary"
                className="text-xs bg-emerald-100 text-emerald-700"
                style={{ wordWrap: 'break-word', overflowWrap: 'anywhere', wordBreak: 'break-word', maxWidth: '100%' }}
              >
                {tag.name}
              </Badge>
            )
          })}
          {line.tagIds.length > 2 && (
            <Badge variant="secondary" className="text-xs bg-gray-100 text-gray-600">
              +{line.tagIds.length - 2}
            </Badge>
          )}
        </div>
      )}
    </div>
  )
}

function EditModeContent({
  editData,
  tags,
  tagGroups,
  onEditDataChange,
  onRemoveTag,
  onAddExistingTag,
  onViewChange
}: Pick<BranchNodeProps, 'editData' | 'tags' | 'tagGroups' | 'onEditDataChange' | 'onRemoveTag' | 'onAddExistingTag' | 'onViewChange'>) {
  return (
    <div className="space-y-3">
      <Input
        value={editData.name}
        onChange={(e) => onEditDataChange({ ...editData, name: e.target.value })}
        placeholder="ライン名"
        className="text-sm"
        style={{ wordWrap: 'break-word', overflowWrap: 'anywhere', wordBreak: 'break-word', maxWidth: '100%', width: '100%', boxSizing: 'border-box' }}
      />

      {editData.tagIds.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-gray-600">現在のタグ:</div>
          <div className="flex flex-wrap gap-1">
            {editData.tagIds.map((tagId) => {
              const tag = tags[tagId]
              if (!tag) return null
              return (
                <Badge
                  key={tagId}
                  variant="secondary"
                  className="text-xs bg-emerald-100 text-emerald-700 flex items-center gap-1"
                  style={{ wordWrap: 'break-word', overflowWrap: 'anywhere', wordBreak: 'break-word', maxWidth: '100%' }}
                >
                  {tag.name}
                  <Button onClick={() => onRemoveTag(tagId)} size="sm" variant="ghost" className="h-3 w-3 p-0 hover:bg-emerald-200">
                    <X className="h-2 w-2" />
                  </Button>
                </Badge>
              )
            })}
          </div>
        </div>
      )}

      {editData.availableTags.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-gray-600">既存タグから追加:</div>
          <div className="space-y-3">
            {Object.values(tagGroups)
              .sort((a, b) => a.order - b.order)
              .map(group => {
                const groupTags = editData.availableTags.filter(tagId => tags[tagId]?.groupId === group.id)
                if (groupTags.length === 0) return null

                return (
                  <div key={group.id} className="space-y-1">
                    <div className="text-xs font-medium text-gray-500">{group.name}</div>
                    <div className="flex flex-wrap gap-1">
                      {groupTags.map((tagId) => {
                        const tag = tags[tagId]
                        if (!tag) return null
                        return (
                          <Button
                            key={tagId}
                            onClick={() => onAddExistingTag(tagId)}
                            size="sm"
                            variant="outline"
                            className="text-xs h-6 px-2 border-gray-300 hover:border-emerald-400 hover:bg-emerald-50"
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            {tag.name}
                          </Button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="text-xs text-gray-600">新しいタグを作成する場合は</div>
        <button
          onClick={() => onViewChange?.('management')}
          className="text-xs text-blue-600 hover:text-blue-800 underline cursor-pointer"
        >
          タグ管理画面 (/management) をご利用ください
        </button>
      </div>
    </div>
  )
}

function ActionButtons({
  isEditing,
  canDelete,
  line,
  onEditStart,
  onDeleteConfirm,
  onEditCancel,
  onEditSave
}: Pick<BranchNodeProps, 'isEditing' | 'canDelete' | 'onEditStart' | 'onDeleteConfirm' | 'onEditCancel' | 'onEditSave'> & { line: BranchNodeType['line'] }) {
  if (!isEditing) {
    return (
      <>
        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onEditStart(line) }} className="h-8 px-2 text-gray-400 hover:text-gray-600">
          <Edit3 className="h-4 w-4" />
        </Button>
        {canDelete && (
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onDeleteConfirm(line.id) }} className="h-8 px-2 text-gray-400 hover:text-red-600">
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </>
    )
  }

  return (
    <div className="flex gap-1">
      <Button onClick={(e) => { e.stopPropagation(); onEditCancel() }} size="sm" variant="outline" className="text-xs h-8 px-2">
        キャンセル
      </Button>
      <Button onClick={(e) => { e.stopPropagation(); onEditSave() }} size="sm" className="text-xs h-8 px-2 bg-emerald-500 hover:bg-emerald-600">
        保存
      </Button>
    </div>
  )
}

export function BranchNode({
  node,
  messages,
  isActive,
  isEditing,
  canDelete,
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
  onViewChange
}: BranchNodeProps) {
  const { line, depth, messageCount } = node
  const relativeTime = formatRelativeTime(line.updated_at, line.created_at)

  return (
    <div className="w-full">
      <div
        className={`flex items-center gap-3 p-3 rounded-lg border transition-all duration-200 cursor-pointer ${
          isActive ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
        }`}
        style={{ marginLeft: depth > 0 ? `${depth * 16}px` : '0px', paddingLeft: '12px' }}
        onClick={(e) => onLineClick(line, e)}
      >
        <BranchIcon depth={depth} isActive={isActive} />

        <div className="flex-1 min-w-0">
          {!isEditing ? (
            <ViewModeContent line={line} messages={messages} isActive={isActive} messageCount={messageCount} relativeTime={relativeTime} tags={tags} />
          ) : (
            <EditModeContent
              editData={editData}
              tags={tags}
              tagGroups={tagGroups}
              onEditDataChange={onEditDataChange}
              onRemoveTag={onRemoveTag}
              onAddExistingTag={onAddExistingTag}
              onViewChange={onViewChange}
            />
          )}
        </div>

        <div className="flex gap-1 flex-shrink-0">
          <ActionButtons
            isEditing={isEditing}
            canDelete={canDelete}
            line={line}
            onEditStart={onEditStart}
            onDeleteConfirm={onDeleteConfirm}
            onEditCancel={onEditCancel}
            onEditSave={onEditSave}
          />
        </div>
      </div>
    </div>
  )
}

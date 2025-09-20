"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, Edit, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Tag {
  id: string
  name: string
  color: string
  count: number
  subtags?: Tag[]
}

interface TagManagementProps {
  className?: string
}

export function TagManagement({ className }: TagManagementProps) {
  const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set())

  // サンプルデータ（画像の内容に基づく）
  const [tags] = useState<Tag[]>([
    {
      id: "goal",
      name: "0_目的管理",
      color: "#e5e7eb",
      count: 0,
      subtags: [
        { id: "task-planning", name: "タスクプランニング", color: "#e5e7eb", count: 16 },
        { id: "task-app", name: "タスク管理アプリ", color: "#e5e7eb", count: 95 },
        { id: "decision-app", name: "意思決定アプリ", color: "#e5e7eb", count: 5 }
      ]
    },
    {
      id: "salary-work",
      name: "1_サラリーワーク",
      color: "#dcfce7",
      count: 2,
      subtags: [
        {
          id: "jai",
          name: "JAI",
          color: "#e5e7eb",
          count: 4,
          subtags: [
            { id: "patent-data", name: "特許データ作成", color: "#e5e7eb", count: 30 },
            { id: "pk-dtn", name: "PK_DTN", color: "#e5e7eb", count: 206 }
          ]
        }
      ]
    },
    {
      id: "personal",
      name: "1_個人知見",
      color: "#fef3c7",
      count: 0,
      subtags: [
        { id: "values", name: "価値観", color: "#e5e7eb", count: 31 },
        { id: "thoughts", name: "感想・ログ", color: "#dbeafe", count: 5 }
      ]
    },
    {
      id: "investment",
      name: "投資",
      color: "#e5e7eb",
      count: 0,
      subtags: [
        { id: "trade-ideas", name: "トレードアイデア", color: "#e5e7eb", count: 36 }
      ]
    },
    {
      id: "life",
      name: "2_生活",
      color: "#e5e7eb",
      count: 1
    }
  ])

  const toggleExpanded = (tagId: string) => {
    const newExpanded = new Set(expandedTags)
    if (newExpanded.has(tagId)) {
      newExpanded.delete(tagId)
    } else {
      newExpanded.add(tagId)
    }
    setExpandedTags(newExpanded)
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
              {tag.count}
            </span>
            <div className="flex space-x-1">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <Edit className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600 hover:text-red-700">
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
      </div>

      {/* タグリスト */}
      <div className="divide-y divide-gray-200">
        {tags.map(tag => renderTag(tag))}
      </div>
    </div>
  )
}
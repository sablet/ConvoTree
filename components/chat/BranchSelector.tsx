import { Input } from "@/components/ui/input"
import { Search, Filter } from "lucide-react"
import type { Line, Tag } from "@/lib/types"
import type { MessageType } from "@/lib/constants"
import { MESSAGE_TYPE_TEXT, MESSAGE_TYPE_TASK, MESSAGE_TYPE_DOCUMENT, MESSAGE_TYPE_SESSION, TIMELINE_BRANCH_ID } from "@/lib/constants"
import { FILTER_ALL, FILTER_TEXT, FILTER_TASK, FILTER_DOCUMENT, FILTER_SESSION } from "@/lib/ui-strings"

import type { Message } from "@/lib/types"

interface Timeline {
  messages: Message[]
  transitions: Array<{ index: number; lineId: string; lineName: string }>
}

interface BranchSelectorProps {
  completeTimeline: Timeline
  currentLine: Line | null
  filterMessageType: MessageType | 'all'
  filterTaskCompleted: 'all' | 'completed' | 'incomplete'
  filterDateStart: string // eslint-disable-line @typescript-eslint/no-unused-vars
  filterDateEnd: string // eslint-disable-line @typescript-eslint/no-unused-vars
  filterTag: string
  searchKeyword: string
  tags: Record<string, Tag> // eslint-disable-line @typescript-eslint/no-unused-vars
  lines: Record<string, Line>
  getLineAncestry: (lineId: string) => string[]
  onSwitchLine: (lineId: string) => void
  onFilterTypeChange: (type: MessageType | 'all') => void
  onFilterTaskCompletedChange: (status: 'all' | 'completed' | 'incomplete') => void
  onFilterDateStartChange: (date: string) => void // eslint-disable-line @typescript-eslint/no-unused-vars
  onFilterDateEndChange: (date: string) => void // eslint-disable-line @typescript-eslint/no-unused-vars
  onFilterTagChange: (tag: string) => void
  onSearchChange: (keyword: string) => void
}

/**
 * BranchSelector Component
 *
 * Displays breadcrumb navigation and filter controls
 */
export function BranchSelector({
  completeTimeline,
  currentLine,
  filterMessageType,
  filterTaskCompleted,
  filterDateStart: _filterDateStart,
  filterDateEnd: _filterDateEnd,
  filterTag,
  searchKeyword,
  tags: _tags,
  lines,
  getLineAncestry,
  onSwitchLine,
  onFilterTypeChange,
  onFilterTaskCompletedChange,
  onFilterDateStartChange: _onFilterDateStartChange,
  onFilterDateEndChange: _onFilterDateEndChange,
  onFilterTagChange,
  onSearchChange
}: BranchSelectorProps) {
  if (!completeTimeline.messages.length) return null

  const currentLineId = currentLine?.id || ''

  // 現在のラインの祖先チェーンを取得
  const ancestry = getLineAncestry(currentLineId)
  const breadcrumbPath = [...ancestry, currentLineId]

  return (
    <div className="px-2 sm:px-4 py-2 border-b border-gray-200 bg-white">
      <div className="flex items-center justify-between gap-3 overflow-x-auto">
        {/* パンくずリスト */}
        <div className="flex items-center gap-1 flex-shrink-0" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {breadcrumbPath.map((lineId, index) => {
            // タイムライン仮想ブランチの特別処理
            if (lineId === TIMELINE_BRANCH_ID) {
              return (
                <div key={`breadcrumb-${lineId}-${index}`} className="flex items-center gap-1 flex-shrink-0">
                  <button
                    className="px-2 py-1 rounded-md text-xs font-medium transition-all duration-200 whitespace-nowrap bg-blue-500 text-white shadow-sm"
                    onClick={() => onSwitchLine(lineId)}
                  >
                    全メッセージ
                  </button>
                </div>
              )
            }

            const line = lines[lineId]
            if (!line) return null

            const isCurrentLine = lineId === currentLineId
            const isLast = index === breadcrumbPath.length - 1

            return (
              <div key={`breadcrumb-${lineId}-${index}`} className="flex items-center gap-1 flex-shrink-0">
                <button
                  className={`px-2 py-1 rounded-md text-xs font-medium transition-all duration-200 whitespace-nowrap ${
                    isCurrentLine
                      ? 'bg-blue-500 text-white shadow-sm'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-700 hover:text-gray-900'
                  }`}
                  onClick={() => onSwitchLine(lineId)}
                >
                  {line.name}
                </button>
                {!isLast && (
                  <div className="text-gray-400 text-xs font-medium px-1">
                    &gt;
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* 検索・フィルター */}
        <div className="flex items-center gap-2 flex-shrink-0 mr-16 sm:mr-20">
          {/* 検索キーワード */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-gray-400" />
            <Input
              type="text"
              placeholder="検索..."
              value={searchKeyword}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-7 text-xs h-7 w-32"
            />
          </div>

          {/* タイプフィルター (タスクは階層化) */}
          <select
            value={filterMessageType === MESSAGE_TYPE_TASK ? `${MESSAGE_TYPE_TASK}-${filterTaskCompleted}` : filterMessageType}
            onChange={(e) => {
              const value = e.target.value
              if (value.startsWith('task-')) {
                const status = value.split('-')[1] as 'all' | 'completed' | 'incomplete'
                onFilterTypeChange(MESSAGE_TYPE_TASK)
                onFilterTaskCompletedChange(status)
              } else {
                onFilterTypeChange(value as MessageType | 'all')
                onFilterTaskCompletedChange('all')
              }
            }}
            className="text-xs border border-gray-200 rounded px-2 h-7 bg-white"
          >
            <option value="all">{FILTER_ALL}</option>
            <option value={MESSAGE_TYPE_TEXT}>{FILTER_TEXT}</option>
            <optgroup label={FILTER_TASK}>
              <option value="task-all">全てのタスク</option>
              <option value="task-incomplete">未完了タスク</option>
              <option value="task-completed">完了タスク</option>
            </optgroup>
            <option value={MESSAGE_TYPE_DOCUMENT}>{FILTER_DOCUMENT}</option>
            <option value={MESSAGE_TYPE_SESSION}>{FILTER_SESSION}</option>
          </select>

          {/* タグフィルター */}
          <div className="relative">
            <Filter className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-gray-400" />
            <Input
              type="text"
              placeholder="タグ..."
              value={filterTag}
              onChange={(e) => onFilterTagChange(e.target.value)}
              className="pl-7 text-xs h-7 w-24"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

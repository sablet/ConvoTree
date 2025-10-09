import { Filter, X, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useState, useRef, useEffect } from "react"
import type { TaskPriority } from "@/lib/types/task"

interface TaskFiltersProps {
  searchText: string
  onSearchChange: (value: string) => void
  completedFilter: 'all' | 'completed' | 'incomplete'
  onCompletedFilterChange: (value: 'all' | 'completed' | 'incomplete') => void
  priorityFilter: TaskPriority[]
  onPriorityToggle: (priority: TaskPriority) => void
  lineFilter: string[]
  onLineToggle: (lineName: string) => void
  uniquePriorities: TaskPriority[]
  uniqueLines: string[]
  totalTasks: number
  completedTasks: number
  incompleteTasks: number
  filteredCount: number
  hasActiveFilters: boolean
  onClearFilters: () => void
  priorityLabels: Record<TaskPriority, string>
  taskCounts: {
    byPriority: Record<TaskPriority, number>
    byLine: Record<string, number>
  }
}

function MultiSelectDropdown({
  label,
  options,
  selected,
  onToggle,
  getCounts
}: {
  label: string
  options: string[]
  selected: string[]
  onToggle: (value: string) => void
  getCounts: (value: string) => number
}) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 bg-white"
      >
        <span className="text-gray-600">
          {label}: {selected.length === 0 ? '全て' : `${selected.length}件`}
        </span>
        <ChevronDown className={`h-3 w-3 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-10 mt-1 w-48 bg-white border border-gray-300 rounded shadow-lg max-h-64 overflow-y-auto">
          {options.map((option) => (
            <label
              key={option}
              className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selected.includes(option)}
                onChange={() => onToggle(option)}
                className="h-3 w-3 text-blue-600 rounded border-gray-300"
              />
              <span className="flex-1 text-xs text-gray-700">{option}</span>
              <span className="text-xs text-gray-500">({getCounts(option)})</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

export function TaskFilters({
  searchText,
  onSearchChange,
  completedFilter,
  onCompletedFilterChange,
  priorityFilter,
  onPriorityToggle,
  lineFilter,
  onLineToggle,
  uniquePriorities,
  uniqueLines,
  totalTasks,
  completedTasks,
  incompleteTasks,
  filteredCount,
  hasActiveFilters,
  onClearFilters,
  priorityLabels,
  taskCounts
}: TaskFiltersProps) {
  return (
    <div className="px-2 sm:px-4 py-2 border-b border-gray-200 bg-white">
      <div className="flex items-center justify-between gap-2 overflow-x-auto">
        {/* フィルタグループ */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Filter className="h-3 w-3 text-gray-600" />

          {/* 検索フィールド */}
          <Input
            type="text"
            placeholder="検索..."
            value={searchText}
            onChange={(e) => onSearchChange(e.target.value)}
            className="text-xs h-7 w-32"
          />

          {/* 完了状態ドロップダウン */}
          <div className="relative">
            <button
              onClick={() => {}}
              className="flex items-center gap-1 px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 bg-white"
            >
              <span className="text-gray-600">
                {completedFilter === 'all' ? `全て (${totalTasks})` :
                 completedFilter === 'incomplete' ? `未完了 (${incompleteTasks})` :
                 `完了 (${completedTasks})`}
              </span>
              <ChevronDown className="h-3 w-3 text-gray-500" />
            </button>
            <select
              value={completedFilter}
              onChange={(e) => onCompletedFilterChange(e.target.value as 'all' | 'completed' | 'incomplete')}
              className="absolute inset-0 w-full opacity-0 cursor-pointer"
            >
              <option value="all">全て ({totalTasks})</option>
              <option value="incomplete">未完了 ({incompleteTasks})</option>
              <option value="completed">完了済み ({completedTasks})</option>
            </select>
          </div>

          {/* 優先度ドロップダウン */}
          {uniquePriorities.length > 0 && (
            <MultiSelectDropdown
              label="優先度"
              options={uniquePriorities.map(p => priorityLabels[p])}
              selected={priorityFilter.map(p => priorityLabels[p])}
              onToggle={(label) => {
                const entry = (Object.entries(priorityLabels) as [TaskPriority, string][]).find(([, l]) => l === label)
                if (entry) onPriorityToggle(entry[0])
              }}
              getCounts={(label) => {
                const entry = (Object.entries(priorityLabels) as [TaskPriority, string][]).find(([, l]) => l === label)
                return entry ? taskCounts.byPriority[entry[0]] : 0
              }}
            />
          )}

          {/* ラインドロップダウン */}
          {uniqueLines.length > 0 && (
            <MultiSelectDropdown
              label="ライン"
              options={uniqueLines}
              selected={lineFilter}
              onToggle={onLineToggle}
              getCounts={(lineName) => taskCounts.byLine[lineName] || 0}
            />
          )}
        </div>

        {/* 件数表示とクリアボタン */}
        <div className="flex items-center gap-2 flex-shrink-0 mr-16 sm:mr-20">
          {/* 件数表示 */}
          <span className="text-xs text-gray-600 whitespace-nowrap">
            {filteredCount}/{totalTasks}件
          </span>

          {/* フィルタクリアボタン */}
          {hasActiveFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={onClearFilters}
              className="h-7 px-2 text-xs"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

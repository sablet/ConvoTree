import { Filter, X, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useState, useRef, useEffect } from "react"

interface TaskFiltersProps {
  searchText: string
  onSearchChange: (value: string) => void
  completedFilter: 'all' | 'completed' | 'incomplete'
  onCompletedFilterChange: (value: 'all' | 'completed' | 'incomplete') => void
  priorityFilter: string[]
  onPriorityToggle: (priority: string) => void
  lineFilter: string[]
  onLineToggle: (lineName: string) => void
  uniquePriorities: string[]
  uniqueLines: string[]
  totalTasks: number
  completedTasks: number
  incompleteTasks: number
  filteredCount: number
  hasActiveFilters: boolean
  onClearFilters: () => void
  priorityLabels: Record<string, string>
  taskCounts: {
    byPriority: Record<string, number>
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
        className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 bg-white"
      >
        <span className="font-medium text-gray-700">{label}:</span>
        <span className="text-gray-600">
          {selected.length === 0 ? '全て' : `${selected.length}件選択中`}
        </span>
        <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-10 mt-1 w-64 bg-white border border-gray-300 rounded-md shadow-lg max-h-64 overflow-y-auto">
          {options.map((option) => (
            <label
              key={option}
              className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selected.includes(option)}
                onChange={() => onToggle(option)}
                className="h-4 w-4 text-blue-600 rounded border-gray-300"
              />
              <span className="flex-1 text-sm text-gray-700">{option}</span>
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
    <div className="p-6 border-b border-gray-200 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">タスク一覧</h1>
        {hasActiveFilters && (
          <Button
            variant="outline"
            size="sm"
            onClick={onClearFilters}
            className="flex items-center gap-1"
          >
            <X className="h-3 w-3" />
            フィルタをクリア
          </Button>
        )}
      </div>

      {/* 検索 */}
      <div>
        <Input
          type="text"
          placeholder="タスク内容を検索..."
          value={searchText}
          onChange={(e) => onSearchChange(e.target.value)}
          className="max-w-md"
        />
      </div>

      {/* フィルタセクション */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-600" />
          <span className="text-sm font-medium text-gray-700">フィルタ:</span>
        </div>

        {/* 完了状態ドロップダウン */}
        <div className="relative">
          <button
            onClick={() => {}}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 bg-white"
          >
            <span className="font-medium text-gray-700">完了状態:</span>
            <span className="text-gray-600">
              {completedFilter === 'all' ? `全て (${totalTasks})` :
               completedFilter === 'incomplete' ? `未完了 (${incompleteTasks})` :
               `完了済み (${completedTasks})`}
            </span>
            <ChevronDown className="h-4 w-4 text-gray-500" />
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
              const priority = Object.entries(priorityLabels).find(([, l]) => l === label)?.[0]
              if (priority) onPriorityToggle(priority)
            }}
            getCounts={(label) => {
              const priority = Object.entries(priorityLabels).find(([, l]) => l === label)?.[0]
              return priority ? (taskCounts.byPriority[priority] || 0) : 0
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

      <div className="text-sm text-gray-600">
        {filteredCount} 件のタスクを表示中 (全 {totalTasks} 件)
      </div>
    </div>
  )
}

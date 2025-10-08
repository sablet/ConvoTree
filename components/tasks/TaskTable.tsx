import { ArrowUpDown, Edit2, Check, X } from "lucide-react"
import type { TaskRow as TaskRowType, SortKey, TaskPriority } from "@/lib/types/task"
import { formatDateTime } from "@/lib/format-utils"
import { useState, useEffect } from "react"

interface TaskTableProps {
  tasks: TaskRowType[]
  sortKey: SortKey
  sortDirection: 'asc' | 'desc'
  onSort: (key: SortKey) => void
  onToggleComplete: (task: TaskRowType) => void
  onUpdateTask: (taskId: string, updates: { content?: string; priority?: TaskPriority; lineName?: string }) => Promise<void>
  priorityLabels: Record<TaskPriority, string>
  priorityOptions: TaskPriority[]
  allLines: string[]
}

const SortButton = ({ column, label, sortKey, onClick }: {
  column: SortKey
  label: string
  sortKey: SortKey
  onClick: (key: SortKey) => void
}) => (
  <button
    onClick={() => onClick(column)}
    className="flex items-center gap-1 hover:text-blue-600 transition-colors"
  >
    {label}
    <ArrowUpDown className={`h-3 w-3 ${sortKey === column ? 'text-blue-600' : 'text-gray-400'}`} />
  </button>
)

const TableHeaderCell = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <th className={`px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider ${className}`.trim()}>
    {children}
  </th>
)

const getPriorityBadgeClass = (priority: TaskPriority) => {
  switch (priority) {
    case 'urgent': return 'bg-red-100 text-red-800'
    case 'high': return 'bg-orange-100 text-orange-800'
    case 'medium': return 'bg-yellow-100 text-yellow-800'
    default: return 'bg-green-100 text-green-800'
  }
}

const TIMESTAMP_FIELDS = ['createdAt', 'updatedAt', 'completedAt'] as const

const SORTABLE_COLUMNS: Array<{ key: SortKey; label: string; className?: string }> = [
  { key: 'completed', label: '完了' },
  { key: 'priority', label: '優先度' },
  { key: 'content', label: 'タスク内容', className: 'min-w-[300px]' },
  { key: 'lineName', label: 'ライン' },
  { key: 'createdAt', label: '作成日時' },
  { key: 'updatedAt', label: '更新日時' },
  { key: 'completedAt', label: '完了日時' }
]

function TaskTableRow({
  task,
  onToggleComplete,
  onUpdateTask,
  priorityLabels,
  priorityOptions,
  allLines
}: {
  task: TaskRowType
  onToggleComplete: (task: TaskRowType) => void
  onUpdateTask: (taskId: string, updates: { content?: string; priority?: TaskPriority; lineName?: string }) => Promise<void>
  priorityLabels: Record<TaskPriority, string>
  priorityOptions: TaskPriority[]
  allLines: string[]
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(task.content)
  const [editPriority, setEditPriority] = useState<TaskPriority>(task.priority)
  const [editLineName, setEditLineName] = useState(task.lineName)

  useEffect(() => {
    if (!isEditing) {
      setEditContent(task.content)
      setEditPriority(task.priority)
      setEditLineName(task.lineName)
    }
  }, [task.content, task.priority, task.lineName, isEditing])

  const handleSave = async () => {
    await onUpdateTask(task.id, {
      content: editContent,
      priority: editPriority,
      lineName: editLineName
    })
    setIsEditing(false)
  }

  const handleCancel = () => {
    setEditContent(task.content)
    setEditPriority(task.priority)
    setEditLineName(task.lineName)
    setIsEditing(false)
  }

  const priorityElement = isEditing ? (
    <select
      value={editPriority}
      onChange={(e) => setEditPriority(e.target.value as TaskPriority)}
      className="text-xs border border-gray-300 rounded px-2 py-1"
    >
      {priorityOptions.map(p => (
        <option key={p} value={p}>{priorityLabels[p]}</option>
      ))}
    </select>
  ) : (
    <span className={`px-2 py-1 text-xs font-medium rounded ${getPriorityBadgeClass(task.priority)}`}>
      {priorityLabels[task.priority]}
    </span>
  )

  const contentElement = isEditing ? (
    <input
      type="text"
      value={editContent}
      onChange={(e) => setEditContent(e.target.value)}
      className="w-full text-sm border border-gray-300 rounded px-2 py-1"
    />
  ) : (
    <div className={`text-sm ${task.completed ? 'line-through text-gray-500' : 'text-gray-900'}`}>{task.content}</div>
  )

  const lineElement = isEditing ? (
    <select
      value={editLineName}
      onChange={(e) => setEditLineName(e.target.value)}
      className="text-sm border border-gray-300 rounded px-2 py-1 max-w-[200px]"
    >
      {allLines.map(line => (
        <option key={line} value={line}>{line}</option>
      ))}
    </select>
  ) : (
    <span className="text-sm text-gray-600">{task.lineName}</span>
  )

  const actionsElement = isEditing ? (
    <div className="flex gap-1">
      <button onClick={handleSave} className="p-1 hover:bg-green-100 rounded text-green-600" aria-label="タスクを保存">
        <Check className="h-4 w-4" />
      </button>
      <button onClick={handleCancel} className="p-1 hover:bg-red-100 rounded text-red-600" aria-label="編集をキャンセル">
        <X className="h-4 w-4" />
      </button>
    </div>
  ) : (
    <button
      onClick={() => setIsEditing(true)}
      className="p-1 hover:bg-blue-100 rounded text-blue-600 transition-colors"
      aria-label="タスクを編集"
    >
      <Edit2 className="h-4 w-4" />
    </button>
  )

  const rowClassName = isEditing ? 'bg-blue-50 transition-colors' : 'hover:bg-gray-50 transition-colors'

  return (
    <tr className={rowClassName}>
      <td className="px-4 py-3 whitespace-nowrap">
        <input type="checkbox" checked={task.completed} onChange={() => onToggleComplete(task)} className="h-4 w-4 text-blue-600 rounded border-gray-300 cursor-pointer" />
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        {priorityElement}
      </td>
      <td className="px-4 py-3">
        {contentElement}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
        {lineElement}
      </td>
      {TIMESTAMP_FIELDS.map((field) => (
        <td key={field} className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
          {formatDateTime(task[field])}
        </td>
      ))}
      <td className="px-4 py-3 whitespace-nowrap">
        {actionsElement}
      </td>
    </tr>
  )
}

export function TaskTable({
  tasks,
  sortKey,
  onSort,
  onToggleComplete,
  onUpdateTask,
  priorityLabels,
  priorityOptions,
  allLines
}: TaskTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            {SORTABLE_COLUMNS.map(({ key, label, className }) => (
              <TableHeaderCell key={key} className={className}>
                <SortButton column={key} label={label} sortKey={sortKey} onClick={onSort} />
              </TableHeaderCell>
            ))}
            <TableHeaderCell>操作</TableHeaderCell>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {tasks.map((task) => (
            <TaskTableRow
              key={task.id}
              task={task}
              onToggleComplete={onToggleComplete}
              onUpdateTask={onUpdateTask}
              priorityLabels={priorityLabels}
              priorityOptions={priorityOptions}
              allLines={allLines}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

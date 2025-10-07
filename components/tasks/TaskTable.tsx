import { ArrowUpDown } from "lucide-react"
import { TaskRow, SortKey } from "@/lib/types/task"
import { formatDateTime } from "@/lib/format-utils"

interface TaskTableProps {
  tasks: TaskRow[]
  sortKey: SortKey
  sortDirection: 'asc' | 'desc'
  onSort: (key: SortKey) => void
  onToggleComplete: (task: TaskRow) => void
  priorityLabels: Record<string, string>
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

const TableHeaderCell = ({ children }: { children: React.ReactNode }) => (
  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
    {children}
  </th>
)

const getPriorityBadgeClass = (priority: string) => {
  switch (priority) {
    case 'urgent': return 'bg-red-100 text-red-800'
    case 'high': return 'bg-orange-100 text-orange-800'
    case 'medium': return 'bg-yellow-100 text-yellow-800'
    default: return 'bg-green-100 text-green-800'
  }
}

export function TaskTable({
  tasks,
  sortKey,
  onSort,
  onToggleComplete,
  priorityLabels
}: TaskTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <TableHeaderCell><SortButton column="completed" label="完了" sortKey={sortKey} onClick={onSort} /></TableHeaderCell>
            <TableHeaderCell><SortButton column="priority" label="優先度" sortKey={sortKey} onClick={onSort} /></TableHeaderCell>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider min-w-[300px]">
              <SortButton column="content" label="タスク内容" sortKey={sortKey} onClick={onSort} />
            </th>
            <TableHeaderCell><SortButton column="lineName" label="ライン" sortKey={sortKey} onClick={onSort} /></TableHeaderCell>
            <TableHeaderCell><SortButton column="createdAt" label="作成日時" sortKey={sortKey} onClick={onSort} /></TableHeaderCell>
            <TableHeaderCell><SortButton column="updatedAt" label="更新日時" sortKey={sortKey} onClick={onSort} /></TableHeaderCell>
            <TableHeaderCell><SortButton column="completedAt" label="完了日時" sortKey={sortKey} onClick={onSort} /></TableHeaderCell>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {tasks.map((task) => (
            <tr key={task.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3 whitespace-nowrap">
                <input type="checkbox" checked={task.completed} onChange={() => onToggleComplete(task)} className="h-4 w-4 text-blue-600 rounded border-gray-300 cursor-pointer" />
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                <span className={`px-2 py-1 text-xs font-medium rounded ${getPriorityBadgeClass(task.priority)}`}>
                  {priorityLabels[task.priority]}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className={`text-sm ${task.completed ? 'line-through text-gray-500' : 'text-gray-900'}`}>{task.content}</div>
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{task.lineName}</td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{formatDateTime(task.createdAt)}</td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{formatDateTime(task.updatedAt)}</td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{formatDateTime(task.completedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

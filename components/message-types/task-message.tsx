"use client"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Check, CheckSquare } from "lucide-react"

interface TaskMessageData {
  priority: 'low' | 'medium' | 'high' | 'urgent'
  completed: boolean
  tags?: string[]
  completedAt?: string
}

interface TaskMessageProps {
  messageId: string
  content: string
  data: TaskMessageData
  onUpdate?: (data: TaskMessageData) => void
  isEditable?: boolean
}

const priorityColors = {
  low: 'bg-green-100 text-green-800 border-green-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  urgent: 'bg-red-100 text-red-800 border-red-200'
}

const priorityIcons = {
  low: '🟢',
  medium: '🟡',
  high: '🟠',
  urgent: '🔴'
}

export function TaskMessage({
  content,
  data,
  onUpdate
}: TaskMessageProps) {
  // dataを直接使用（メモ化を削除）
  const taskData = useMemo(() => data || {
    priority: 'medium' as const,
    completed: false,
    tags: [],
    completedAt: undefined
  }, [data]);

  const [isEditing, setIsEditing] = useState(false)
  const [editData, setEditData] = useState<TaskMessageData>(taskData)

  // propsの変更を監視してローカル状態を更新
  useEffect(() => {
    setEditData(taskData);
  }, [taskData])

  const handleSave = () => {
    if (onUpdate) {
      onUpdate(editData)
    }
    setIsEditing(false)
  }

  const handleCancel = () => {
    setEditData(taskData)
    setIsEditing(false)
  }

  const handleToggleComplete = () => {
    const newData: TaskMessageData = {
      ...taskData,
      completed: !taskData.completed,
      completedAt: taskData.completed ? undefined : new Date().toISOString()
    }
    if (onUpdate) {
      onUpdate(newData)
    }
  }


  if (isEditing) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-blue-800">
          <CheckSquare className="h-4 w-4" />
          タスク編集
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-600 block mb-1">優先度</label>
            <select
              value={editData.priority}
              onChange={(e) => setEditData(prev => ({
                ...prev,
                priority: e.target.value as TaskMessageData['priority']
              }))}
              className="w-full text-sm border border-gray-300 rounded px-2 py-1"
            >
              <option value="low">低</option>
              <option value="medium">中</option>
              <option value="high">高</option>
              <option value="urgent">緊急</option>
            </select>
          </div>


          <div className="flex gap-2 justify-end">
            <Button
              onClick={handleCancel}
              variant="outline"
              size="sm"
              className="text-xs"
            >
              キャンセル
            </Button>
            <Button
              onClick={handleSave}
              size="sm"
              className="text-xs bg-blue-500 hover:bg-blue-600"
            >
              保存
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`border rounded-lg p-4 transition-all ${
      taskData.completed
        ? 'bg-green-50 border-green-200'
        : 'bg-gray-50 border-gray-200'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-3">
          {/* タスクヘッダー */}
          <div className="flex items-center gap-2 w-full">
            <button
              type="button"
              onClick={handleToggleComplete}
              className={`flex items-center gap-2 flex-1 text-left rounded-md px-2 py-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400 ${
                taskData.completed ? 'bg-green-100/70' : 'hover:bg-gray-100'
              }`}
            >
              <span
                className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                  taskData.completed
                    ? 'bg-green-500 border-green-500 text-white'
                    : 'border-gray-300'
                }`}
              >
                {taskData.completed && <Check className="h-3 w-3" />}
              </span>
              <div className="flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-gray-600" />
                <span className={`text-sm font-medium break-words overflow-wrap-anywhere ${
                  taskData.completed ? 'line-through text-gray-500' : 'text-gray-900'
                }`}>
                  {content}
                </span>
              </div>
            </button>

            <Badge className={`text-xs ${priorityColors[taskData.priority || 'medium']}`}>
              {priorityIcons[taskData.priority || 'medium']} {(taskData.priority || 'medium').toUpperCase()}
            </Badge>
          </div>


          {/* タスク詳細 */}
          <div className="space-y-2">

            {taskData.completed && (
              <TaskCompletionStatus completedAt={taskData.completedAt} />
            )}
          </div>
        </div>

      </div>
    </div>
  )
}

const COMPLETION_TIME_FORMAT = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
})

interface TaskCompletionStatusProps {
  completedAt?: string
}

function TaskCompletionStatus({ completedAt }: TaskCompletionStatusProps) {
  const completedAtDate = completedAt ? new Date(completedAt) : null
  const isValidDate = completedAtDate && !Number.isNaN(completedAtDate.getTime())
  const completedLabel = isValidDate ? COMPLETION_TIME_FORMAT.format(completedAtDate) : null

  return (
    <div className="flex items-center gap-2 text-xs text-green-600">
      <Check className="h-3 w-3" />
      <span>{completedLabel ? `完了: ${completedLabel}` : '完了済み'}</span>
    </div>
  )
}

"use client"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Check, CheckSquare, Clock } from "lucide-react"
import { LinkifiedText } from "@/lib/utils/linkify"

interface TaskMessageData {
  priority: 'low' | 'medium' | 'high' | 'urgent'
  completed: boolean
  tags?: string[]
  completedAt?: string
  createdAt?: string
}

interface TaskMessageProps {
  messageId: string
  content: string
  data: TaskMessageData
  onUpdate?: (data: TaskMessageData) => void
  isEditable?: boolean
  fallbackCreatedAt?: Date
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
  onUpdate,
  fallbackCreatedAt
}: TaskMessageProps) {
  // dataを直接使用（メモ化を削除）
  const taskData = useMemo(() => data || {
    priority: 'medium' as const,
    completed: false,
    tags: [],
    completedAt: undefined,
    createdAt: undefined
  }, [data]);

  const [isEditing, setIsEditing] = useState(false)
  const [editData, setEditData] = useState<TaskMessageData>(taskData)
  const creationTimestamp = taskData.createdAt ?? (fallbackCreatedAt ? fallbackCreatedAt.toISOString() : undefined)
  const createdLabel = formatStatusLabel(creationTimestamp)
  const completedLabel = taskData.completed ? formatStatusLabel(taskData.completedAt) : null

  // propsの変更を監視してローカル状態を更新
  useEffect(() => {
    setEditData(taskData);
  }, [taskData])

  const handleSave = () => {
    onUpdate?.(editData)
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
    onUpdate?.(newData)
  }


  const handlePriorityChange = (priority: TaskMessageData['priority']) => {
    setEditData(prev => ({
      ...prev,
      priority
    }))
  }

  if (isEditing) {
    return (
      <TaskEditingView
        editData={editData}
        onPriorityChange={handlePriorityChange}
        onCancel={handleCancel}
        onSave={handleSave}
      />
    )
  }

  return (
    <TaskDisplayView
      content={content}
      taskData={taskData}
      createdLabel={createdLabel}
      completedLabel={completedLabel}
      onToggleComplete={handleToggleComplete}
    />
  )
}

interface TaskEditingViewProps {
  editData: TaskMessageData
  onPriorityChange: (priority: TaskMessageData['priority']) => void
  onCancel: () => void
  onSave: () => void
}

function TaskEditingView({
  editData,
  onPriorityChange,
  onCancel,
  onSave
}: TaskEditingViewProps) {
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
            onChange={(e) => onPriorityChange(e.target.value as TaskMessageData['priority'])}
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
            onClick={onCancel}
            variant="outline"
            size="sm"
            className="text-xs"
          >
            キャンセル
          </Button>
          <Button
            onClick={onSave}
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

interface TaskDisplayViewProps {
  content: string
  taskData: TaskMessageData
  createdLabel: string | null
  completedLabel: string | null
  onToggleComplete: () => void
}

function TaskDisplayView({
  content,
  taskData,
  createdLabel,
  completedLabel,
  onToggleComplete
}: TaskDisplayViewProps) {
  const priority = taskData.priority || 'medium'
  const isCompleted = taskData.completed
  const containerClass = isCompleted ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
  const toggleClass = isCompleted ? 'bg-green-100/70' : 'hover:bg-gray-100'
  const checkboxClass = isCompleted ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300'
  const contentClass = isCompleted ? 'line-through text-gray-500' : 'text-gray-900'

  return (
    <div className={`border rounded-lg p-4 transition-all ${containerClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-3">
          {/* タスクヘッダー */}
          <div className="flex items-center gap-2 w-full">
            <button
              type="button"
              onClick={onToggleComplete}
              className={`flex items-center gap-2 flex-1 text-left rounded-md px-2 py-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400 ${toggleClass}`}
            >
              <span
                className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${checkboxClass}`}
              >
                {isCompleted && <Check className="h-3 w-3" />}
              </span>
              <div className="flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-gray-600" />
                <span className={`text-sm font-medium break-words overflow-wrap-anywhere ${contentClass}`}>
                  <LinkifiedText text={content} />
                </span>
              </div>
            </button>

            <Badge className={`text-xs ${priorityColors[priority]}`}>
              {priorityIcons[priority]} {priority.toUpperCase()}
            </Badge>
          </div>


          {/* タスク詳細 */}
          {(createdLabel || completedLabel) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              {createdLabel && (
                <span className="flex items-center gap-1 text-blue-600">
                  <Clock className="h-3 w-3" />
                  <span>作成: {createdLabel}</span>
                </span>
              )}
              {completedLabel && (
                <span className="flex items-center gap-1 text-green-600">
                  <Check className="h-3 w-3" />
                  <span>完了: {completedLabel}</span>
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const TASK_STATUS_TIME_FORMAT = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
})

function formatStatusLabel(timestamp?: string | null): string | null {
  if (!timestamp) {
    return null
  }
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return TASK_STATUS_TIME_FORMAT.format(date)
}

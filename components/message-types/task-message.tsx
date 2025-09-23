"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Calendar, Clock, Check, Edit3, CheckSquare } from "lucide-react"

interface TaskMessageData {
  priority: 'low' | 'medium' | 'high' | 'urgent'
  dueDate?: string
  completed: boolean
  estimatedHours?: number
  tags?: string[]
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
  onUpdate,
  isEditable = false
}: TaskMessageProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editData, setEditData] = useState<TaskMessageData>(data)

  const handleSave = () => {
    if (onUpdate) {
      onUpdate(editData)
    }
    setIsEditing(false)
  }

  const handleCancel = () => {
    setEditData(data)
    setIsEditing(false)
  }

  const handleToggleComplete = () => {
    const newData = { ...data, completed: !data.completed }
    if (onUpdate) {
      onUpdate(newData)
    }
  }

  const formatDueDate = (dateString?: string) => {
    if (!dateString) return null
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = date.getTime() - now.getTime()
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays < 0) {
      return { text: `${Math.abs(diffDays)}日遅延`, color: 'text-red-600', isOverdue: true }
    } else if (diffDays === 0) {
      return { text: '今日期限', color: 'text-orange-600', isOverdue: false }
    } else if (diffDays === 1) {
      return { text: '明日期限', color: 'text-yellow-600', isOverdue: false }
    } else {
      return { text: `${diffDays}日後`, color: 'text-gray-600', isOverdue: false }
    }
  }

  const dueDateInfo = formatDueDate(data.dueDate)

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

          <div>
            <label className="text-xs text-gray-600 block mb-1">期限日</label>
            <Input
              type="date"
              value={editData.dueDate || ''}
              onChange={(e) => setEditData(prev => ({
                ...prev,
                dueDate: e.target.value || undefined
              }))}
              className="text-sm"
            />
          </div>

          <div>
            <label className="text-xs text-gray-600 block mb-1">予想時間（時間）</label>
            <Input
              type="number"
              min="0"
              step="0.5"
              value={editData.estimatedHours || ''}
              onChange={(e) => setEditData(prev => ({
                ...prev,
                estimatedHours: e.target.value ? parseFloat(e.target.value) : undefined
              }))}
              placeholder="例: 2.5"
              className="text-sm"
            />
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
      data.completed
        ? 'bg-green-50 border-green-200'
        : 'bg-gray-50 border-gray-200'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-3">
          {/* タスクヘッダー */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleComplete}
              className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                data.completed
                  ? 'bg-green-500 border-green-500 text-white'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              {data.completed && <Check className="h-3 w-3" />}
            </button>

            <div className="flex items-center gap-2">
              <CheckSquare className="h-4 w-4 text-gray-600" />
              <span className="text-sm font-medium text-gray-900">タスク</span>
            </div>

            <Badge className={`text-xs ${priorityColors[data.priority]}`}>
              {priorityIcons[data.priority]} {data.priority.toUpperCase()}
            </Badge>
          </div>

          {/* タスク内容 */}
          <div className={`text-sm ${
            data.completed ? 'line-through text-gray-500' : 'text-gray-900'
          }`}>
            {content}
          </div>

          {/* タスク詳細 */}
          <div className="space-y-2">
            {data.dueDate && (
              <div className="flex items-center gap-2 text-xs">
                <Calendar className="h-3 w-3" />
                <span className={dueDateInfo?.color}>
                  期限: {new Date(data.dueDate).toLocaleDateString('ja-JP')}
                  {dueDateInfo && (
                    <span className="ml-1">({dueDateInfo.text})</span>
                  )}
                </span>
              </div>
            )}

            {data.estimatedHours && (
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <Clock className="h-3 w-3" />
                <span>予想時間: {data.estimatedHours}時間</span>
              </div>
            )}

            {data.completed && (
              <div className="flex items-center gap-2 text-xs text-green-600">
                <Check className="h-3 w-3" />
                <span>完了済み</span>
              </div>
            )}
          </div>
        </div>

        {/* アクションボタン */}
        {isEditable && (
          <Button
            onClick={() => setIsEditing(true)}
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-gray-400 hover:text-gray-600"
            title="編集"
          >
            <Edit3 className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  )
}
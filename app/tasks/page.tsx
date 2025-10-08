"use client"

import { useMemo, useState, useEffect } from "react"
import { HamburgerMenu } from "@/components/hamburger-menu"
import { TaskFilters } from "@/components/tasks/TaskFilters"
import { TaskTable } from "@/components/tasks/TaskTable"
import { useChatData } from "@/hooks/use-chat-data"
import { dataSourceManager } from "@/lib/data-source"
import { Message } from "@/lib/types"
import { TaskRow, SortKey, TaskPriority } from "@/lib/types/task"
import { MESSAGE_TYPE_TASK, TASK_PRIORITY_ORDER, TASK_PRIORITY_KEYS, TASK_PRIORITY_LABELS } from "@/lib/constants"
import { LOADING_GENERIC } from "@/lib/ui-strings"

type SortDirection = 'asc' | 'desc'

const DEFAULT_PRIORITY: TaskPriority = 'medium'

const isTaskPriority = (value: string | undefined): value is TaskPriority =>
  value !== undefined && (TASK_PRIORITY_KEYS as TaskPriority[]).includes(value as TaskPriority)

export default function TasksPage() {
  const [isLoading, setIsLoading] = useState(true)
  const { messages: originalMessages, lines, loadChatData } = useChatData({ setIsLoading })
  const [messages, setMessages] = useState<Record<string, Message>>(originalMessages)

  useEffect(() => {
    loadChatData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // originalMessagesが更新されたらローカル状態も更新
  useEffect(() => {
    setMessages(originalMessages)
  }, [originalMessages])

  const [sortKey, setSortKey] = useState<SortKey>('createdAt')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [completedFilter, setCompletedFilter] = useState<'all' | 'completed' | 'incomplete'>('all')
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority[]>([])
  const [lineFilter, setLineFilter] = useState<string[]>([])
  const [searchText, setSearchText] = useState('')

  const taskRows = useMemo<TaskRow[]>(() => {
    const tasks: TaskRow[] = []

    Object.values(messages).forEach((msg: Message) => {
      if (msg.type === MESSAGE_TYPE_TASK) {
        const taskData = msg.metadata as { priority?: string; completed?: boolean; completedAt?: string } | undefined
        const line = lines[msg.lineId]
        const metadataPriority = taskData?.priority
        const priority: TaskPriority = isTaskPriority(metadataPriority) ? metadataPriority : DEFAULT_PRIORITY

        tasks.push({
          id: msg.id,
          content: msg.content,
          completed: taskData?.completed ?? false,
          priority,
          lineName: line?.name ?? msg.lineId,
          createdAt: msg.timestamp,
          updatedAt: msg.updatedAt,
          completedAt: taskData?.completedAt ? new Date(taskData.completedAt) : undefined
        })
      }
    })

    return tasks
  }, [messages, lines])

  const uniquePriorities = useMemo<TaskPriority[]>(() => {
    const priorities = new Set<TaskPriority>()
    taskRows.forEach(task => priorities.add(task.priority))
    return Array.from(priorities).sort((a, b) => TASK_PRIORITY_ORDER[b] - TASK_PRIORITY_ORDER[a])
  }, [taskRows])

  const uniqueLines = useMemo(() => {
    const lineSet = new Set<string>()
    taskRows.forEach(task => lineSet.add(task.lineName))
    return Array.from(lineSet).sort((a, b) => a.localeCompare(b, 'ja'))
  }, [taskRows])

  const taskCounts = useMemo(() => {
    const byPriority = TASK_PRIORITY_KEYS.reduce((acc, key) => {
      acc[key] = 0
      return acc
    }, {} as Record<TaskPriority, number>)
    const byLine: Record<string, number> = {}

    taskRows.forEach(task => {
      byPriority[task.priority] += 1
      byLine[task.lineName] = (byLine[task.lineName] || 0) + 1
    })

    return { byPriority, byLine }
  }, [taskRows])

  const filteredTasks = useMemo(() => {
    let filtered = taskRows

    if (completedFilter === 'completed') {
      filtered = filtered.filter(task => task.completed)
    } else if (completedFilter === 'incomplete') {
      filtered = filtered.filter(task => !task.completed)
    }

    if (priorityFilter.length > 0) {
      filtered = filtered.filter(task => priorityFilter.includes(task.priority))
    }

    if (lineFilter.length > 0) {
      filtered = filtered.filter(task => lineFilter.includes(task.lineName))
    }

    if (searchText.trim()) {
      const searchLower = searchText.toLowerCase()
      filtered = filtered.filter(task => task.content.toLowerCase().includes(searchLower))
    }

    return filtered
  }, [taskRows, completedFilter, priorityFilter, lineFilter, searchText])

  const sortedTasks = useMemo(() => {
    const sorted = [...filteredTasks]

    sorted.sort((a, b) => {
      let compareValue = 0

      switch (sortKey) {
        case 'content':
          compareValue = a.content.localeCompare(b.content, 'ja')
          break
        case 'completed':
          compareValue = (a.completed ? 1 : 0) - (b.completed ? 1 : 0)
          break
        case 'priority':
          compareValue = TASK_PRIORITY_ORDER[a.priority] - TASK_PRIORITY_ORDER[b.priority]
          break
        case 'lineName':
          compareValue = a.lineName.localeCompare(b.lineName, 'ja')
          break
        case 'createdAt':
          compareValue = a.createdAt.getTime() - b.createdAt.getTime()
          break
        case 'updatedAt':
          compareValue = (a.updatedAt?.getTime() ?? 0) - (b.updatedAt?.getTime() ?? 0)
          break
        case 'completedAt':
          compareValue = (a.completedAt?.getTime() ?? 0) - (b.completedAt?.getTime() ?? 0)
          break
      }

      return sortDirection === 'asc' ? compareValue : -compareValue
    })

    return sorted
  }, [filteredTasks, sortKey, sortDirection])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDirection('asc')
    }
  }

  const handleToggleComplete = async (task: TaskRow) => {
    const message = messages[task.id]
    if (!message) return

    const taskData = message.metadata as { priority?: string; completed?: boolean; completedAt?: string } | undefined
    const newCompleted = !task.completed
    const newMetadata = {
      ...taskData,
      completed: newCompleted,
      completedAt: newCompleted ? new Date().toISOString() : undefined
    }

    // 楽観的更新: UIを即座に更新
    setMessages(prev => ({
      ...prev,
      [task.id]: {
        ...message,
        metadata: newMetadata,
        updatedAt: new Date()
      }
    }))

    // バックグラウンドでFirestoreを更新
    try {
      await dataSourceManager.updateMessage(task.id, {
        metadata: newMetadata,
        updatedAt: new Date()
      })
    } catch (error) {
      // エラー時は元に戻す
      console.error('Failed to update task:', error)
      setMessages(prev => ({
        ...prev,
        [task.id]: message
      }))
    }
  }

  const handleUpdateTask = async (taskId: string, updates: { content?: string; priority?: TaskPriority; lineName?: string }) => {
    const message = messages[taskId]
    if (!message) return

    const taskData = message.metadata as { priority?: string; completed?: boolean; completedAt?: string } | undefined

    // ライン名の変更がある場合、対応するlineIdを見つける
    let newLineId = message.lineId
    if (updates.lineName && updates.lineName !== lines[message.lineId]?.name) {
      const targetLine = Object.values(lines).find(l => l.name === updates.lineName)
      if (targetLine) {
        newLineId = targetLine.id
      }
    }

    const existingPriority = taskData?.priority
    const nextPriority: TaskPriority = updates.priority ?? (isTaskPriority(existingPriority) ? existingPriority : DEFAULT_PRIORITY)

    const newMetadata = {
      ...taskData,
      priority: nextPriority
    }

    // 楽観的更新
    setMessages(prev => ({
      ...prev,
      [taskId]: {
        ...message,
        content: updates.content || message.content,
        lineId: newLineId,
        metadata: newMetadata,
        updatedAt: new Date()
      }
    }))

    // バックグラウンドでFirestoreを更新
    try {
      await dataSourceManager.updateMessage(taskId, {
        content: updates.content,
        lineId: newLineId,
        metadata: newMetadata,
        updatedAt: new Date()
      })
    } catch (error) {
      console.error('Failed to update task:', error)
      setMessages(prev => ({
        ...prev,
        [taskId]: message
      }))
    }
  }

  const togglePriorityFilter = (priority: TaskPriority) => {
    setPriorityFilter(prev =>
      prev.includes(priority) ? prev.filter(p => p !== priority) : [...prev, priority]
    )
  }

  const toggleLineFilter = (lineName: string) => {
    setLineFilter(prev =>
      prev.includes(lineName) ? prev.filter(l => l !== lineName) : [...prev, lineName]
    )
  }

  const clearAllFilters = () => {
    setCompletedFilter('all')
    setPriorityFilter([])
    setLineFilter([])
    setSearchText('')
  }

  const hasActiveFilters = completedFilter !== 'all' || priorityFilter.length > 0 || lineFilter.length > 0 || searchText.trim() !== ''

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">{LOADING_GENERIC}</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <HamburgerMenu>
        <></>
      </HamburgerMenu>

      <div className="container mx-auto p-6">
        <div className="bg-white rounded-lg shadow-md">
          <TaskFilters
            searchText={searchText}
            onSearchChange={setSearchText}
            completedFilter={completedFilter}
            onCompletedFilterChange={setCompletedFilter}
            priorityFilter={priorityFilter}
            onPriorityToggle={togglePriorityFilter}
            lineFilter={lineFilter}
            onLineToggle={toggleLineFilter}
            uniquePriorities={uniquePriorities}
            uniqueLines={uniqueLines}
            totalTasks={taskRows.length}
            completedTasks={taskRows.filter(t => t.completed).length}
            incompleteTasks={taskRows.filter(t => !t.completed).length}
            filteredCount={filteredTasks.length}
            hasActiveFilters={hasActiveFilters}
            onClearFilters={clearAllFilters}
            priorityLabels={TASK_PRIORITY_LABELS}
            taskCounts={taskCounts}
          />

          <TaskTable
            tasks={sortedTasks}
            sortKey={sortKey}
            sortDirection={sortDirection}
            onSort={handleSort}
            onToggleComplete={handleToggleComplete}
            onUpdateTask={handleUpdateTask}
            priorityLabels={TASK_PRIORITY_LABELS}
            priorityOptions={TASK_PRIORITY_KEYS}
            allLines={uniqueLines}
          />

          {sortedTasks.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              タスクが見つかりません
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

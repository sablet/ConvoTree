"use client"

import { useMemo, useState, useEffect } from "react"
import { HamburgerMenu } from "@/components/hamburger-menu"
import { TaskFilters } from "@/components/tasks/TaskFilters"
import { TaskTable } from "@/components/tasks/TaskTable"
import { useChatData } from "@/hooks/use-chat-data"
import { dataSourceManager } from "@/lib/data-source"
import { Message } from "@/lib/types"
import { TaskRow, SortKey } from "@/lib/types/task"
import { MESSAGE_TYPE_TASK } from "@/lib/constants"
import { LOADING_GENERIC } from "@/lib/ui-strings"

type SortDirection = 'asc' | 'desc'

const priorityOrder = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1
}

const priorityLabels = {
  low: '低',
  medium: '中',
  high: '高',
  urgent: '緊急'
}

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
  const [priorityFilter, setPriorityFilter] = useState<string[]>([])
  const [lineFilter, setLineFilter] = useState<string[]>([])
  const [searchText, setSearchText] = useState('')

  const taskRows = useMemo<TaskRow[]>(() => {
    const tasks: TaskRow[] = []

    Object.values(messages).forEach((msg: Message) => {
      if (msg.type === MESSAGE_TYPE_TASK) {
        const taskData = msg.metadata as { priority?: string; completed?: boolean; completedAt?: string } | undefined
        const line = lines[msg.lineId]

        tasks.push({
          id: msg.id,
          content: msg.content,
          completed: taskData?.completed ?? false,
          priority: (taskData?.priority as 'low' | 'medium' | 'high' | 'urgent') ?? 'medium',
          lineName: line?.name ?? msg.lineId,
          createdAt: msg.timestamp,
          updatedAt: msg.updatedAt,
          completedAt: taskData?.completedAt ? new Date(taskData.completedAt) : undefined
        })
      }
    })

    return tasks
  }, [messages, lines])

  const uniquePriorities = useMemo(() => {
    const priorities = new Set<string>()
    taskRows.forEach(task => priorities.add(task.priority))
    return Array.from(priorities).sort((a, b) => priorityOrder[b as keyof typeof priorityOrder] - priorityOrder[a as keyof typeof priorityOrder])
  }, [taskRows])

  const uniqueLines = useMemo(() => {
    const lineSet = new Set<string>()
    taskRows.forEach(task => lineSet.add(task.lineName))
    return Array.from(lineSet).sort((a, b) => a.localeCompare(b, 'ja'))
  }, [taskRows])

  const taskCounts = useMemo(() => {
    const byPriority: Record<string, number> = {}
    const byLine: Record<string, number> = {}

    taskRows.forEach(task => {
      byPriority[task.priority] = (byPriority[task.priority] || 0) + 1
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
          compareValue = priorityOrder[a.priority] - priorityOrder[b.priority]
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

  const togglePriorityFilter = (priority: string) => {
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
            priorityLabels={priorityLabels}
            taskCounts={taskCounts}
          />

          <TaskTable
            tasks={sortedTasks}
            sortKey={sortKey}
            sortDirection={sortDirection}
            onSort={handleSort}
            onToggleComplete={handleToggleComplete}
            priorityLabels={priorityLabels}
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

"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Plus, AlertCircle, CheckSquare, FileText, Timer } from "lucide-react"
import { TaskExtension } from "./task-extension"
import { DocumentExtension, shouldCreateDocumentExtension, createDocumentExtensionData } from "./document-extension"
import { WorkSessionExtension } from "./work-session-extension"
import { dataSourceManager } from "@/lib/data-source"

// Re-export types from data-source.ts to ensure consistency
interface MessageExtension {
  id: string
  messageId: string
  type: string
  data: Record<string, unknown>
  createdAt?: unknown
  updatedAt?: unknown
}

interface TaskExtensionData {
  priority: 'low' | 'medium' | 'high' | 'urgent'
  dueDate?: string
  completed: boolean
  estimatedHours?: number
  tags?: string[]
}

interface DocumentExtensionData {
  isCollapsed: boolean
  summary?: string
  wordCount: number
  originalLength: number
}

interface WorkSessionExtensionData {
  checkedInAt?: string
  checkedOutAt?: string
  timeSpent?: number
  notes?: string
}

interface MessageExtensionsManagerProps {
  messageId: string
  messageContent: string
  isCurrentLine: boolean
}

export function MessageExtensionsManager({
  messageId,
  messageContent,
  isCurrentLine
}: MessageExtensionsManagerProps) {
  const [extensions, setExtensions] = useState<MessageExtension[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [editingExtensions, setEditingExtensions] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  // 拡張機能を読み込み
  useEffect(() => {
    loadExtensions()
  }, [messageId])

  // 長文の場合は自動的にドキュメント拡張を作成
  useEffect(() => {
    if (extensions.length === 0 && shouldCreateDocumentExtension(messageContent)) {
      handleCreateDocumentExtension()
    }
  }, [messageContent, extensions.length])

  const loadExtensions = async () => {
    try {
      setIsLoading(true)
      setError(null)

      if (dataSourceManager.getCurrentSource() === 'firestore') {
        const loadedExtensions = await dataSourceManager.getMessageExtensions(messageId)
        setExtensions(loadedExtensions)
      } else {
        // サンプルデータモードでは、ロードされたチャットデータから拡張機能を取得
        const chatData = await dataSourceManager.loadChatData()
        const messageExtensions = chatData.messageExtensions[messageId] || []
        setExtensions(messageExtensions)
      }
    } catch (error) {
      console.error('Failed to load extensions:', error)
      setError('拡張機能の読み込みに失敗しました')
      setExtensions([])
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateTaskExtension = async () => {
    try {
      const taskData: TaskExtensionData = {
        priority: 'medium',
        completed: false
      }

      if (dataSourceManager.getCurrentSource() === 'firestore') {
        const extensionId = await dataSourceManager.createMessageExtension(
          messageId,
          'task',
          taskData as unknown as Record<string, unknown>
        )

        const newExtension: MessageExtension = {
          id: extensionId,
          messageId,
          type: 'task',
          data: taskData as unknown as Record<string, unknown>
        }

        setExtensions(prev => [...prev, newExtension])
        setEditingExtensions(prev => new Set(prev).add(extensionId))
      } else {
        // サンプルデータモードではローカル状態のみで管理
        const extensionId = `task_${Date.now()}`
        const newExtension: MessageExtension = {
          id: extensionId,
          messageId,
          type: 'task',
          data: taskData as unknown as Record<string, unknown>
        }

        setExtensions(prev => [...prev, newExtension])
        setEditingExtensions(prev => new Set(prev).add(extensionId))
      }

      setShowAddMenu(false)
    } catch (error) {
      console.error('Failed to create task extension:', error)
      setError('タスク拡張の作成に失敗しました')
    }
  }

  const handleCreateDocumentExtension = async () => {
    try {
      const documentData = createDocumentExtensionData(messageContent)

      if (dataSourceManager.getCurrentSource() === 'firestore') {
        const extensionId = await dataSourceManager.createMessageExtension(
          messageId,
          'document',
          documentData as unknown as Record<string, unknown>
        )

        const newExtension: MessageExtension = {
          id: extensionId,
          messageId,
          type: 'document',
          data: documentData as unknown as Record<string, unknown>
        }

        setExtensions(prev => [...prev, newExtension])
      } else {
        // サンプルデータモードではローカル状態のみで管理
        const extensionId = `document_${Date.now()}`
        const newExtension: MessageExtension = {
          id: extensionId,
          messageId,
          type: 'document',
          data: documentData as unknown as Record<string, unknown>
        }

        setExtensions(prev => [...prev, newExtension])
      }

      setShowAddMenu(false)
    } catch (error) {
      console.error('Failed to create document extension:', error)
      setError('ドキュメント拡張の作成に失敗しました')
    }
  }

  const handleCreateWorkSessionExtension = async () => {
    try {
      const workSessionData: WorkSessionExtensionData = {
        checkedInAt: new Date().toISOString(),
        timeSpent: 0
      }

      if (dataSourceManager.getCurrentSource() === 'firestore') {
        const extensionId = await dataSourceManager.createMessageExtension(
          messageId,
          'workSession',
          workSessionData as unknown as Record<string, unknown>
        )

        const newExtension: MessageExtension = {
          id: extensionId,
          messageId,
          type: 'workSession',
          data: workSessionData as unknown as Record<string, unknown>
        }

        setExtensions(prev => [...prev, newExtension])
      } else {
        // サンプルデータモードではローカル状態のみで管理
        const extensionId = `workSession_${Date.now()}`
        const newExtension: MessageExtension = {
          id: extensionId,
          messageId,
          type: 'workSession',
          data: workSessionData as unknown as Record<string, unknown>
        }

        setExtensions(prev => [...prev, newExtension])
      }

      setShowAddMenu(false)
    } catch (error) {
      console.error('Failed to create work session extension:', error)
      setError('ワークセッション拡張の作成に失敗しました')
    }
  }

  const handleUpdateExtension = async (extensionId: string, newData: Record<string, unknown>) => {
    try {
      if (dataSourceManager.getCurrentSource() === 'firestore') {
        await dataSourceManager.updateMessageExtension(extensionId, { data: newData })
      }

      // ローカル状態も更新
      setExtensions(prev =>
        prev.map(ext =>
          ext.id === extensionId
            ? { ...ext, data: newData }
            : ext
        )
      )
    } catch (error) {
      console.error('Failed to update extension:', error)
      setError('拡張機能の更新に失敗しました')
    }
  }

  const handleDeleteExtension = async (extensionId: string) => {
    try {
      if (dataSourceManager.getCurrentSource() === 'firestore') {
        await dataSourceManager.deleteMessageExtension(extensionId)
      }

      // ローカル状態からも削除
      setExtensions(prev => prev.filter(ext => ext.id !== extensionId))
      setEditingExtensions(prev => {
        const newSet = new Set(prev)
        newSet.delete(extensionId)
        return newSet
      })
    } catch (error) {
      console.error('Failed to delete extension:', error)
      setError('拡張機能の削除に失敗しました')
    }
  }

  const toggleEditing = (extensionId: string) => {
    setEditingExtensions(prev => {
      const newSet = new Set(prev)
      if (newSet.has(extensionId)) {
        newSet.delete(extensionId)
      } else {
        newSet.add(extensionId)
      }
      return newSet
    })
  }

  if (isLoading) {
    return (
      <div className="text-xs text-gray-500 mt-2">
        拡張機能を読み込み中...
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-xs text-red-500 mt-2 bg-red-50 border border-red-200 rounded p-2">
        <AlertCircle className="h-3 w-3 inline mr-1" />
        {error}
        <Button
          onClick={loadExtensions}
          variant="ghost"
          size="sm"
          className="ml-2 h-5 px-2 text-xs"
        >
          再試行
        </Button>
      </div>
    )
  }

  const hasTaskExtension = extensions.some(ext => ext.type === 'task')
  const hasDocumentExtension = extensions.some(ext => ext.type === 'document')
  const hasWorkSessionExtension = extensions.some(ext => ext.type === 'workSession')

  return (
    <div className="mt-2 space-y-2">
      {/* 拡張機能を表示 */}
      {extensions.map((extension) => {
        switch (extension.type) {
          case 'task':
            return (
              <TaskExtension
                key={extension.id}
                messageId={messageId}
                data={extension.data as unknown as TaskExtensionData}
                onUpdate={(data) => handleUpdateExtension(extension.id, data as unknown as Record<string, unknown>)}
                onDelete={() => handleDeleteExtension(extension.id)}
                isEditing={editingExtensions.has(extension.id)}
                onEditToggle={() => toggleEditing(extension.id)}
              />
            )
          case 'document':
            return (
              <DocumentExtension
                key={extension.id}
                messageId={messageId}
                messageContent={messageContent}
                data={extension.data as unknown as DocumentExtensionData}
                onUpdate={(data) => handleUpdateExtension(extension.id, data as unknown as Record<string, unknown>)}
                onDelete={() => handleDeleteExtension(extension.id)}
              />
            )
          case 'workSession':
            return (
              <WorkSessionExtension
                key={extension.id}
                messageId={messageId}
                data={extension.data as unknown as WorkSessionExtensionData}
                onUpdate={(data) => handleUpdateExtension(extension.id, data as unknown as Record<string, unknown>)}
                onDelete={() => handleDeleteExtension(extension.id)}
              />
            )
          default:
            return null
        }
      })}

      {/* 拡張機能追加ボタン（現在のラインのメッセージのみ） */}
      {isCurrentLine && (
        <div className="relative">
          {showAddMenu ? (
            <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-2 space-y-1">
              <div className="text-xs text-gray-500 px-2 py-1">拡張機能を追加</div>

              {!hasTaskExtension && (
                <Button
                  onClick={handleCreateTaskExtension}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-xs h-8"
                >
                  <CheckSquare className="h-3 w-3 mr-2" />
                  タスク
                </Button>
              )}

              {!hasDocumentExtension && shouldCreateDocumentExtension(messageContent) && (
                <Button
                  onClick={handleCreateDocumentExtension}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-xs h-8"
                >
                  <FileText className="h-3 w-3 mr-2" />
                  ドキュメント折りたたみ
                </Button>
              )}

              {!hasWorkSessionExtension && (
                <Button
                  onClick={handleCreateWorkSessionExtension}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-xs h-8"
                >
                  <Timer className="h-3 w-3 mr-2" />
                  ワークセッション
                </Button>
              )}

              <div className="border-t pt-1">
                <Button
                  onClick={() => setShowAddMenu(false)}
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs h-6 text-gray-500"
                >
                  キャンセル
                </Button>
              </div>
            </div>
          ) : (
            <Button
              onClick={() => setShowAddMenu(true)}
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-gray-400 hover:text-gray-600"
            >
              <Plus className="h-3 w-3 mr-1" />
              <span className="text-xs">拡張機能</span>
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
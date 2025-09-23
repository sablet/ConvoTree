"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Play, Square, Clock, Edit3, Timer } from "lucide-react"

interface SessionMessageData {
  checkedInAt?: string
  checkedOutAt?: string
  timeSpent?: number // 分単位
  notes?: string
}

interface SessionMessageProps {
  messageId: string
  content: string
  data: SessionMessageData
  onUpdate?: (data: SessionMessageData) => void
  isEditable?: boolean
}

export function SessionMessage({
  content,
  data,
  onUpdate,
  isEditable = false
}: SessionMessageProps) {
  const [currentTime, setCurrentTime] = useState(Date.now())
  const [notes, setNotes] = useState(data.notes || '')
  const [isEditingNotes, setIsEditingNotes] = useState(false)

  // 現在時刻を1秒ごとに更新（作業中の場合）
  useEffect(() => {
    if (data.checkedInAt && !data.checkedOutAt) {
      const interval = setInterval(() => {
        setCurrentTime(Date.now())
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [data.checkedInAt, data.checkedOutAt])

  const isWorking = data.checkedInAt && !data.checkedOutAt

  const handleCheckIn = () => {
    if (onUpdate) {
      onUpdate({
        ...data,
        checkedInAt: new Date().toISOString(),
        checkedOutAt: undefined
      })
    }
  }

  const handleCheckOut = () => {
    if (onUpdate && data.checkedInAt) {
      const timeSpent = Math.round((Date.now() - new Date(data.checkedInAt).getTime()) / (1000 * 60))
      onUpdate({
        ...data,
        checkedOutAt: new Date().toISOString(),
        timeSpent: (data.timeSpent || 0) + timeSpent
      })
    }
  }

  const handleSaveNotes = () => {
    if (onUpdate) {
      onUpdate({
        ...data,
        notes: notes.trim() || undefined
      })
    }
    setIsEditingNotes(false)
  }

  const formatDuration = (minutes: number): string => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours > 0) {
      return `${hours}時間${mins}分`
    }
    return `${mins}分`
  }

  const getCurrentSessionDuration = (): number => {
    if (!data.checkedInAt) return 0
    return Math.round((currentTime - new Date(data.checkedInAt).getTime()) / (1000 * 60))
  }

  const formatTime = (dateString: string): string => {
    return new Date(dateString).toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className={`border rounded-lg p-4 transition-all ${
      isWorking
        ? 'bg-green-50 border-green-200'
        : 'bg-purple-50 border-purple-200'
    }`}>
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Timer className={`h-4 w-4 ${isWorking ? 'text-green-600' : 'text-purple-600'}`} />
          <span className={`text-sm font-medium ${
            isWorking ? 'text-green-800' : 'text-purple-800'
          }`}>
            作業セッション
          </span>
          {isWorking && (
            <div className="flex items-center gap-1 animate-pulse">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-xs text-green-600">作業中</span>
            </div>
          )}
        </div>
      </div>

      {/* セッション内容 */}
      <div className="space-y-3">
        <div className="text-sm text-gray-700">
          {content}
        </div>

        {/* 現在のセッション */}
        {isWorking && (
          <div className="bg-white rounded p-3 border border-green-200">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="text-sm font-medium text-green-800">
                  現在の作業時間
                </div>
                <div className="text-lg font-mono text-green-600">
                  {formatDuration(getCurrentSessionDuration())}
                </div>
                <div className="text-xs text-green-600">
                  開始: {formatTime(data.checkedInAt!)}
                </div>
              </div>
              <Button
                onClick={handleCheckOut}
                className="bg-green-500 hover:bg-green-600 text-white"
                size="sm"
              >
                <Square className="h-3 w-3 mr-1" />
                チェックアウト
              </Button>
            </div>
          </div>
        )}

        {/* チェックインボタン */}
        {!isWorking && (
          <div className="flex justify-center">
            <Button
              onClick={handleCheckIn}
              className="bg-purple-500 hover:bg-purple-600 text-white"
              size="sm"
            >
              <Play className="h-3 w-3 mr-1" />
              チェックイン
            </Button>
          </div>
        )}

        {/* 累計時間 */}
        {(data.timeSpent || 0) > 0 && (
          <div className="bg-white rounded p-2 border">
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-3 w-3 text-gray-500" />
              <span className="text-gray-600">累計作業時間:</span>
              <span className="font-medium text-gray-900">
                {formatDuration(data.timeSpent || 0)}
              </span>
            </div>
          </div>
        )}

        {/* 最後のセッション */}
        {data.checkedOutAt && (
          <div className="bg-white rounded p-2 border">
            <div className="text-xs text-gray-500 mb-1">最後のセッション</div>
            <div className="text-sm text-gray-700">
              {data.checkedInAt && formatTime(data.checkedInAt)} - {formatTime(data.checkedOutAt)}
            </div>
          </div>
        )}

        {/* メモ */}
        <div className="bg-white rounded p-2 border">
          {isEditingNotes ? (
            <div className="space-y-2">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="作業メモを入力..."
                className="w-full text-sm border border-gray-300 rounded px-2 py-1 resize-none"
                rows={3}
              />
              <div className="flex gap-2 justify-end">
                <Button
                  onClick={() => {
                    setNotes(data.notes || '')
                    setIsEditingNotes(false)
                  }}
                  variant="outline"
                  size="sm"
                  className="text-xs"
                >
                  キャンセル
                </Button>
                <Button
                  onClick={handleSaveNotes}
                  size="sm"
                  className="text-xs"
                >
                  保存
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="text-xs text-gray-500 mb-1">作業メモ</div>
                <div className="text-sm text-gray-700">
                  {data.notes || (
                    <span className="text-gray-400 italic">メモなし</span>
                  )}
                </div>
              </div>
              {isEditable && (
                <Button
                  onClick={() => setIsEditingNotes(true)}
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-gray-400 hover:text-gray-600"
                  title="編集"
                >
                  <Edit3 className="h-3 w-3" />
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Play, Square, Clock, Timer, Edit3, Check, X } from "lucide-react"

interface SessionMessageData {
  checkedInAt?: string
  checkedOutAt?: string
  timeSpent?: number // 分単位
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
  const [isEditMode, setIsEditMode] = useState(false)
  const [editCheckedInAt, setEditCheckedInAt] = useState('')
  const [editCheckedOutAt, setEditCheckedOutAt] = useState('')

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

  // 編集モード開始時の初期値設定
  useEffect(() => {
    if (isEditMode) {
      const formatDateTimeLocal = (dateString: string) => {
        const date = new Date(dateString)
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        const hours = String(date.getHours()).padStart(2, '0')
        const minutes = String(date.getMinutes()).padStart(2, '0')
        return `${year}/${month}/${day} ${hours}:${minutes}`
      }

      setEditCheckedInAt(data.checkedInAt ? formatDateTimeLocal(data.checkedInAt) : '')
      setEditCheckedOutAt(data.checkedOutAt ? formatDateTimeLocal(data.checkedOutAt) : '')
    }
  }, [isEditMode, data.checkedInAt, data.checkedOutAt])

  const handleCheckIn = () => {
    if (onUpdate) {
      const updateData: SessionMessageData = {
        ...data,
        checkedInAt: new Date().toISOString()
      }
      // checkedOutAtがある場合のみ削除（undefinedを送信しない）
      if (data.checkedOutAt !== undefined) {
        delete updateData.checkedOutAt
      }
      onUpdate(updateData)
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

  const calculateDuration = (checkedInAt: string, checkedOutAt: string): number => {
    if (!checkedInAt || !checkedOutAt) return 0
    try {
      const startTime = new Date(checkedInAt).getTime()
      const endTime = new Date(checkedOutAt).getTime()
      if (isNaN(startTime) || isNaN(endTime)) return 0
      const duration = Math.round((endTime - startTime) / (1000 * 60))
      return duration >= 0 ? duration : 0
    } catch {
      return 0
    }
  }

  const parseDateTime = (dateTimeStr: string): string | null => {
    if (!dateTimeStr || !dateTimeStr.includes(' ')) return null
    try {
      const [datePart, timePart] = dateTimeStr.split(' ')
      if (!datePart || !timePart) return null

      const dateSegments = datePart.split('/')
      const timeSegments = timePart.split(':')

      if (dateSegments.length !== 3 || timeSegments.length !== 2) return null

      const [year, month, day] = dateSegments.map(s => parseInt(s, 10))
      const [hours, minutes] = timeSegments.map(s => parseInt(s, 10))

      if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hours) || isNaN(minutes)) return null
      if (month < 1 || month > 12 || day < 1 || day > 31 || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null

      const date = new Date(year, month - 1, day, hours, minutes)
      if (isNaN(date.getTime())) return null

      // ローカル時刻をISO文字列として保存するため、タイムゾーンオフセットを調整
      const offsetMs = date.getTimezoneOffset() * 60000
      const localISOTime = new Date(date.getTime() - offsetMs).toISOString()
      return localISOTime
    } catch {
      return null
    }
  }

  const getPreviewDuration = (): number => {
    if (!editCheckedInAt || !editCheckedOutAt) return 0
    const startISO = parseDateTime(editCheckedInAt)
    const endISO = parseDateTime(editCheckedOutAt)
    if (!startISO || !endISO) return 0
    return calculateDuration(startISO, endISO)
  }

  const handleEditSave = () => {
    if (!onUpdate) return

    const newCheckedInAt = editCheckedInAt ? parseDateTime(editCheckedInAt) : undefined
    const newCheckedOutAt = editCheckedOutAt ? parseDateTime(editCheckedOutAt) : undefined

    // 入力値の検証
    if (editCheckedInAt && !newCheckedInAt) {
      alert('チェックイン時刻の形式が正しくありません (YYYY/MM/DD HH:MM)')
      return
    }
    if (editCheckedOutAt && !newCheckedOutAt) {
      alert('チェックアウト時刻の形式が正しくありません (YYYY/MM/DD HH:MM)')
      return
    }
    if (newCheckedInAt && newCheckedOutAt && new Date(newCheckedInAt) >= new Date(newCheckedOutAt)) {
      alert('チェックアウト時刻はチェックイン時刻より後に設定してください')
      return
    }

    // 両方の時刻が設定されている場合、経過時間を自動計算
    let newTimeSpent = data.timeSpent || 0
    if (newCheckedInAt && newCheckedOutAt) {
      const sessionDuration = calculateDuration(newCheckedInAt, newCheckedOutAt)
      // 既存の累計時間から前のセッション時間を引いて、新しいセッション時間を加える
      const previousSessionDuration = data.checkedInAt && data.checkedOutAt ?
        calculateDuration(data.checkedInAt, data.checkedOutAt) : 0
      newTimeSpent = Math.max(0, (data.timeSpent || 0) - previousSessionDuration + sessionDuration)
    }

    const updateData: SessionMessageData = {
      ...data,
      checkedInAt: newCheckedInAt || undefined,
      checkedOutAt: newCheckedOutAt || undefined,
      timeSpent: newTimeSpent
    }

    onUpdate(updateData)
    setIsEditMode(false)
  }

  const handleEditCancel = () => {
    setIsEditMode(false)
    setEditCheckedInAt('')
    setEditCheckedOutAt('')
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
            {content.length > 30 ? `${content.slice(0, 30)}...` : content}
          </span>
          {isWorking && (
            <div className="flex items-center gap-1 animate-pulse">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-xs text-green-600">作業中</span>
            </div>
          )}
        </div>

        {/* 編集ボタン */}
        {isEditable && !isWorking && (data.checkedInAt || data.checkedOutAt) && (
          <div className="flex items-center gap-1">
            {isEditMode ? (
              <>
                <Button
                  onClick={handleEditSave}
                  size="sm"
                  variant="outline"
                  className="h-6 w-6 p-0 text-green-600 hover:text-green-700"
                >
                  <Check className="h-3 w-3" />
                </Button>
                <Button
                  onClick={handleEditCancel}
                  size="sm"
                  variant="outline"
                  className="h-6 w-6 p-0 text-red-600 hover:text-red-700"
                >
                  <X className="h-3 w-3" />
                </Button>
              </>
            ) : (
              <Button
                onClick={() => setIsEditMode(true)}
                size="sm"
                variant="outline"
                className="h-6 w-6 p-0 text-gray-600 hover:text-gray-700"
              >
                <Edit3 className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
      </div>

      {/* セッション内容 */}
      <div className="space-y-3">

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

        {/* セッション時刻表示・編集 */}
        {(data.checkedInAt || data.checkedOutAt) && (
          <div className="bg-white rounded p-3 border">
            {isEditMode ? (
              <div className="space-y-3">
                <div className="text-xs text-gray-500 mb-2">セッション時刻編集</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">チェックイン時刻</label>
                    <input
                      type="text"
                      value={editCheckedInAt}
                      onChange={(e) => setEditCheckedInAt(e.target.value)}
                      placeholder="YYYY/MM/DD HH:MM"
                      className="w-full text-xs p-2 border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">チェックアウト時刻</label>
                    <input
                      type="text"
                      value={editCheckedOutAt}
                      onChange={(e) => setEditCheckedOutAt(e.target.value)}
                      placeholder="YYYY/MM/DD HH:MM"
                      className="w-full text-xs p-2 border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
                {editCheckedInAt && editCheckedOutAt && (
                  <div className="text-xs">
                    {(() => {
                      const duration = getPreviewDuration()
                      const startISO = parseDateTime(editCheckedInAt)
                      const endISO = parseDateTime(editCheckedOutAt)
                      const isValid = startISO && endISO && new Date(startISO) < new Date(endISO)

                      if (!isValid) {
                        return <span className="text-red-600">無効な時刻形式または時刻順序です</span>
                      }

                      return (
                        <span className="text-blue-600">
                          計算される経過時間: {formatDuration(duration)}
                        </span>
                      )
                    })()}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div className="text-xs text-gray-500 mb-1">セッション時刻</div>
                <div className="text-sm text-gray-700">
                  {data.checkedInAt && (
                    <span>開始: {formatTime(data.checkedInAt)}</span>
                  )}
                  {data.checkedInAt && data.checkedOutAt && <span className="mx-2">-</span>}
                  {data.checkedOutAt && (
                    <span>終了: {formatTime(data.checkedOutAt)}</span>
                  )}
                </div>
                {data.checkedInAt && data.checkedOutAt && (
                  <div className="text-xs text-gray-500 mt-1">
                    セッション時間: {formatDuration(calculateDuration(data.checkedInAt, data.checkedOutAt))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
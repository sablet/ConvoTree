"use client"

import { useState, useEffect } from "react"
import { SessionMessageProps, SessionMessageData } from "./session-message-types"
import { SessionMessageHeader } from "./session-message/SessionMessageHeader"
import { SessionMessageWorkingSession } from "./session-message/SessionMessageWorkingSession"
import { SessionMessageCheckInButton } from "./session-message/SessionMessageCheckInButton"
import { SessionMessageTotalTime } from "./session-message/SessionMessageTotalTime"
import { SessionMessageSessionTimes } from "./session-message/SessionMessageSessionTimes"
import {
  formatDateTimeLocal,
  validateSessionTimes,
  calculateNewTimeSpent
} from "./session-message-helpers"

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

  const isWorking = Boolean(data.checkedInAt && !data.checkedOutAt)

  // 自動開始の処理
  useEffect(() => {
    if (data.autoStart && !data.checkedInAt && onUpdate) {
      const updateData: SessionMessageData = {
        ...data,
        checkedInAt: new Date().toISOString(),
        autoStart: false
      }
      onUpdate(updateData)
    }
  }, [data, onUpdate])

  // 現在時刻を1秒ごとに更新（作業中の場合）
  useEffect(() => {
    if (isWorking) {
      const interval = setInterval(() => {
        setCurrentTime(Date.now())
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [isWorking])

  // 編集モード開始時の初期値設定
  useEffect(() => {
    if (isEditMode) {
      setEditCheckedInAt(data.checkedInAt ? formatDateTimeLocal(data.checkedInAt) : '')
      setEditCheckedOutAt(data.checkedOutAt ? formatDateTimeLocal(data.checkedOutAt) : '')
    }
  }, [isEditMode, data.checkedInAt, data.checkedOutAt])

  const handleCheckIn = () => {
    if (!onUpdate) return

    const updateData: SessionMessageData = {
      ...data,
      checkedInAt: new Date().toISOString()
    }
    if (data.checkedOutAt !== undefined) {
      delete updateData.checkedOutAt
    }
    onUpdate(updateData)
  }

  const handleCheckOut = () => {
    if (!onUpdate || !data.checkedInAt) return

    const timeSpent = Math.round((Date.now() - new Date(data.checkedInAt).getTime()) / (1000 * 60))
    onUpdate({
      ...data,
      checkedOutAt: new Date().toISOString(),
      timeSpent: (data.timeSpent || 0) + timeSpent
    })
  }

  const handleEditSave = () => {
    if (!onUpdate) return

    const validation = validateSessionTimes(editCheckedInAt, editCheckedOutAt)
    if (!validation.isValid) {
      alert(validation.message)
      return
    }

    const newTimeSpent = calculateNewTimeSpent(
      data.timeSpent || 0,
      validation.checkedInAt,
      validation.checkedOutAt,
      data.checkedInAt,
      data.checkedOutAt
    )

    const updateData: SessionMessageData = {
      ...data,
      checkedInAt: validation.checkedInAt,
      checkedOutAt: validation.checkedOutAt,
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

  const getCurrentSessionDuration = (): number => {
    if (!data.checkedInAt) return 0
    return Math.round((currentTime - new Date(data.checkedInAt).getTime()) / (1000 * 60))
  }

  return (
    <div className={`border rounded-lg p-4 transition-all ${
      isWorking
        ? 'bg-green-50 border-green-200'
        : 'bg-purple-50 border-purple-200'
    }`}>
      <SessionMessageHeader
        content={content}
        isWorking={isWorking}
        isEditable={isEditable}
        hasSessionData={Boolean(data.checkedInAt || data.checkedOutAt)}
        isEditMode={isEditMode}
        onEditToggle={() => setIsEditMode(true)}
        onEditSave={handleEditSave}
        onEditCancel={handleEditCancel}
      />

      <div className="space-y-3">
        {isWorking && data.checkedInAt && (
          <SessionMessageWorkingSession
            checkedInAt={data.checkedInAt}
            currentSessionDuration={getCurrentSessionDuration()}
            onCheckOut={handleCheckOut}
          />
        )}

        {!isWorking && (
          <SessionMessageCheckInButton onCheckIn={handleCheckIn} />
        )}

        <SessionMessageTotalTime timeSpent={data.timeSpent || 0} />

        <SessionMessageSessionTimes
          checkedInAt={data.checkedInAt}
          checkedOutAt={data.checkedOutAt}
          isEditMode={isEditMode}
          editCheckedInAt={editCheckedInAt}
          editCheckedOutAt={editCheckedOutAt}
          onEditCheckedInAtChange={setEditCheckedInAt}
          onEditCheckedOutAtChange={setEditCheckedOutAt}
        />
      </div>
    </div>
  )
}

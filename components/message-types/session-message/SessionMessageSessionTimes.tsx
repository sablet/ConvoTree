"use client"

import { formatTime, formatDuration, calculateDuration, parseDateTime } from "../session-message-helpers"

interface SessionMessageSessionTimesProps {
  checkedInAt?: string | null
  checkedOutAt?: string | null
  isEditMode: boolean
  editCheckedInAt: string
  editCheckedOutAt: string
  onEditCheckedInAtChange: (value: string) => void
  onEditCheckedOutAtChange: (value: string) => void
}

function SessionTimesDisplay({ checkedInAt, checkedOutAt }: {
  checkedInAt?: string | null
  checkedOutAt?: string | null
}) {
  return (
    <div>
      <div className="text-xs text-gray-500 mb-1">セッション時刻</div>
      <div className="text-sm text-gray-700">
        {checkedInAt && (
          <span>開始: {formatTime(checkedInAt)}</span>
        )}
        {checkedInAt && checkedOutAt && <span className="mx-2">-</span>}
        {checkedOutAt && (
          <span>終了: {formatTime(checkedOutAt)}</span>
        )}
      </div>
      {checkedInAt && checkedOutAt && (
        <div className="text-xs text-gray-500 mt-1">
          セッション時間: {formatDuration(calculateDuration(checkedInAt, checkedOutAt))}
        </div>
      )}
    </div>
  )
}

function DurationPreview({ editCheckedInAt, editCheckedOutAt }: {
  editCheckedInAt: string
  editCheckedOutAt: string
}) {
  if (!editCheckedInAt || !editCheckedOutAt) return null

  const startISO = parseDateTime(editCheckedInAt)
  const endISO = parseDateTime(editCheckedOutAt)
  const isValid = startISO && endISO && new Date(startISO) < new Date(endISO)

  if (!isValid) {
    return <span className="text-red-600">無効な時刻形式または時刻順序です</span>
  }

  const duration = calculateDuration(startISO, endISO)
  return (
    <span className="text-blue-600">
      計算される経過時間: {formatDuration(duration)}
    </span>
  )
}

function SessionTimesEdit({
  editCheckedInAt,
  editCheckedOutAt,
  onEditCheckedInAtChange,
  onEditCheckedOutAtChange
}: {
  editCheckedInAt: string
  editCheckedOutAt: string
  onEditCheckedInAtChange: (value: string) => void
  onEditCheckedOutAtChange: (value: string) => void
}) {
  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-500 mb-2">セッション時刻編集</div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-600 block mb-1">チェックイン時刻</label>
          <input
            type="text"
            value={editCheckedInAt}
            onChange={(e) => onEditCheckedInAtChange(e.target.value)}
            placeholder="YYYY/MM/DD HH:MM"
            className="w-full text-xs p-2 border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="text-xs text-gray-600 block mb-1">チェックアウト時刻</label>
          <input
            type="text"
            value={editCheckedOutAt}
            onChange={(e) => onEditCheckedOutAtChange(e.target.value)}
            placeholder="YYYY/MM/DD HH:MM"
            className="w-full text-xs p-2 border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>
      <div className="text-xs">
        <DurationPreview editCheckedInAt={editCheckedInAt} editCheckedOutAt={editCheckedOutAt} />
      </div>
    </div>
  )
}

export function SessionMessageSessionTimes({
  checkedInAt,
  checkedOutAt,
  isEditMode,
  editCheckedInAt,
  editCheckedOutAt,
  onEditCheckedInAtChange,
  onEditCheckedOutAtChange
}: SessionMessageSessionTimesProps) {
  if (!checkedInAt && !checkedOutAt) return null

  return (
    <div className="bg-white rounded p-3 border">
      {isEditMode ? (
        <SessionTimesEdit
          editCheckedInAt={editCheckedInAt}
          editCheckedOutAt={editCheckedOutAt}
          onEditCheckedInAtChange={onEditCheckedInAtChange}
          onEditCheckedOutAtChange={onEditCheckedOutAtChange}
        />
      ) : (
        <SessionTimesDisplay checkedInAt={checkedInAt} checkedOutAt={checkedOutAt} />
      )}
    </div>
  )
}

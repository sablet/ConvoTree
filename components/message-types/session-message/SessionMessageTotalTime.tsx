"use client"

import { Clock } from "lucide-react"
import { formatDuration } from "../session-message-helpers"

interface SessionMessageTotalTimeProps {
  timeSpent: number
}

export function SessionMessageTotalTime({ timeSpent }: SessionMessageTotalTimeProps) {
  if (timeSpent <= 0) return null

  return (
    <div className="bg-white rounded p-2 border">
      <div className="flex items-center gap-2 text-sm">
        <Clock className="h-3 w-3 text-gray-500" />
        <span className="text-gray-600">累計作業時間:</span>
        <span className="font-medium text-gray-900">
          {formatDuration(timeSpent)}
        </span>
      </div>
    </div>
  )
}

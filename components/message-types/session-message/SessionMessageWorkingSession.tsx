"use client"

import { Button } from "@/components/ui/button"
import { Square } from "lucide-react"
import { formatDuration, formatTime } from "../session-message-helpers"

interface SessionMessageWorkingSessionProps {
  checkedInAt: string
  currentSessionDuration: number
  onCheckOut: () => void
}

export function SessionMessageWorkingSession({
  checkedInAt,
  currentSessionDuration,
  onCheckOut
}: SessionMessageWorkingSessionProps) {
  return (
    <div className="bg-white rounded p-3 border border-green-200">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="text-sm font-medium text-green-800">
            現在の作業時間
          </div>
          <div className="text-lg font-mono text-green-600">
            {formatDuration(currentSessionDuration)}
          </div>
          <div className="text-xs text-green-600">
            開始: {formatTime(checkedInAt)}
          </div>
        </div>
        <Button
          onClick={onCheckOut}
          className="bg-green-500 hover:bg-green-600 text-white"
          size="sm"
        >
          <Square className="h-3 w-3 mr-1" />
          チェックアウト
        </Button>
      </div>
    </div>
  )
}

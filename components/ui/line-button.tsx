"use client"

import type { Line, Message } from "@/lib/types"
import { getLineMessageCount } from "@/lib/data-helpers"

interface LineButtonProps {
  line: Line
  messages: Record<string, Message>
  isActive?: boolean
  onClick: (lineId: string) => void
}

export function LineButton({ line, messages, isActive = false, onClick }: LineButtonProps) {
  const messageCount = getLineMessageCount(messages, line.id)

  return (
    <button
      key={line.id}
      onClick={() => onClick(line.id)}
      className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
        isActive
          ? 'bg-blue-100 text-blue-900 border border-blue-200'
          : 'hover:bg-gray-100 text-gray-700'
      }`}
    >
      <div className="font-medium truncate">{line.name}</div>
      <div className="text-xs text-gray-500 mt-1">
        {messageCount}件のメッセージ
      </div>
    </button>
  )
}
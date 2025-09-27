"use client"

import { Line } from "@/lib/types"

interface LineButtonProps {
  line: Line
  isActive?: boolean
  onClick: (lineId: string) => void
}

export function LineButton({ line, isActive = false, onClick }: LineButtonProps) {
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
        {line.messageIds.length}件のメッセージ
      </div>
    </button>
  )
}
"use client"

import { Line } from "@/lib/types"
import { LineButton } from "./line-button"

interface LineListProps {
  lines: Line[]
  currentLineId?: string
  onLineClick: (lineId: string) => void
  title?: string
  showTitle?: boolean
}

export function LineList({
  lines,
  currentLineId,
  onLineClick,
  title = "ライン管理",
  showTitle = true
}: LineListProps) {
  return (
    <div className="space-y-4">
      <div>
        {showTitle && (
          <h3 className="text-sm font-medium text-gray-700 mb-2">{title}</h3>
        )}
        <div className="space-y-1 max-h-60 overflow-y-auto">
          {lines.map((line) => (
            <LineButton
              key={line.id}
              line={line}
              isActive={line.id === currentLineId}
              onClick={onLineClick}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
"use client"

import { useRouter } from "next/navigation"

interface Line {
  id: string
  name: string
  messageIds: string[]
  startMessageId: string
  endMessageId?: string
  branchFromMessageId?: string
  tagIds?: string[]
  created_at: string
  updated_at: string
}

interface LineHistoryMenuProps {
  lines: Line[]
  currentLineId?: string
  onLineSelect?: (lineId: string) => void
}

export function LineHistoryMenu({ lines, currentLineId, onLineSelect }: LineHistoryMenuProps) {
  const router = useRouter()

  const handleLineClick = (lineId: string) => {
    if (onLineSelect) {
      onLineSelect(lineId)
    } else {
      // デフォルトの動作：チャットページにリダイレクト
      const targetLine = lines.find(line => line.id === lineId)
      if (targetLine) {
        const encodedLineName = encodeURIComponent(targetLine.name)
        router.push(`/?line=${encodedLineName}`)
      }
    }
  }

  const sortedLines = lines
    .slice()
    .sort((a, b) => {
      const dateA = new Date(a.updated_at || a.created_at)
      const dateB = new Date(b.updated_at || b.created_at)
      return dateB.getTime() - dateA.getTime()
    })

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-2">ライン管理</h3>
        <div className="space-y-1 max-h-60 overflow-y-auto">
          {sortedLines.map((line) => {
            const isActive = line.id === currentLineId
            return (
              <button
                key={line.id}
                onClick={() => handleLineClick(line.id)}
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
          })}
        </div>
      </div>
    </div>
  )
}
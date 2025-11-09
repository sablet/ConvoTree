"use client"

import { useRouter } from "next/navigation"
import type { Line, Message } from "@/lib/types"
import { LineList } from "@/components/ui/line-list"

interface LineHistoryMenuProps {
  lines: Line[]
  messages: Record<string, Message>
  currentLineId?: string
  onLineSelect?: (lineId: string) => void
}

export function LineHistoryMenu({ lines, messages, currentLineId, onLineSelect }: LineHistoryMenuProps) {
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
    <LineList
      lines={sortedLines}
      messages={messages}
      currentLineId={currentLineId}
      onLineClick={handleLineClick}
    />
  )
}
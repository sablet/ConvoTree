import { useCallback, useState } from "react"
import { connectLineToLine } from "@/hooks/helpers/line-connection"
import type { Line, Message } from "@/lib/types"
import { getLineLastMessage } from "@/lib/data-helpers"

interface UseLineConnectionProps {
  lines: Record<string, Line>
  messages: Record<string, Message>
  currentLineId: string
  setLines: (updater: (prev: Record<string, Line>) => Record<string, Line>) => void
  clearAllCaches: () => void
  clearTimelineCaches: () => void
}

export function useLineConnection({
  lines,
  messages,
  currentLineId,
  setLines,
  clearAllCaches,
  clearTimelineCaches
}: UseLineConnectionProps) {
  const [isConnectingLine, setIsConnectingLine] = useState<boolean>(false)

  const handleLineConnect = useCallback(async (targetLineId: string) => {
    try {
      setIsConnectingLine(true)
      const linesArray = Object.values(lines)
      const sourceLineId = currentLineId
      const targetLine = lines[targetLineId]

      if (!targetLine) {
        throw new Error('ターゲットラインが見つかりません')
      }

      const targetLastMessage = getLineLastMessage(messages, targetLineId)

      if (!targetLastMessage) {
        throw new Error('ターゲットラインにメッセージがありません')
      }

      await connectLineToLine(sourceLineId, targetLineId, linesArray)

      setLines(prev => ({
        ...prev,
        [sourceLineId]: {
          ...prev[sourceLineId],
          parent_line_id: targetLineId,
          updated_at: new Date().toISOString()
        }
      }))

      clearAllCaches()
      clearTimelineCaches()

      return true
    } catch (error) {
      console.error('Failed to connect lines:', error)
      alert(error instanceof Error ? error.message : 'ライン接続に失敗しました')
      return false
    } finally {
      setIsConnectingLine(false)
    }
  }, [lines, messages, currentLineId, setLines, clearAllCaches, clearTimelineCaches])

  return { handleLineConnect, isConnectingLine }
}

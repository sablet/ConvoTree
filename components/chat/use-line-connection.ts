import { useCallback, useState } from "react"
import { connectLineToLine } from "@/hooks/helpers/line-connection"
import type { Line } from "@/lib/types"

interface UseLineConnectionProps {
  lines: Record<string, Line>
  currentLineId: string
  setLines: (updater: (prev: Record<string, Line>) => Record<string, Line>) => void
  clearAllCaches: () => void
  clearTimelineCaches: () => void
}

export function useLineConnection({
  lines,
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

      const targetLastMessageId = targetLine.endMessageId ||
        (targetLine.messageIds.length > 0 ? targetLine.messageIds[targetLine.messageIds.length - 1] : null)

      if (!targetLastMessageId) {
        throw new Error('ターゲットラインにメッセージがありません')
      }

      await connectLineToLine(sourceLineId, targetLineId, linesArray)

      setLines(prev => ({
        ...prev,
        [sourceLineId]: {
          ...prev[sourceLineId],
          branchFromMessageId: targetLastMessageId,
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
  }, [lines, currentLineId, setLines, clearAllCaches, clearTimelineCaches])

  return { handleLineConnect, isConnectingLine }
}

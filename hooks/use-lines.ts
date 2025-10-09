import { useState, useEffect, useCallback } from "react"
import { dataSourceManager } from "@/lib/data-source"
import { chatRepository } from "@/lib/repositories/chat-repository"
import { Line } from "@/lib/types"

export function useLines() {
  const [lines, setLines] = useState<Line[]>([])

  const loadLines = useCallback(async () => {
    try {
      const { data } = await chatRepository.loadChatData({
        source: dataSourceManager.getCurrentSource()
      })
      setLines(data.lines || [])
    } catch (error) {
      console.error('Failed to load lines:', error)
    }
  }, [])

  useEffect(() => {
    void loadLines()
  }, [loadLines])

  return {
    lines,
    reloadLines: loadLines
  }
}

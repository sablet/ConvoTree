import { useState, useEffect, useCallback } from "react"
import { chatRepository } from "@/lib/repositories/chat-repository"
import { Line } from "@/lib/types"

export function useLines() {
  const [lines, setLines] = useState<Line[]>([])

  const loadLines = useCallback(async () => {
    try {
      const data = chatRepository.getCurrentData()
      if (data) {
        setLines(data.lines || [])
      }
    } catch (error) {
      console.error('Failed to load lines:', error)
    }
  }, [])

  useEffect(() => {
    // 初回ロード
    void loadLines()

    // リアルタイム更新を監視
    const unsubscribe = chatRepository.subscribeToDataChanges((data) => {
      setLines(data.lines || [])
    })

    return () => {
      unsubscribe()
    }
  }, [loadLines])

  return {
    lines,
    reloadLines: loadLines
  }
}

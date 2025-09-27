import { useState, useEffect } from "react"
import { dataSourceManager } from "@/lib/data-source"
import { Line } from "@/lib/types"

export function useLines() {
  const [lines, setLines] = useState<Line[]>([])

  useEffect(() => {
    const loadLines = async () => {
      try {
        const data = await dataSourceManager.loadChatData()
        setLines(data.lines || [])
      } catch (error) {
        console.error('Failed to load lines:', error)
      }
    }

    loadLines()
  }, [])

  return lines
}
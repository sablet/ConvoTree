import { useCallback, useMemo } from 'react'
import type { Line, Message, BranchPoint } from '@/lib/types'
import { TIMELINE_BRANCH_ID } from '@/lib/constants'
import { calculateLineAncestry, calculateOptimizedPath, type LineAncestryResult } from './branch-ancestry'
import { filterTimeline } from './timeline-filter'
import type { ChatState } from '../use-chat-state'

interface TimelineOperationsProps {
  messages: Record<string, Message>
  lines: Record<string, Line>
  branchPoints: Record<string, BranchPoint>
  currentLineId: string
  pathCache: Map<string, LineAncestryResult>
  setPathCache: React.Dispatch<React.SetStateAction<Map<string, LineAncestryResult>>>
  lineAncestryCache: Map<string, string[]>
  setLineAncestryCache: React.Dispatch<React.SetStateAction<Map<string, string[]>>>
  filterMessageType: ChatState['filterMessageType']
  filterTaskCompleted: ChatState['filterTaskCompleted']
  filterDateStart: ChatState['filterDateStart']
  filterDateEnd: ChatState['filterDateEnd']
  filterTag: ChatState['filterTag']
  searchKeyword: ChatState['searchKeyword']
}

export function useTimelineOperations({
  messages,
  lines,
  branchPoints,
  currentLineId,
  pathCache,
  setPathCache,
  lineAncestryCache,
  setLineAncestryCache,
  filterMessageType,
  filterTaskCompleted,
  filterDateStart,
  filterDateEnd,
  filterTag,
  searchKeyword
}: TimelineOperationsProps) {
  const getBranchingLines = useCallback((messageId: string): Line[] => {
    const branchPoint = branchPoints[messageId]
    if (!branchPoint || !branchPoint.lines.length) return []
    return branchPoint.lines.map(lineId => lines[lineId]).filter(Boolean)
  }, [branchPoints, lines])

  const getLineAncestry = useCallback((lineId: string): string[] => {
    if (lineAncestryCache.has(lineId)) {
      const cached = lineAncestryCache.get(lineId)
      if (cached) return cached
    }

    const ancestry = calculateLineAncestry(lineId, lines, messages, lineAncestryCache)

    setLineAncestryCache(prev => {
      const newCache = new Map(prev)
      newCache.set(lineId, ancestry)
      return newCache
    })

    return ancestry
  }, [lines, messages, lineAncestryCache, setLineAncestryCache])

  const getOptimizedPath = useCallback((lineId: string): LineAncestryResult => {
    if (pathCache.has(lineId)) {
      const cached = pathCache.get(lineId)
      if (cached) return cached
    }

    const result = calculateOptimizedPath(lineId, lines, messages, lineAncestryCache)

    setPathCache(prev => {
      const newCache = new Map(prev)
      newCache.set(lineId, result)
      return newCache
    })

    return result
  }, [lines, messages, lineAncestryCache, pathCache, setPathCache])

  const getCompleteTimeline = useCallback((): LineAncestryResult => {
    if (currentLineId === TIMELINE_BRANCH_ID) {
      const allMessages = Object.values(messages).sort((a, b) => {
        return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      })

      const transitions: Array<{ index: number, lineId: string, lineName: string }> = []
      let prevLineId: string | null = null

      allMessages.forEach((msg, index) => {
        if (msg.lineId !== prevLineId) {
          const line = lines[msg.lineId]
          transitions.push({
            index,
            lineId: msg.lineId,
            lineName: line?.name || msg.lineId
          })
          prevLineId = msg.lineId
        }
      })

      return { messages: allMessages, transitions }
    }

    if (!currentLineId || !lines[currentLineId]) {
      return { messages: [], transitions: [] }
    }

    return getOptimizedPath(currentLineId)
  }, [currentLineId, lines, messages, getOptimizedPath])

  const completeTimeline = useMemo(() => {
    return getCompleteTimeline()
  }, [getCompleteTimeline])

  const filteredTimeline = useMemo(() => {
    return filterTimeline(completeTimeline, {
      filterMessageType,
      filterTaskCompleted,
      filterDateStart,
      filterDateEnd,
      filterTag,
      searchKeyword
    })
  }, [completeTimeline, filterMessageType, filterTaskCompleted, filterDateStart, filterDateEnd, filterTag, searchKeyword])

  const clearTimelineCaches = useCallback(() => {
    setPathCache(new Map())
    setLineAncestryCache(new Map())
  }, [setPathCache, setLineAncestryCache])

  return {
    getBranchingLines,
    getLineAncestry,
    getOptimizedPath,
    getCompleteTimeline,
    completeTimeline,
    filteredTimeline,
    clearTimelineCaches
  }
}


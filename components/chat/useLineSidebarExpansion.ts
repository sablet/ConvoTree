import { useState, useEffect, useCallback } from "react"
import type { Line } from "@/lib/types"
import { buildLineTree } from "@/lib/line-tree-builder"
import { MAIN_LINE_ID } from "@/lib/constants"

export const EXPANDED_LINES_KEY = 'chat-line-sidebar-expanded-lines-v2'
export const COLLAPSED_KEY = 'chat-line-sidebar-collapsed'

function getDefaultExpandedLines(
  lines: Record<string, Line>,
  currentLineId: string,
  getLineAncestry: (lineId: string) => string[]
): Set<string> {
  const tree = buildLineTree(lines, undefined)
  const expandedIds: string[] = []

  for (const node of tree) {
    if (node.depth === 0) {
      expandedIds.push(node.line.id)
    }
  }

  const ancestry = getLineAncestry(currentLineId)
  expandedIds.push(...ancestry)

  return new Set(expandedIds)
}

interface UseLineSidebarExpansionArgs {
  lines: Record<string, Line>
  currentLineId: string
  getLineAncestry: (lineId: string) => string[]
}

export function useLineSidebarExpansion({
  lines,
  currentLineId,
  getLineAncestry
}: UseLineSidebarExpansionArgs) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [expandedLines, setExpandedLines] = useState<Set<string>>(() =>
    getDefaultExpandedLines(lines, currentLineId, getLineAncestry)
  )

  useEffect(() => {
    const savedCollapsed = window.localStorage.getItem(COLLAPSED_KEY)
    const savedExpanded = window.localStorage.getItem(EXPANDED_LINES_KEY)

    if (savedCollapsed !== null) {
      setIsCollapsed(savedCollapsed === 'true')
    } else {
      setIsCollapsed(currentLineId === MAIN_LINE_ID)
    }

    if (savedExpanded) {
      try {
        const expanded = JSON.parse(savedExpanded)
        setExpandedLines(new Set(expanded))
      } catch (error) {
        console.error('Failed to parse expanded lines:', error)
      }
    } else {
      setExpandedLines(getDefaultExpandedLines(lines, currentLineId, getLineAncestry))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setExpandedLines(prev => {
      const tree = buildLineTree(lines, undefined)
      const newSet = new Set(prev)
      let hasNewLines = false

      for (const node of tree) {
        if (node.depth === 0 && !newSet.has(node.line.id)) {
          newSet.add(node.line.id)
          hasNewLines = true
        }
      }

      if (hasNewLines) {
        window.localStorage.setItem(EXPANDED_LINES_KEY, JSON.stringify(Array.from(newSet)))
      }
      return newSet
    })
  }, [lines])

  useEffect(() => {
    setExpandedLines(prev => {
      const ancestry = getLineAncestry(currentLineId)
      const newSet = new Set(prev)
      let hasChanges = false

      for (const ancestorId of ancestry) {
        if (!newSet.has(ancestorId)) {
          newSet.add(ancestorId)
          hasChanges = true
        }
      }

      if (hasChanges) {
        window.localStorage.setItem(EXPANDED_LINES_KEY, JSON.stringify(Array.from(newSet)))
      }
      return newSet
    })
  }, [currentLineId, getLineAncestry])

  const handleToggleCollapse = useCallback(() => {
    const newState = !isCollapsed
    setIsCollapsed(newState)
    window.localStorage.setItem(COLLAPSED_KEY, String(newState))
  }, [isCollapsed])

  const handleToggleExpand = useCallback((lineId: string) => {
    setExpandedLines(prev => {
      const newSet = new Set(prev)
      if (newSet.has(lineId)) {
        newSet.delete(lineId)
      } else {
        newSet.add(lineId)
      }
      window.localStorage.setItem(EXPANDED_LINES_KEY, JSON.stringify(Array.from(newSet)))
      return newSet
    })
  }, [])

  return {
    isCollapsed,
    setIsCollapsed,
    expandedLines,
    setExpandedLines,
    handleToggleCollapse,
    handleToggleExpand
  }
}



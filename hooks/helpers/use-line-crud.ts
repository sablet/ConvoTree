import { useState, useCallback } from 'react'
import type { Line, Message } from '@/lib/types'
import { MAIN_LINE_ID } from '@/lib/constants'
import { dataSourceManager } from '@/lib/data-source'
import { createNewBranch } from './message-send'
import { getChildLines, getLineMessages } from '@/lib/data-helpers'

function hasChildLines(lineId: string, lines: Record<string, Line>): boolean {
  return getChildLines(lines, lineId).length > 0
}

function determineFallbackLineId(
  lineId: string,
  lines: Record<string, Line>
): string {
  const remainingLineIds = Object.keys(lines).filter(id => id !== lineId)
  let fallbackLineId = lines[MAIN_LINE_ID] ? MAIN_LINE_ID : remainingLineIds[0] ?? MAIN_LINE_ID
  if (fallbackLineId === lineId) {
    fallbackLineId = remainingLineIds[0] ?? MAIN_LINE_ID
  }
  if (!fallbackLineId) {
    fallbackLineId = MAIN_LINE_ID
  }
  return fallbackLineId
}

interface BaseLineCrudState {
  lines: Record<string, Line>
  messages: Record<string, Message>
  currentLineId: string
  setLines: React.Dispatch<React.SetStateAction<Record<string, Line>>>
  setMessages: React.Dispatch<React.SetStateAction<Record<string, Message>>>
  setSelectedBaseMessage: React.Dispatch<React.SetStateAction<string | null>>
  setSelectedMessages: React.Dispatch<React.SetStateAction<Set<string>>>
  setIsSelectionMode: React.Dispatch<React.SetStateAction<boolean>>
  setShowMoveDialog: React.Dispatch<React.SetStateAction<boolean>>
  setShowBulkDeleteDialog: React.Dispatch<React.SetStateAction<boolean>>
  setScrollPositions: React.Dispatch<React.SetStateAction<Map<string, number>>>
  setCurrentLineId: React.Dispatch<React.SetStateAction<string>>
  onLineChange?: (lineId: string) => void
  messagesContainerRef: React.RefObject<HTMLDivElement>
  clearTimelineCaches: () => void
  clearAllCaches: () => void
  setFooterKey: React.Dispatch<React.SetStateAction<number>>
}

interface PerformLineDeletionArgs extends BaseLineCrudState {
  lineId: string
}

async function performLineDeletion({
  lineId,
  lines,
  messages,
  currentLineId,
  setLines,
  setMessages,
  setSelectedBaseMessage,
  setSelectedMessages,
  setIsSelectionMode,
  setShowMoveDialog,
  setShowBulkDeleteDialog,
  setScrollPositions,
  setCurrentLineId,
  onLineChange,
  messagesContainerRef,
  clearTimelineCaches,
  clearAllCaches,
  setFooterKey
}: PerformLineDeletionArgs) {
  if (lineId === MAIN_LINE_ID) {
    throw new Error('LINE_MAIN_PROTECTED')
  }

  const targetLine = lines[lineId]
  if (!targetLine) {
    throw new Error('LINE_NOT_FOUND')
  }

  if (hasChildLines(lineId, lines)) {
    throw new Error('LINE_HAS_CHILDREN')
  }

  const currentSource = dataSourceManager.getCurrentSource()
  if (currentSource === 'sample') {
    throw new Error('LINE_DELETE_UNSUPPORTED')
  }

  await dataSourceManager.deleteLine(lineId)

  setLines(prev => {
    const updated = { ...prev }
    delete updated[lineId]
    return updated
  })

  const lineMessages = getLineMessages(messages, lineId)
  if (lineMessages.length > 0) {
    setMessages(prev => {
      const updated = { ...prev }
      for (const msg of lineMessages) {
        delete updated[msg.id]
      }
      return updated
    })
  }

  setSelectedBaseMessage(null)
  setSelectedMessages(new Set())
  setIsSelectionMode(false)
  setShowMoveDialog(false)
  setShowBulkDeleteDialog(false)

  setScrollPositions(prev => {
    const next = new Map(prev)
    next.delete(lineId)
    return next
  })

  if (currentLineId === lineId) {
    const fallbackLineId = determineFallbackLineId(lineId, lines)

    setCurrentLineId(fallbackLineId)
    if (onLineChange && fallbackLineId) {
      onLineChange(fallbackLineId)
    }
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = 0
    }
  }

  clearTimelineCaches()
  clearAllCaches()
  setFooterKey(prev => prev + 1)
}

interface PerformLineCreationArgs {
  lineName: string
  parentLineId: string | null
  lines: Record<string, Line>
  setLines: React.Dispatch<React.SetStateAction<Record<string, Line>>>
  setSelectedBaseMessage: React.Dispatch<React.SetStateAction<string | null>>
  setSelectedMessages: React.Dispatch<React.SetStateAction<Set<string>>>
  setIsSelectionMode: React.Dispatch<React.SetStateAction<boolean>>
  currentLineId: string
  saveScrollPosition: (lineId: string) => void
  setCurrentLineId: React.Dispatch<React.SetStateAction<string>>
  onLineChange?: (lineId: string) => void
  clearTimelineCaches: () => void
  clearAllCaches: () => void
  setFooterKey: React.Dispatch<React.SetStateAction<number>>
  messagesContainerRef: React.RefObject<HTMLDivElement>
}

async function performLineCreation({
  lineName,
  parentLineId,
  lines,
  setLines,
  setSelectedBaseMessage,
  setSelectedMessages,
  setIsSelectionMode,
  currentLineId,
  saveScrollPosition,
  setCurrentLineId,
  onLineChange,
  clearTimelineCaches,
  clearAllCaches,
  setFooterKey,
  messagesContainerRef
}: PerformLineCreationArgs): Promise<string> {
  if (parentLineId && !lines[parentLineId]) {
    alert('指定された親ラインが見つかりません')
    throw new Error('PARENT_LINE_NOT_FOUND')
  }

  const newLineId = await createNewBranch({ name: lineName, parent_line_id: parentLineId })

  const timestamp = new Date().toISOString()
  const newLine: Line = {
    id: newLineId,
    name: lineName,
    parent_line_id: parentLineId,
    tagIds: [],
    created_at: timestamp,
    updated_at: timestamp,
  }

  setLines(prev => ({
    ...prev,
    [newLineId]: newLine
  }))

  setSelectedBaseMessage(null)
  setSelectedMessages(new Set())
  setIsSelectionMode(false)

  if (currentLineId) {
    saveScrollPosition(currentLineId)
  }

  setCurrentLineId(newLineId)
  if (onLineChange) {
    onLineChange(newLineId)
  }

  clearTimelineCaches()
  clearAllCaches()
  setFooterKey(prev => prev + 1)

  if (messagesContainerRef.current) {
    messagesContainerRef.current.scrollTop = 0
  }

  return newLineId
}

interface UseLineCrudProps extends BaseLineCrudState {
  saveScrollPosition: (lineId: string) => void
}

export function useLineCrud({
  lines,
  messages,
  currentLineId,
  setLines,
  setMessages,
  setSelectedBaseMessage,
  setSelectedMessages,
  setIsSelectionMode,
  setShowMoveDialog,
  setShowBulkDeleteDialog,
  setScrollPositions,
  setCurrentLineId,
  onLineChange,
  saveScrollPosition,
  clearTimelineCaches,
  clearAllCaches,
  setFooterKey,
  messagesContainerRef
}: UseLineCrudProps) {
  const [isUpdating, setIsUpdating] = useState(false)

  const handleCreateLine = useCallback(async (lineName: string, parentLineId: string | null = null) => {
    const trimmedName = lineName.trim()
    if (!trimmedName) {
      alert('ライン名を入力してください')
      throw new Error('LINE_NAME_REQUIRED')
    }

    setIsUpdating(true)
    try {
      const newLineId = await performLineCreation({
        lineName: trimmedName,
        parentLineId,
        lines,
        setLines,
        setSelectedBaseMessage,
        setSelectedMessages,
        setIsSelectionMode,
        currentLineId,
        saveScrollPosition,
        setCurrentLineId,
        onLineChange,
        clearTimelineCaches,
        clearAllCaches,
        setFooterKey,
        messagesContainerRef
      })

      return newLineId
    } catch (error) {
      console.error('Failed to create line:', error)
      if (!(error instanceof Error && (
        error.message === 'PARENT_LINE_NOT_FOUND' ||
        error.message === 'LINE_NAME_REQUIRED'
      ))) {
        alert('ラインの作成に失敗しました')
      }
      throw error
    } finally {
      setIsUpdating(false)
    }
  }, [lines, setLines, setSelectedBaseMessage, setSelectedMessages, setIsSelectionMode, currentLineId, saveScrollPosition, setCurrentLineId, onLineChange, clearTimelineCaches, clearAllCaches, setFooterKey, messagesContainerRef])

  const handleDeleteLine = useCallback(async (lineId: string) => {
    if (!lineId) {
      throw new Error('LINE_ID_REQUIRED')
    }

    setIsUpdating(true)
    try {
      await performLineDeletion({
        lineId,
        lines,
        messages,
        currentLineId,
        setLines,
        setMessages,
        setSelectedBaseMessage,
        setSelectedMessages,
        setIsSelectionMode,
        setShowMoveDialog,
        setShowBulkDeleteDialog,
        setScrollPositions,
        setCurrentLineId,
        onLineChange,
        messagesContainerRef,
        clearTimelineCaches,
        clearAllCaches,
        setFooterKey
      })
    } catch (error) {
      console.error('Failed to delete line:', error)
      if (error instanceof Error && (
        error.message === 'LINE_MAIN_PROTECTED' ||
        error.message === 'LINE_NOT_FOUND' ||
        error.message === 'LINE_HAS_CHILDREN' ||
        error.message === 'LINE_DELETE_UNSUPPORTED' ||
        error.message === 'LINE_ID_REQUIRED'
      )) {
        throw error
      }
      throw new Error('LINE_DELETE_FAILED')
    } finally {
      setIsUpdating(false)
    }
  }, [lines, messages, currentLineId, setLines, setMessages, setSelectedBaseMessage, setSelectedMessages, setIsSelectionMode, setShowMoveDialog, setShowBulkDeleteDialog, setScrollPositions, setCurrentLineId, onLineChange, messagesContainerRef, clearTimelineCaches, clearAllCaches, setFooterKey])

  return {
    handleCreateLine,
    handleDeleteLine,
    isUpdating
  }
}


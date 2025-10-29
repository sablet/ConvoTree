import { useState, useEffect, useMemo, useCallback } from "react"
import { toast } from "sonner"
import type { Line } from "@/lib/types"
import type { DeleteOption } from "./LineSidebarDeleteLineForm"
import { COLLAPSED_KEY, EXPANDED_LINES_KEY } from "./useLineSidebarExpansion"

function getErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'ラインの削除に失敗しました'
  }

  switch (error.message) {
    case 'LINE_ID_REQUIRED':
      return '削除するラインを選択してください'
    case 'LINE_NOT_FOUND':
      return '選択したラインが見つかりません'
    case 'LINE_MAIN_PROTECTED':
      return 'メインラインは削除できません'
    case 'LINE_HAS_CHILDREN':
      return '子ラインが存在するラインは削除できません'
    case 'LINE_DELETE_UNSUPPORTED':
      return '現在のデータソースではライン削除をサポートしていません'
    case 'LINE_DELETE_FAILED':
      return 'ラインの削除に失敗しました'
    default:
      return error.message || 'ラインの削除に失敗しました'
  }
}

function validateDeletion(
  selectedDeleteLineId: string,
  deleteOptions: DeleteOption[]
): { valid: boolean; errorMessage?: string } {
  if (!selectedDeleteLineId) {
    return { valid: false, errorMessage: '削除するラインを選択してください' }
  }

  const option = deleteOptions.find(item => item.id === selectedDeleteLineId)
  if (!option) {
    return { valid: false, errorMessage: '選択したラインが見つかりません' }
  }

  if (option.disabled) {
    const message = option.hasChildren
      ? '子ラインが存在するため、このラインは削除できません'
      : 'このラインは削除できません'
    return { valid: false, errorMessage: message }
  }

  return { valid: true }
}

interface UseLineDeletionControlsArgs {
  deleteOptions: DeleteOption[]
  lines: Record<string, Line>
  onDeleteLine: (lineId: string) => Promise<void>
  isCollapsed: boolean
  setIsCollapsed: (value: boolean) => void
  setExpandedLines: React.Dispatch<React.SetStateAction<Set<string>>>
}

export function useLineDeletionControls({
  deleteOptions,
  lines,
  onDeleteLine,
  isCollapsed,
  setIsCollapsed,
  setExpandedLines
}: UseLineDeletionControlsArgs) {
  const [isDeletingLine, setIsDeletingLine] = useState(false)
  const [selectedDeleteLineId, setSelectedDeleteLineId] = useState<string>("")
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    if (!isDeletingLine) {
      return
    }

    const selectedOption = deleteOptions.find(option => option.id === selectedDeleteLineId && !option.disabled)
    if (selectedOption) {
      return
    }

    const firstAvailable = deleteOptions.find(option => !option.disabled)
    setSelectedDeleteLineId(firstAvailable?.id ?? "")
  }, [isDeletingLine, deleteOptions, selectedDeleteLineId])

  const hasDeletableLines = useMemo(() => deleteOptions.some(option => !option.disabled), [deleteOptions])

  const cancelDeletion = useCallback(() => {
    if (isDeleting) return
    setIsDeletingLine(false)
    setSelectedDeleteLineId("")
  }, [isDeleting])

  const startDeletion = useCallback((onBeforeOpen?: () => void) => {
    if (isDeleting) return
    if (!hasDeletableLines) return

    const toggleForm = () => {
      if (isDeletingLine) {
        setIsDeletingLine(false)
        setSelectedDeleteLineId("")
      } else {
        onBeforeOpen?.()
        setIsDeletingLine(true)
      }
    }

    if (isCollapsed) {
      setIsCollapsed(false)
      window.localStorage.setItem(COLLAPSED_KEY, 'false')
      setTimeout(toggleForm, 0)
    } else {
      toggleForm()
    }
  }, [hasDeletableLines, isCollapsed, isDeleting, isDeletingLine, setIsCollapsed])

  const submitDeletion = useCallback(async () => {
    if (isDeleting) return

    const validation = validateDeletion(selectedDeleteLineId, deleteOptions)
    if (!validation.valid) {
      toast.error(validation.errorMessage ?? 'エラーが発生しました')
      return
    }

    const lineName = lines[selectedDeleteLineId]?.name ?? ''
    setIsDeleting(true)
    try {
      await onDeleteLine(selectedDeleteLineId)
      setExpandedLines(prev => {
        const newSet = new Set(prev)
        newSet.delete(selectedDeleteLineId)
        window.localStorage.setItem(EXPANDED_LINES_KEY, JSON.stringify(Array.from(newSet)))
        return newSet
      })
      setIsDeletingLine(false)
      setSelectedDeleteLineId("")
      toast.success(`ライン「${lineName || selectedDeleteLineId}」を削除しました`)
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setIsDeleting(false)
    }
  }, [isDeleting, selectedDeleteLineId, deleteOptions, lines, onDeleteLine, setExpandedLines])

  return {
    isDeletingLine,
    isDeleting,
    selectedDeleteLineId,
    hasDeletableLines,
    startDeletion,
    cancelDeletion,
    submitDeletion,
    setSelectedDeleteLineId
  }
}



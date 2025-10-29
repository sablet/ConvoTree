import { useState, useCallback } from 'react'
import type { Line, Tag } from '@/lib/types'
import { saveLineEdit, updateLocalLineState, createNewTag, type LineEditData } from './line-edit'

interface UseLineEditingProps {
  currentLineId: string
  getCurrentLine: () => Line | null
  setLines: React.Dispatch<React.SetStateAction<Record<string, Line>>>
  setTags: React.Dispatch<React.SetStateAction<Record<string, Tag>>>
  clearAllCaches: () => void
}

export function useLineEditing({
  currentLineId,
  getCurrentLine,
  setLines,
  setTags,
  clearAllCaches
}: UseLineEditingProps) {
  const [isEditingBranch, setIsEditingBranch] = useState(false)
  const [editingBranchData, setEditingBranchData] = useState<LineEditData>({ 
    name: "", 
    tagIds: [], 
    newTag: "" 
  })
  const [isUpdating, setIsUpdating] = useState(false)

  const handleEditLine = useCallback(() => {
    const currentLineInfo = getCurrentLine()
    if (currentLineInfo) {
      setEditingBranchData({
        name: currentLineInfo.name,
        tagIds: [...(currentLineInfo.tagIds || [])],
        newTag: ""
      })
      setIsEditingBranch(true)
    }
  }, [getCurrentLine])

  const handleSaveLineEdit = useCallback(async () => {
    setIsUpdating(true)
    try {
      await saveLineEdit(currentLineId, editingBranchData)
      updateLocalLineState(currentLineId, editingBranchData, setLines)
      clearAllCaches()
      setIsEditingBranch(false)
    } catch (error) {
      console.error("Failed to save line edit:", error)
      alert("ラインの保存に失敗しました。")
    } finally {
      setIsUpdating(false)
    }
  }, [editingBranchData, currentLineId, setLines, clearAllCaches])

  const handleAddTag = useCallback(() => {
    if (editingBranchData.newTag.trim()) {
      const newTagId = createNewTag(editingBranchData.newTag, setTags)
      setEditingBranchData(prev => ({
        ...prev,
        tagIds: [...prev.tagIds, newTagId],
        newTag: ""
      }))
    }
  }, [editingBranchData, setTags])

  const handleRemoveTag = useCallback((tagIndex: number) => {
    setEditingBranchData(prev => ({
      ...prev,
      tagIds: prev.tagIds.filter((_, index) => index !== tagIndex)
    }))
  }, [])

  return {
    isEditingBranch,
    editingBranchData,
    isUpdating,
    handleEditLine,
    handleSaveLineEdit,
    handleAddTag,
    handleRemoveTag,
    setIsEditingBranch,
    setEditingBranchData
  }
}


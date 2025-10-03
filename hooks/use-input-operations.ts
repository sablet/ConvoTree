import { useState, useCallback, useRef, useEffect } from "react"
import type { useMessageOperations } from "./use-message-operations"
import type { useBranchOperations } from "./use-branch-operations"
import { TIMELINE_BRANCH_ID } from "@/lib/constants"

interface UseInputOperationsProps {
  messageOps: ReturnType<typeof useMessageOperations>
  branchOps: ReturnType<typeof useBranchOperations>
  currentLineId: string
  lines: Record<string, { id: string; name: string }>
}

/**
 * Input operations custom hook
 *
 * Handles user input, image paste, and message sending
 */
export function useInputOperations({
  messageOps,
  branchOps,
  currentLineId,
  lines
}: UseInputOperationsProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [inputValue, setInputValue] = useState("")
  const [pendingImages, setPendingImages] = useState<string[]>([])
  const [selectedBaseMessage, setSelectedBaseMessage] = useState<string | null>(null)

  // Textarea auto-resize
  const adjustTextareaHeight = useCallback(() => {
    if (textareaRef.current) {
      const textarea = textareaRef.current
      textarea.style.height = 'auto'
      const newHeight = Math.min(Math.max(textarea.scrollHeight, 80), 128)
      textarea.style.height = `${newHeight}px`
    }
  }, [])

  // Image paste handler
  const handlePaste = useCallback(async (e: ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) {
          try {
            const imageUrl = await messageOps.handleImageFile(file)
            setPendingImages(prev => [...prev, imageUrl])
          } catch (error) {
            console.error('Failed to handle pasted image:', error)
            alert('画像の処理に失敗しました')
          }
        }
      }
    }
  }, [messageOps])

  // Send message handler
  const handleSendMessage = useCallback(async () => {
    if (!inputValue.trim() && pendingImages.length === 0) return

    // タイムライン仮想ブランチの場合はメインラインに投稿
    let actualTargetLineId = currentLineId
    if (currentLineId === TIMELINE_BRANCH_ID) {
      const mainLine = Object.values(lines).find(line => line.id === 'main')
      if (!mainLine) {
        alert('メインラインが見つかりません')
        return
      }
      actualTargetLineId = mainLine.id
    }

    await messageOps.handleSendMessage(
      inputValue,
      pendingImages,
      selectedBaseMessage,
      actualTargetLineId,
      branchOps.completeTimeline
    )

    // Clear input state
    setInputValue("")
    setPendingImages([])
    setSelectedBaseMessage(null)

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = '80px'
    }

    // Update footer on new line creation
    if (selectedBaseMessage) {
      branchOps.setFooterKey(prev => prev + 1)
    }
  }, [inputValue, pendingImages, selectedBaseMessage, currentLineId, lines, messageOps, branchOps.completeTimeline, branchOps.setFooterKey])

  // Effects
  useEffect(() => {
    adjustTextareaHeight()
  }, [inputValue, adjustTextareaHeight])

  useEffect(() => {
    const pasteHandler = (e: Event) => {
      handlePaste(e as ClipboardEvent)
    }
    document.addEventListener('paste', pasteHandler)
    return () => {
      document.removeEventListener('paste', pasteHandler)
    }
  }, [handlePaste])

  return {
    textareaRef,
    inputValue,
    setInputValue,
    pendingImages,
    setPendingImages,
    selectedBaseMessage,
    setSelectedBaseMessage,
    adjustTextareaHeight,
    handlePaste,
    handleSendMessage
  }
}

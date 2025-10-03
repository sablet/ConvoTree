"use client"

import { Button } from "@/components/ui/button"

interface SelectionToolbarProps {
  isSelectionMode: boolean
  selectedMessagesCount: number
  isUpdating: boolean
  onToggleSelectionMode: () => void
  onMoveMessages: () => void
  onClearSelection: () => void
}

/**
 * SelectionToolbar Component
 *
 * Displays toolbar for message selection mode
 */
export function SelectionToolbar({
  isSelectionMode,
  selectedMessagesCount,
  isUpdating,
  onToggleSelectionMode,
  onMoveMessages,
  onClearSelection
}: SelectionToolbarProps) {
  return (
    <div className="bg-yellow-50 -m-2 sm:-m-4 p-2 sm:p-4 border-t border-yellow-200">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-700">
            {selectedMessagesCount > 0 ? `${selectedMessagesCount}件選択中` : '選択モード'}
          </span>
          {selectedMessagesCount > 0 && (
            <Button
              onClick={onMoveMessages}
              size="sm"
              className="bg-blue-500 hover:bg-blue-600 text-white"
              disabled={isUpdating}
            >
              別ラインに移動
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          {selectedMessagesCount > 0 && (
            <Button
              onClick={onClearSelection}
              size="sm"
              variant="outline"
              disabled={isUpdating}
            >
              選択解除
            </Button>
          )}
          <Button
            onClick={onToggleSelectionMode}
            size="sm"
            variant={isSelectionMode ? "default" : "outline"}
            disabled={isUpdating}
          >
            {isSelectionMode ? '選択完了' : '選択モード'}
          </Button>
        </div>
      </div>
    </div>
  )
}

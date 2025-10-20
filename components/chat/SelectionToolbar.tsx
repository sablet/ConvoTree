"use client"

import { Button } from "@/components/ui/button"
import { CalendarPlus, Trash2 } from "lucide-react"

interface SelectionToolbarProps {
  isSelectionMode: boolean
  selectedMessagesCount: number
  isUpdating: boolean
  onToggleSelectionMode: () => void
  onToggleInsertMode: () => void
  onMoveMessages: () => void
  onDeleteMessages: () => void
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
  onToggleInsertMode,
  onMoveMessages,
  onDeleteMessages,
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
            <>
              <Button
                onClick={onMoveMessages}
                size="sm"
                className="bg-blue-500 hover:bg-blue-600 text-white"
                disabled={isUpdating}
              >
                別ラインに移動
              </Button>
              <Button
                onClick={onDeleteMessages}
                size="sm"
                className="bg-red-500 hover:bg-red-600 text-white"
                disabled={isUpdating}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                一括削除
              </Button>
            </>
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
            onClick={onToggleInsertMode}
            size="sm"
            variant="outline"
            disabled={isUpdating}
            title="タイムライン挿入モード"
          >
            <CalendarPlus className="h-4 w-4" />
          </Button>
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

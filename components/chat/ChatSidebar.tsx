"use client"

import type { Line } from "@/lib/types"

interface ChatSidebarProps {
  isSelectionMode: boolean
  selectedMessagesCount: number
  currentLineId: string
  lines: Record<string, Line>
  isUpdating: boolean
  onToggleSelectionMode: () => void
  onMoveMessages: () => void
  onClearSelection: () => void
  onSwitchLine: (lineId: string) => void
}

/**
 * ChatSidebar Component
 *
 * Sidebar content for hamburger menu
 */
export function ChatSidebar({
  isSelectionMode,
  selectedMessagesCount,
  currentLineId,
  lines,
  isUpdating,
  onToggleSelectionMode,
  onMoveMessages,
  onClearSelection,
  onSwitchLine
}: ChatSidebarProps) {
  return (
    <div className="space-y-4">
      {/* メッセージ選択ツール */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-2">メッセージ操作</h3>
        <div className="space-y-2">
          <button
            onClick={onToggleSelectionMode}
            className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
              isSelectionMode
                ? 'bg-blue-100 text-blue-900 border border-blue-200'
                : 'hover:bg-gray-100 text-gray-700 border border-gray-200'
            }`}
            disabled={isUpdating}
          >
            {isSelectionMode ? '選択モード終了' : 'メッセージ選択モード'}
          </button>
          {selectedMessagesCount > 0 && (
            <div className="space-y-1">
              <button
                onClick={onMoveMessages}
                className="w-full text-left px-3 py-2 rounded-md text-sm bg-blue-500 hover:bg-blue-600 text-white transition-colors"
                disabled={isUpdating}
              >
                {selectedMessagesCount}件を別ラインに移動
              </button>
              <button
                onClick={onClearSelection}
                className="w-full text-left px-3 py-2 rounded-md text-sm border border-gray-200 hover:bg-gray-100 text-gray-700 transition-colors"
                disabled={isUpdating}
              >
                選択解除
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ライン管理 */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-2">ライン管理</h3>
        <div className="space-y-1 max-h-60 overflow-y-auto">
          {Object.values(lines).map((line) => {
            const isActive = line.id === currentLineId
            return (
              <button
                key={line.id}
                onClick={() => onSwitchLine(line.id)}
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive
                    ? 'bg-blue-100 text-blue-900 border border-blue-200'
                    : 'hover:bg-gray-100 text-gray-700'
                }`}
              >
                <div className="font-medium truncate">{line.name}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {line.messageIds.length}件のメッセージ
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

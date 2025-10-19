import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Edit3, CheckSquare, CalendarPlus, Link2 } from "lucide-react"
import type { Line, Message, Tag } from "@/lib/types"

interface ChatHeaderProps {
  currentLine: Line | null
  messages: Record<string, Message>
  tags: Record<string, Tag>
  onEditLine: () => void
  onToggleSelectionMode?: () => void
  onToggleInsertMode?: () => void
  onToggleLineConnection?: () => void
  isSelectionMode?: boolean
}

/**
 * ChatHeader Component
 *
 * Displays current line information with edit button
 */
export function ChatHeader({
  currentLine,
  messages,
  tags,
  onEditLine,
  onToggleSelectionMode,
  onToggleInsertMode,
  onToggleLineConnection,
  isSelectionMode = false
}: ChatHeaderProps) {
  if (!currentLine) return null

  return (
    <div className="px-2 sm:px-4 py-3 border-b border-gray-100 bg-gray-50">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-medium text-gray-800">{currentLine.name}</h2>
          {currentLine.branchFromMessageId && (
            <p className="text-xs text-blue-500">
              分岐元: {messages[currentLine.branchFromMessageId]?.content.slice(0, 20)}...
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {onToggleSelectionMode && (
            <Button
              variant={isSelectionMode ? "default" : "ghost"}
              size="sm"
              onClick={onToggleSelectionMode}
              className={`h-8 px-2 ${isSelectionMode ? 'bg-blue-500 hover:bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-600'}`}
              title="メッセージ選択モード"
            >
              <CheckSquare className="h-4 w-4" />
            </Button>
          )}
          {onToggleInsertMode && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleInsertMode}
              className="h-8 px-2 text-gray-400 hover:text-gray-600"
              title="タイムライン挿入モード"
            >
              <CalendarPlus className="h-4 w-4" />
            </Button>
          )}
          {onToggleLineConnection && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleLineConnection}
              className="h-8 px-2 text-gray-400 hover:text-gray-600"
              title="ライン接続"
            >
              <Link2 className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onEditLine}
            className="h-8 px-2 text-gray-400 hover:text-gray-600"
            title="ライン編集"
          >
            <Edit3 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {currentLine.tagIds && currentLine.tagIds.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {currentLine.tagIds.map((tagId, tagIndex) => {
            const tag = tags[tagId]
            if (!tag) return null
            return (
              <Badge
                key={`current-line-tag-${tagIndex}`}
                variant="secondary"
                className="text-xs bg-emerald-100 text-emerald-700"
              >
                {tag.name}
              </Badge>
            )
          })}
        </div>
      )}
    </div>
  )
}

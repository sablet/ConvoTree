import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Edit3, CheckSquare, CalendarPlus, Link2, Copy, Menu } from "lucide-react"
import type { Line, Message, Tag } from "@/lib/types"
import { useState } from "react"
import { toast } from "sonner"

interface ChatHeaderProps {
  currentLine: Line | null
  messages: Record<string, Message>
  lines: Record<string, Line>
  tags: Record<string, Tag>
  getLineAncestry: (lineId: string) => string[]
  onEditLine: () => void
  onToggleSelectionMode?: () => void
  onToggleInsertMode?: () => void
  onToggleLineConnection?: () => void
  onToggleSidebar?: () => void
  showSidebarButton?: boolean
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
  lines,
  tags,
  getLineAncestry,
  onEditLine,
  onToggleSelectionMode,
  onToggleInsertMode,
  onToggleLineConnection,
  onToggleSidebar,
  showSidebarButton = false,
  isSelectionMode = false
}: ChatHeaderProps) {
  const [copied, setCopied] = useState(false)

  if (!currentLine) return null

  const handleCopyLineMessages = async () => {
    if (!currentLine.messageIds || currentLine.messageIds.length === 0) {
      return
    }

    // Generate breadcrumb header like export script
    const ancestry = getLineAncestry(currentLine.id)
    const fullLineChain = [...ancestry, currentLine.id]
    const breadcrumbs = fullLineChain
      .map(id => lines[id]?.name)
      .filter(Boolean)
      .join(' > ')

    // Get messages for this line and format them like the export script
    const lineMessages = currentLine.messageIds
      .map(msgId => messages[msgId])
      .filter(msg => msg && msg.content)

    const formattedMessages = lineMessages.map(msg => {
      // Format timestamp (YYYY-MM-DD HH:MM:SS)
      const date = new Date(msg.timestamp)
      const timestamp = date.toISOString().replace('T', ' ').substring(0, 19)

      // Get type
      const type = msg.type || 'text'

      // Process content: replace newlines and truncate if needed
      let content = msg.content.replace(/\n/g, '\\n')
      if (content.length > 200) {
        content = `${content.substring(0, 100)}...`
      }
      // Escape double quotes for CSV compatibility
      content = content.replace(/"/g, '""')

      // Filter metadata to only include relevant properties
      const filteredMetadata: Record<string, unknown> = {}
      if (msg.metadata) {
        // Task properties
        if (msg.metadata.priority !== undefined) filteredMetadata.priority = msg.metadata.priority
        if (msg.metadata.completed !== undefined) filteredMetadata.completed = msg.metadata.completed
        if (msg.metadata.completedAt !== undefined) filteredMetadata.completedAt = msg.metadata.completedAt

        // Session properties
        if (msg.metadata.checkedInAt !== undefined) filteredMetadata.checkedInAt = msg.metadata.checkedInAt
        if (msg.metadata.checkedOutAt !== undefined) filteredMetadata.checkedOutAt = msg.metadata.checkedOutAt
        if (msg.metadata.timeSpent !== undefined) filteredMetadata.timeSpent = msg.metadata.timeSpent
      }

      // Serialize metadata as JSON string
      let metadataStr = ''
      if (Object.keys(filteredMetadata).length > 0) {
        metadataStr = JSON.stringify(filteredMetadata)
      }

      // Build output line: timestamp, content, type, metadata
      const escapedMetadata = metadataStr.replace(/"/g, '""')
      return `* ${timestamp}, "${content}", ${type}, "${escapedMetadata}"`
    }).join('\n')

    // Combine breadcrumb header with messages
    const outputText = `## ${breadcrumbs}\n${formattedMessages}`

    try {
      await navigator.clipboard.writeText(outputText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast.success('ラインのメッセージをコピーしました')
    } catch (err) {
      console.error('Failed to copy:', err)
      toast.error('コピーに失敗しました')
    }
  }

  return (
    <div className="px-2 sm:px-4 py-3 border-b border-gray-100 bg-gray-50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {showSidebarButton && onToggleSidebar && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleSidebar}
              className="h-8 w-8 p-0 bg-white border border-gray-300 hover:bg-gray-50 text-gray-600 shadow-sm"
              title="ラインサイドバーを開く"
            >
              <Menu className="h-4 w-4" />
            </Button>
          )}
          <div>
            <h2 className="font-medium text-gray-800">{currentLine.name}</h2>
            {currentLine.branchFromMessageId && (
              <p className="text-xs text-blue-500">
                分岐元: {messages[currentLine.branchFromMessageId]?.content.slice(0, 20)}...
              </p>
            )}
          </div>
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
            onClick={handleCopyLineMessages}
            className={`h-8 px-2 ${copied ? 'text-green-500' : 'text-gray-400 hover:text-gray-600'}`}
            title="ラインのメッセージをコピー"
          >
            <Copy className="h-4 w-4" />
          </Button>
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

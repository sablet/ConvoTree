import { GitBranch } from "lucide-react"
import type { Line, Message, Tag } from "@/lib/types"

interface BranchingLinesPanelProps {
  branchingLines: Line[]
  currentLineId: string
  messages: Record<string, Message>
  tags: Record<string, Tag>
  messageId: string
  onSwitchLine: (lineId: string) => void
  getRelativeTime: (dateString: string) => string
}

/**
 * 分岐ライン表示パネルコンポーネント
 */
export function BranchingLinesPanel({
  branchingLines,
  currentLineId,
  messages,
  tags,
  messageId,
  onSwitchLine,
  getRelativeTime
}: BranchingLinesPanelProps) {
  if (branchingLines.length === 0) {
    return null
  }

  return (
    <div className="ml-4 space-y-2 border-l-2 border-gray-200 pl-3">
      <div className="flex items-center gap-2 mb-3">
        <GitBranch className="h-3 w-3 text-emerald-500" />
        <span className="text-xs text-gray-500">分岐しました（{branchingLines.length}ライン）</span>
      </div>
      <div className="space-y-1">
        {branchingLines.map((line) => {
          const isCurrentLine = line.id === currentLineId
          const lastMessageId = line.endMessageId || line.messageIds[line.messageIds.length - 1]
          const lastMessage = lastMessageId ? messages[lastMessageId] : null
          const lastMessagePreview = lastMessage?.content ? lastMessage.content.slice(0, 18) + (lastMessage.content.length > 18 ? "..." : "") : ""
          const firstTagId = line.tagIds?.[0]
          const firstTag = firstTagId ? tags[firstTagId] : null
          const relativeTime = line.updated_at ? getRelativeTime(line.updated_at) : (line.created_at ? getRelativeTime(line.created_at) : "")

          return (
            <div
              key={`${messageId}-line-${line.id}`}
              className={`w-full text-left rounded-lg transition-all duration-200 relative group ${
                isCurrentLine
                  ? 'bg-emerald-100 border-2 border-emerald-300 text-emerald-800'
                  : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent text-gray-700 hover:text-gray-900'
              }`}
            >
              <div
                onClick={(e) => {
                  e.stopPropagation()
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  onSwitchLine(line.id)
                }}
                className="px-3 py-2 w-full cursor-pointer"
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-1.5 h-1.5 rounded-full border flex-shrink-0 ${
                    isCurrentLine ? 'bg-emerald-500 border-emerald-500' : 'border-gray-400'
                  }`}></div>
                  <span className={`font-medium text-sm truncate ${isCurrentLine ? 'text-emerald-700' : 'text-gray-900'}`}>
                    {line.name}
                  </span>
                  {firstTag && (
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      isCurrentLine ? 'bg-emerald-200 text-emerald-600' : 'bg-gray-200 text-gray-500'
                    }`}>
                      {firstTag.name}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className={`truncate flex-1 ${isCurrentLine ? 'text-emerald-600' : 'text-gray-500'}`}>
                    {lastMessagePreview}
                  </span>
                  <span className={`text-xs flex-shrink-0 ${isCurrentLine ? 'text-emerald-500' : 'text-gray-400'}`}>
                    {relativeTime}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

"use client"

import { Badge } from "@/components/ui/badge"

interface Message {
  id: string
  content: string
  timestamp: Date
  lineId: string
  prevInLine?: string
  nextInLine?: string
  branchFromMessageId?: string
  tags?: string[]
  hasBookmark?: boolean
  author?: string
  images?: string[]
}

interface Line {
  id: string
  name: string
  messageIds: string[]
  startMessageId: string
  endMessageId?: string
  branchFromMessageId?: string
  tagIds?: string[]
  created_at: string
  updated_at: string
}


interface BranchPoint {
  messageId: string
  lines: string[]
}

interface RecentLinesFooterProps {
  lines: Record<string, Line>
  messages: Record<string, Message>
  currentLineId: string
  branchPoints?: Record<string, BranchPoint>
  onLineSelect: (lineId: string) => void
}

export function RecentLinesFooter({
  lines,
  messages,
  currentLineId,
  branchPoints = {},
  onLineSelect
}: RecentLinesFooterProps) {
  // メインブランチを取得
  const getMainLine = (): Line | null => {
    return Object.values(lines).find(line => line.id === 'main') || null
  }

  // 最近更新されたラインを取得（現在のラインとメインラインを除く）
  const getRecentLines = (): Line[] => {
    const allLines = Object.values(lines)
      .filter(line =>
        line.id !== currentLineId && // 現在のラインを除外
        line.id !== 'main' // メインラインを除外（別途固定表示）
      )
      .sort((a, b) => {
        const dateA = new Date(a.updated_at || a.created_at)
        const dateB = new Date(b.updated_at || b.created_at)
        return dateB.getTime() - dateA.getTime()
      })

    return allLines.slice(0, 10) // 最新10件表示
  }

  const getRelativeTime = (dateString: string): string => {
    if (!dateString) return ""

    const now = new Date()
    const date = new Date(dateString)

    if (isNaN(date.getTime())) return ""

    const diffMs = now.getTime() - date.getTime()
    const diffMinutes = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffMinutes < 1) return "今"
    if (diffMinutes < 60) return `${diffMinutes}分前`
    if (diffHours < 24) return `${diffHours}時間前`
    if (diffDays < 30) return `${diffDays}日前`

    const diffMonths = Math.floor(diffDays / 30)
    return `${diffMonths}ヶ月前`
  }

  // ラインの祖先チェーンを取得して階層表示を生成
  const getLineAncestry = (lineId: string): string[] => {
    const line = lines[lineId]
    if (!line) return []

    let ancestry: string[] = []

    // 分岐元がある場合は親ラインの祖先を取得
    if (line.branchFromMessageId) {
      const branchFromMessage = messages[line.branchFromMessageId]
      if (branchFromMessage) {
        const parentLineId = branchFromMessage.lineId
        const parentAncestry = getLineAncestry(parentLineId)
        const parentLine = lines[parentLineId]
        if (parentLine && parentLine.id !== 'main') { // メインライン（メインの流れ）は除外
          ancestry = [...parentAncestry, parentLine.name]
        } else {
          ancestry = [...parentAncestry] // メインラインの場合は名前を追加せず祖先のみ
        }
      }
    }

    return ancestry
  }

  // ラインの分岐情報を含む名前を生成
  const getLineDisplayInfo = (line: Line): { name: string, ancestry: string, branchCount: number } => {
    const name = line.name
    const ancestry = getLineAncestry(line.id)

    // 分岐点情報を取得（このラインから分岐している場合）
    const lastMessageId = line.endMessageId || line.messageIds[line.messageIds.length - 1]
    const branchCount = (lastMessageId && branchPoints[lastMessageId])
      ? branchPoints[lastMessageId].lines.length
      : 0

    return {
      name,
      ancestry: ancestry.join('>'),
      branchCount
    }
  }

  const mainLine = getMainLine()
  const recentLines = getRecentLines()

  // メインラインと最近のラインがどちらもない場合は表示しない
  if (!mainLine && recentLines.length === 0) {
    return null
  }

  // ラインアイテムをレンダリングする共通関数
  const renderLineItem = (line: Line, isMain: boolean = false) => {
    const lastMessageId = line.endMessageId || line.messageIds[line.messageIds.length - 1]
    const lastMessage = lastMessageId ? messages[lastMessageId] : null
    const lastMessagePreview = lastMessage?.content
      ? lastMessage.content.slice(0, 20) + (lastMessage.content.length > 20 ? "..." : "")
      : ""
    const relativeTime = line.updated_at ? getRelativeTime(line.updated_at) : ""
    const displayInfo = getLineDisplayInfo(line)

    return (
      <div
        key={line.id}
        onClick={() => onLineSelect(line.id)}
        className={`flex-shrink-0 border rounded-lg p-2 cursor-pointer transition-colors min-w-[180px] max-w-[240px] ${
          isMain
            ? 'bg-blue-50 hover:bg-blue-100 border-blue-200'
            : 'bg-gray-50 hover:bg-gray-100 border-gray-200'
        }`}
      >
        <div className="flex items-center gap-2 mb-1">
          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
            isMain ? 'bg-blue-600' : 'bg-blue-500'
          }`}></div>
          <span className="text-sm font-medium text-gray-900 flex-1 truncate">
            {displayInfo.name}
            {displayInfo.branchCount > 0 && (
              <span className="text-xs text-gray-500 font-normal ml-1">[+{displayInfo.branchCount}]</span>
            )}
          </span>
          {isMain && (
            <Badge variant="secondary" className="text-xs bg-blue-200 text-blue-800 px-1 py-0 flex-shrink-0">
              Main
            </Badge>
          )}
        </div>
        <div className="text-xs text-gray-500 space-y-1">
          {/* パンくずリスト表示（親階層がある場合のみ） */}
          {displayInfo.ancestry && (
            <div className="opacity-75 truncate">
              {displayInfo.ancestry} &gt;
            </div>
          )}
          {/* 最終メッセージと時刻 */}
          {(lastMessagePreview || relativeTime) && (
            <div className="truncate">
              {lastMessagePreview && relativeTime
                ? `${lastMessagePreview} • ${relativeTime}`
                : lastMessagePreview || relativeTime
              }
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-3 shadow-lg z-0">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-600">
          {mainLine ? 'メインブランチ・最近の更新' : '最近の更新'}
        </span>
        <span className="text-xs text-gray-400">
          {mainLine ? `Main + ${recentLines.length}件` : `${recentLines.length}件`}
        </span>
      </div>

      <div
        className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          // スムーズスクロールを有効化
          scrollBehavior: 'smooth'
        }}
      >
        {/* メインブランチを固定表示（現在のラインでない場合のみ） */}
        {mainLine && mainLine.id !== currentLineId && renderLineItem(mainLine, true)}

        {/* 最近のラインを表示 */}
        {recentLines.map((line) => renderLineItem(line, false))}
      </div>

      <style jsx>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  )
}
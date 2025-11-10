"use client"

import { Badge } from "@/components/ui/badge"
import type { Message, Line } from "@/lib/types"
import { formatRelativeTime } from "@/lib/utils/date"
import { MAIN_LINE_ID, TIMELINE_BRANCH_ID } from "@/lib/constants"
import { TIMELINE_BRANCH_NAME, BADGE_TIMELINE, BADGE_MAIN, FOOTER_LABEL_RECENT_LINES } from "@/lib/ui-strings"
import { getLineLastMessage, getParentLine, getChildLines } from "@/lib/data-helpers"

interface RecentLinesFooterProps {
  lines: Record<string, Line>
  messages: Record<string, Message>
  currentLineId: string
  onLineSelect: (lineId: string) => void
}

export function RecentLinesFooter({
  lines,
  messages,
  currentLineId,
  onLineSelect
}: RecentLinesFooterProps) {
  // メインブランチを取得
  const getMainLine = (): Line | null => {
    return Object.values(lines).find(line => line.id === MAIN_LINE_ID) || null
  }

  // 最近更新されたラインを取得（現在のラインとメインラインとタイムラインを除く）
  const getRecentLines = (): Line[] => {
    const allLines = Object.values(lines)
      .filter(line =>
        line.id !== currentLineId && // 現在のラインを除外
        line.id !== MAIN_LINE_ID && // メインラインを除外（別途固定表示）
        line.id !== TIMELINE_BRANCH_ID // タイムライン仮想ブランチを除外
      )
      .sort((a, b) => {
        const dateA = new Date(a.updated_at || a.created_at)
        const dateB = new Date(b.updated_at || b.created_at)
        return dateB.getTime() - dateA.getTime()
      })

    return allLines.slice(0, 30) // 最新30件表示
  }


  // ラインの祖先チェーンを取得して階層表示を生成
  const getLineAncestry = (lineId: string, visited: Set<string> = new Set()): string[] => {
    const line = lines[lineId]
    if (!line) return []

    // 循環参照検出
    if (visited.has(lineId)) {
      console.error(`Circular reference detected in line ancestry: ${lineId}`)
      return []
    }

    visited.add(lineId)

    let ancestry: string[] = []

    // 親ラインがある場合は親ラインの祖先を取得
    const parentLine = getParentLine(lines, lineId)
    if (parentLine) {
      const parentAncestry = getLineAncestry(parentLine.id, visited)
      if (parentLine.id !== MAIN_LINE_ID) { // メインライン（メインの流れ）は除外
        ancestry = [...parentAncestry, parentLine.name]
      } else {
        ancestry = [...parentAncestry] // メインラインの場合は名前を追加せず祖先のみ
      }
    }

    return ancestry
  }

  // ラインの分岐情報を含む名前を生成
  const getLineDisplayInfo = (line: Line): { name: string, ancestry: string, branchCount: number } => {
    // ライン名を13文字に制限
    const name = line.name.length > 13 ? `${line.name.slice(0, 13)}...` : line.name
    const ancestry = getLineAncestry(line.id)

    // 子ライン数を取得（このラインから分岐している場合）
    const childLines = getChildLines(lines, line.id)
    const branchCount = childLines.length

    return {
      name,
      ancestry: ancestry.join('>'),
      branchCount
    }
  }

  const mainLine = getMainLine()
  const recentLines = getRecentLines()

  // タイムライン仮想ブランチの作成
  const allMessagesCount = Object.keys(messages).length

  // メインラインと最近のラインがどちらもない場合は表示しない
  if (!mainLine && recentLines.length === 0) {
    return null
  }

  // 最終メッセージのプレビューテキストを生成
  const getLastMessagePreview = (line: Line): string => {
    const lastMessage = getLineLastMessage(messages, line.id)
    if (!lastMessage?.content) return ""
    return lastMessage.content.slice(0, 20) + (lastMessage.content.length > 20 ? "..." : "")
  }

  // 最終メッセージと時刻の表示テキストを生成
  const getMessageTimeText = (preview: string, time: string): string => {
    if (preview && time) return `${preview} • ${time}`
    return preview || time
  }

  // ラインアイテムをレンダリングする共通関数
  const renderLineItem = (line: Line, isMain: boolean = false) => {
    const lastMessagePreview = getLastMessagePreview(line)
    const relativeTime = line.updated_at ? formatRelativeTime(line.updated_at) : ""
    const displayInfo = getLineDisplayInfo(line)
    const containerClass = isMain
      ? 'bg-blue-50 hover:bg-blue-100 border-blue-200'
      : 'bg-gray-50 hover:bg-gray-100 border-gray-200'
    const dotClass = isMain ? 'bg-blue-600' : 'bg-blue-500'

    return (
      <div
        key={line.id}
        onClick={() => onLineSelect(line.id)}
        className={`flex-shrink-0 border rounded-lg p-2 cursor-pointer transition-colors min-w-[180px] max-w-[240px] ${containerClass}`}
      >
        <div className="flex items-center gap-2 mb-1">
          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotClass}`}></div>
          <span className="text-sm font-medium text-gray-900 flex-1 truncate">
            {displayInfo.name}
            {displayInfo.branchCount > 0 && (
              <span className="text-xs text-gray-500 font-normal ml-1">[+{displayInfo.branchCount}]</span>
            )}
          </span>
          {isMain && (
            <Badge variant="secondary" className="text-xs bg-blue-200 text-blue-800 px-1 py-0 flex-shrink-0">
              {BADGE_MAIN}
            </Badge>
          )}
        </div>
        <div className="text-xs text-gray-500 space-y-1">
          {displayInfo.ancestry && (
            <div className="opacity-75 truncate">
              {displayInfo.ancestry} &gt;
            </div>
          )}
          {(lastMessagePreview || relativeTime) && (
            <div className="truncate">
              {getMessageTimeText(lastMessagePreview, relativeTime)}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="p-3 overflow-hidden" style={{ maxWidth: '100%', width: '100%' }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-600">
          {FOOTER_LABEL_RECENT_LINES}
        </span>
        <span className="text-xs text-gray-400">
          {`Timeline + Main + ${recentLines.length}件`}
        </span>
      </div>

      <div
        className="flex gap-2 overflow-x-auto pb-1"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          scrollBehavior: 'smooth',
          maxWidth: '100%',
          width: '100%',
          flexWrap: 'nowrap',
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-x'
        }}
      >
        {/* タイムライン仮想ブランチを最左に固定表示（現在のラインでない場合のみ） */}
        {currentLineId !== TIMELINE_BRANCH_ID && (
          <div
            key={TIMELINE_BRANCH_ID}
            onClick={() => onLineSelect(TIMELINE_BRANCH_ID)}
            className="flex-shrink-0 border rounded-lg p-2 cursor-pointer transition-colors min-w-[180px] max-w-[240px] bg-purple-50 hover:bg-purple-100 border-purple-200"
          >
            <div className="flex items-center gap-2 mb-1">
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-purple-600"></div>
              <span className="text-sm font-medium text-gray-900 flex-1 truncate">
                {TIMELINE_BRANCH_NAME}
              </span>
              <Badge variant="secondary" className="text-xs bg-purple-200 text-purple-800 px-1 py-0 flex-shrink-0">
                {BADGE_TIMELINE}
              </Badge>
            </div>
            <div className="text-xs text-gray-500">
              {allMessagesCount}件のメッセージ（時系列順）
            </div>
          </div>
        )}

        {/* メインブランチを固定表示（現在のラインでない場合のみ） */}
        {mainLine && mainLine.id !== currentLineId && renderLineItem(mainLine, true)}

        {/* 最近のラインを表示 */}
        {recentLines.map((line) => renderLineItem(line, false))}
      </div>

    </div>
  )
}
"use client"

import { Message, Line } from "@/lib/types"

interface TimelineViewFooterProps {
  messages: Record<string, Message>
  lines: Record<string, Line>
  onLineSelect?: (lineId: string) => void
}

export function TimelineViewFooter({
  messages,
  lines,
  onLineSelect
}: TimelineViewFooterProps) {
  // 全メッセージを作成日時順にソート
  const sortedMessages = Object.values(messages).sort((a, b) => {
    return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  })

  // 前のメッセージと同じラインかどうかをチェック
  const shouldShowLineName = (currentIndex: number): boolean => {
    if (currentIndex === 0) return true
    const currentMessage = sortedMessages[currentIndex]
    const prevMessage = sortedMessages[currentIndex - 1]
    return currentMessage.lineId !== prevMessage.lineId
  }

  return (
    <div
      className="h-full overflow-y-auto overflow-x-hidden bg-gray-50 border-r-2 border-gray-300"
      style={{
        scrollbarWidth: 'thin',
        scrollbarColor: '#cbd5e0 #f7fafc'
      }}
    >
      {/* ヘッダー */}
      <div className="sticky top-0 bg-gray-100 border-b border-gray-300 px-2 py-1.5 z-10">
        <span className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide">
          Timeline
        </span>
      </div>

      <div className="p-2 space-y-1">
        {sortedMessages.map((message, index) => {
          const line = lines[message.lineId]
          const showLineName = shouldShowLineName(index)

          return (
            <div key={message.id} className="space-y-0.5">
              {/* ライン名表示（最初 or ライン切り替わり時のみ） */}
              {showLineName && (
                <div
                  className="text-[10px] text-gray-400 px-2 py-0.5 truncate cursor-pointer hover:text-gray-600"
                  onClick={() => line && onLineSelect?.(line.id)}
                  title={line?.name || message.lineId}
                >
                  {line?.name || message.lineId}
                </div>
              )}

              {/* メッセージ本体 */}
              <div
                className="text-xs text-gray-700 px-2 py-1 rounded hover:bg-gray-100 cursor-pointer truncate"
                onClick={() => line && onLineSelect?.(line.id)}
                title={message.content}
              >
                {message.content}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

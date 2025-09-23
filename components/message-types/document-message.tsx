"use client"

import { Button } from "@/components/ui/button"
import { ChevronDown, ChevronRight, FileText } from "lucide-react"

interface DocumentMessageData {
  isCollapsed: boolean
  summary?: string
  wordCount: number
  originalLength: number
}

interface DocumentMessageProps {
  messageId: string
  content: string
  data: DocumentMessageData
  onUpdate?: (data: DocumentMessageData) => void
  isEditable?: boolean
}

export function DocumentMessage({
  content,
  data,
  onUpdate
}: DocumentMessageProps) {
  const handleToggleCollapse = () => {
    if (onUpdate) {
      onUpdate({
        ...data,
        isCollapsed: !data.isCollapsed
      })
    }
  }

  const generateSummary = (content: string, maxLength: number = 100): string => {
    if (content.length <= maxLength) return content

    // 文の境界で切断を試みる
    const sentences = content.split(/[。！？\n]/)
    let summary = ''

    for (const sentence of sentences) {
      if ((summary + sentence).length > maxLength) {
        break
      }
      summary += sentence + (sentence.includes('\n') ? '' : '。')
    }

    return summary || content.slice(0, maxLength) + '...'
  }

  const displaySummary = data.summary || generateSummary(content)

  return (
    <div className="border border-blue-200 rounded-lg p-4 bg-blue-50">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-blue-600" />
          <span className="text-sm font-medium text-blue-800">
            ドキュメント
          </span>
          <span className="text-xs text-blue-600">
            ({data.wordCount}文字)
          </span>
        </div>

        <Button
          onClick={handleToggleCollapse}
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-blue-600 hover:bg-blue-100"
        >
          {data.isCollapsed ? (
            <>
              <ChevronRight className="h-3 w-3 mr-1" />
              <span className="text-xs">展開</span>
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3 mr-1" />
              <span className="text-xs">折りたたむ</span>
            </>
          )}
        </Button>
      </div>

      {/* コンテンツ */}
      {data.isCollapsed ? (
        <div className="space-y-2">
          <div className="text-sm text-gray-700 bg-white rounded p-3 border border-blue-200">
            {displaySummary}
          </div>
          <div className="text-xs text-blue-600">
            クリックして全文を表示
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-sm text-gray-700 bg-white rounded p-3 border border-blue-200 max-h-96 overflow-y-auto">
            <div className="whitespace-pre-wrap">{content}</div>
          </div>
          <div className="flex items-center justify-between text-xs text-blue-600">
            <span>全文表示中</span>
            <span>
              {Math.ceil(data.wordCount / 400)}分程度の読み時間
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
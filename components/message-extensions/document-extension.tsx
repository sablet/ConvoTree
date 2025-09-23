"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ChevronDown, ChevronRight, FileText, Edit3, X } from "lucide-react"

interface DocumentExtensionData {
  isCollapsed: boolean
  summary?: string
  wordCount: number
  originalLength: number
}

interface DocumentExtensionProps {
  messageId: string
  messageContent: string
  data: DocumentExtensionData
  onUpdate: (data: DocumentExtensionData) => void
  onDelete: () => void
}

export function DocumentExtension({
  messageId,
  messageContent,
  data,
  onUpdate,
  onDelete
}: DocumentExtensionProps) {
  const [isUpdating, setIsUpdating] = useState(false)

  const handleToggleCollapse = () => {
    if (isUpdating) return
    setIsUpdating(true)
    try {
      onUpdate({
        ...data,
        isCollapsed: !data.isCollapsed
      })
    } catch (error) {
      console.error('Failed to toggle document collapse:', error)
      alert('ドキュメントの更新に失敗しました')
    } finally {
      setIsUpdating(false)
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

  const displaySummary = data.summary || generateSummary(messageContent)

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-2">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-blue-600" />
          <span className="text-sm font-medium text-blue-800">
            長文ドキュメント
          </span>
          <span className="text-xs text-blue-600">
            ({data.wordCount}文字)
          </span>
        </div>

        <div className="flex items-center gap-1">
          <Button
            onClick={handleToggleCollapse}
            variant="ghost"
            size="sm"
            disabled={isUpdating}
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

          <Button
            onClick={onDelete}
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-gray-400 hover:text-red-600"
            title="削除"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* コンテンツ */}
      {data.isCollapsed ? (
        <div className="space-y-2">
          <div className="text-sm text-gray-700 bg-white rounded p-2 border">
            {displaySummary}
          </div>
          <div className="text-xs text-blue-600">
            クリックして全文を表示
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-sm text-gray-700 bg-white rounded p-2 border max-h-96 overflow-y-auto">
            <div className="whitespace-pre-wrap">{messageContent}</div>
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

// 長文検出とドキュメント拡張作成のヘルパー関数
export function shouldCreateDocumentExtension(content: string): boolean {
  // 500文字以上または10行以上の場合に長文と判定
  const wordThreshold = 500
  const lineThreshold = 10

  return content.length >= wordThreshold || content.split('\n').length >= lineThreshold
}

export function createDocumentExtensionData(content: string): DocumentExtensionData {
  return {
    isCollapsed: false, // 初期状態は展開
    wordCount: content.length,
    originalLength: content.length,
    summary: undefined // 自動生成されるため未設定
  }
}
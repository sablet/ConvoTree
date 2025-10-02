import type { Line } from "@/lib/types"

interface Timeline {
  messages: Array<{ lineId: string }>
  transitions: Array<{ index: number; lineId: string; lineName: string }>
}

interface MessageLineInfo {
  isLineStart: boolean
  isCurrentLine: boolean
  isEditable: boolean
  lineInfo: Line | null
  transitionInfo: { index: number; lineId: string; lineName: string } | null
}

/**
 * メッセージのライン情報を取得するヘルパー関数
 */
export function getMessageLineInfo(
  messageIndex: number,
  timeline: Timeline,
  lines: Record<string, Line>,
  currentLineId: string
): MessageLineInfo {
  const { transitions, messages } = timeline
  const message = messages[messageIndex]

  if (!message) {
    return {
      isLineStart: false,
      isCurrentLine: false,
      isEditable: false,
      lineInfo: null,
      transitionInfo: null
    }
  }

  // このメッセージがラインの開始点かどうかをチェック
  const transitionAtThisIndex = transitions.find(t => t.index === messageIndex)
  const isLineStart = transitionAtThisIndex !== undefined

  // 現在ラインかどうかをチェック
  const isCurrentLine = message.lineId === currentLineId

  // 編集可能かどうかをチェック（現在のタイムラインに表示されているメッセージは全て編集可能）
  const isEditable = true

  return {
    isLineStart,
    isCurrentLine,
    isEditable,
    lineInfo: lines[message.lineId] || null,
    transitionInfo: transitionAtThisIndex || null
  }
}

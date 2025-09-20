"use client"

import { useState, useEffect, useCallback } from "react"
import { BranchingChatUI } from "@/components/branching-chat-ui"
import { TagManagement } from "@/components/tag-management"
import { BranchStructure } from "@/components/branch-structure"
import { FooterNavigation } from "@/components/footer-navigation"

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
  description: string
  messageIds: string[]
  startMessageId: string
  endMessageId?: string
  branchFromMessageId?: string
  tags?: string[]
  created_at: string
  updated_at: string
}

interface BranchPoint {
  messageId: string
  lines: string[]
}

export default function Home() {
  const [currentView, setCurrentView] = useState<'chat' | 'management' | 'branches'>('chat')
  const [messages, setMessages] = useState<Record<string, Message>>({})
  const [lines, setLines] = useState<Record<string, Line>>({})
  const [branchPoints, setBranchPoints] = useState<Record<string, BranchPoint>>({})
  const [currentLineId, setCurrentLineId] = useState<string>('')

  // データローディング
  useEffect(() => {
    const loadChatData = async () => {
      try {
        const response = await fetch('/data/chat-sample.json')
        const data = await response.json()

        const newMessages: Record<string, Message> = {}
        const newLines: Record<string, Line> = {}
        const newBranchPoints: Record<string, BranchPoint> = {}

        // メッセージデータ変換
        if (data.messages) {
          Object.entries(data.messages as Record<string, Omit<Message, 'timestamp'> & { timestamp: string }>).forEach(([id, msg]) => {
            newMessages[id] = {
              ...msg,
              timestamp: new Date(msg.timestamp)
            }
          })
        }

        // ラインデータ変換
        if (data.lines && Array.isArray(data.lines)) {
          data.lines.forEach((line: Line) => {
            newLines[line.id] = line
          })
        }

        // 分岐点データ
        if (data.branchPoints) {
          Object.entries(data.branchPoints as Record<string, BranchPoint>).forEach(([id, branchPoint]) => {
            newBranchPoints[id] = branchPoint
          })
        }

        setMessages(newMessages)
        setLines(newLines)
        setBranchPoints(newBranchPoints)

        // デフォルトライン設定
        const mainLine = newLines['main'] || Object.values(newLines)[0]
        if (mainLine) {
          setCurrentLineId(mainLine.id)
        }
      } catch (error) {
        console.error('Failed to load chat data:', error)
      }
    }

    loadChatData()
  }, [])

  // ライン切り替えハンドラー
  const handleLineSwitch = useCallback((lineId: string) => {
    setCurrentLineId(lineId)
  }, [])

  // ライン編集ハンドラー
  const handleLineEdit = useCallback((lineId: string, updates: Partial<Line>) => {
    setLines(prev => {
      const updated = { ...prev }
      if (updated[lineId]) {
        updated[lineId] = {
          ...updated[lineId],
          ...updates,
          updated_at: new Date().toISOString()
        }
      }
      return updated
    })
  }, [])

  return (
    <div className="min-h-screen bg-white pb-16">
      {currentView === 'chat' && (
        <BranchingChatUI
          initialMessages={messages}
          initialLines={lines}
          initialBranchPoints={branchPoints}
          initialCurrentLineId={currentLineId}
          onLineChange={handleLineSwitch}
        />
      )}
      {currentView === 'branches' && (
        <div className="p-4">
          <BranchStructure
            messages={messages}
            lines={lines}
            branchPoints={branchPoints}
            currentLineId={currentLineId}
            onLineSwitch={handleLineSwitch}
            onLineEdit={handleLineEdit}
            onViewChange={setCurrentView}
          />
        </div>
      )}
      {currentView === 'management' && (
        <div className="p-4">
          <TagManagement />
        </div>
      )}
      <FooterNavigation
        currentView={currentView}
        onViewChange={setCurrentView}
      />
    </div>
  )
}

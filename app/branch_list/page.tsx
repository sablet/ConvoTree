"use client"

import { useState, useEffect, useCallback } from "react"
import { BranchStructure } from "@/components/branch"
import { HamburgerMenu } from "@/components/hamburger-menu"
import { dataSourceManager } from "@/lib/data-source"
import { PageLayout } from "@/components/layouts/PageLayout"
import { Message, Line, Tag, TagGroup, BranchPoint } from "@/lib/types"

export default function BranchListPage() {
  const [messages, setMessages] = useState<Record<string, Message>>({})
  const [lines, setLines] = useState<Line[]>([])
  const [branchPoints, setBranchPoints] = useState<Record<string, BranchPoint>>({})
  const [tags, setTags] = useState<Record<string, Tag>>({})
  const [tagGroups, setTagGroups] = useState<Record<string, TagGroup>>({})
  const [currentLineId, setCurrentLineId] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)

  const loadChatData = useCallback(async () => {
    try {
      setIsLoading(true)
      const data = await dataSourceManager.loadChatData()

      // メッセージデータ変換（timestampをDateオブジェクトに変換）
      const newMessages: Record<string, Message> = {}
      Object.entries(data.messages).forEach(([id, msg]) => {
        newMessages[id] = {
          ...(msg as Message & { timestamp: string | number | Date }),
          timestamp: new Date((msg as Message & { timestamp: string | number | Date }).timestamp)
        }
      })

      setMessages(newMessages)
      setLines(data.lines)
      setBranchPoints(data.branchPoints)
      setTags(data.tags)
      setTagGroups(data.tagGroups)

      // デフォルトライン設定
      const mainLine = data.lines.find((line: Line) => line.id === 'main') || data.lines[0]
      if (mainLine) {
        setCurrentLineId(mainLine.id)
      }
    } catch (error) {
      console.error('Failed to load chat data:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // データローディング
  useEffect(() => {
    void loadChatData()
  }, [loadChatData])

  // ライン切り替えハンドラー
  const handleLineSwitch = (lineId: string) => {
    setCurrentLineId(lineId)
  }

  // ライン編集ハンドラー
  const handleLineEdit = async (lineId: string, updates: Partial<Line>) => {
    try {
      // DataSourceManagerを使用してライン更新
      if (dataSourceManager.getCurrentSource() === 'firestore') {
        await dataSourceManager.updateLine(lineId, updates)
      }

      // ローカル状態も更新
      setLines(prev => {
        return prev.map(line => {
          if (line.id === lineId) {
            return {
              ...line,
              ...updates,
              updated_at: new Date().toISOString()
            }
          }
          return line
        })
      })
    } catch (error) {
      console.error('Failed to update line:', error)
    }
  }

  // メッセージ削除ヘルパー
  const deleteLineMessages = async (lineToDelete: Line) => {
    if (!lineToDelete.messageIds.length) return

    for (const messageId of lineToDelete.messageIds) {
      if (!messages[messageId] || dataSourceManager.getCurrentSource() !== 'firestore') continue

      try {
        await dataSourceManager.deleteMessage(messageId)
      } catch (error) {
        console.warn(`Failed to delete message ${messageId}:`, error)
      }
    }
  }

  // 分岐点更新ヘルパー
  const updateBranchPointsForLineDelete = (lineId: string) => {
    setBranchPoints(prev => {
      const updated = { ...prev }
      Object.keys(updated).forEach(branchPointId => {
        const branchPoint = updated[branchPointId]
        if (!branchPoint.lines.includes(lineId)) return

        updated[branchPointId] = {
          ...branchPoint,
          lines: branchPoint.lines.filter(id => id !== lineId)
        }

        if (updated[branchPointId].lines.length === 0) {
          delete updated[branchPointId]
        }
      })
      return updated
    })
  }

  // ローカル状態更新ヘルパー
  const updateLocalStateForLineDelete = (lineId: string, lineToDelete: Line | undefined) => {
    setLines(prev => prev.filter(line => line.id !== lineId))
    setMessages(prev => {
      if (!lineToDelete) return prev
      const updated = { ...prev }
      lineToDelete.messageIds.forEach(messageId => {
        delete updated[messageId]
      })
      return updated
    })

    if (currentLineId === lineId) {
      setCurrentLineId('main')
    }
  }

  // ライン削除ハンドラー
  const handleLineDelete = async (lineId: string) => {
    if (lineId === 'main') {
      alert('メインラインは削除できません')
      return
    }

    try {
      const lineToDelete = lines.find(line => line.id === lineId)

      if (lineToDelete) {
        await deleteLineMessages(lineToDelete)
      }

      if (dataSourceManager.getCurrentSource() === 'firestore') {
        await dataSourceManager.deleteLine(lineId)
      }

      updateBranchPointsForLineDelete(lineId)
      updateLocalStateForLineDelete(lineId, lineToDelete)

    } catch (error) {
      console.error('Failed to delete line:', error)
      alert('ラインの削除に失敗しました')
    }
  }


  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">ブランチデータを読み込み中...</p>
        </div>
      </div>
    )
  }

  return (
    <PageLayout sidebar={<HamburgerMenu />}>
      <BranchStructure
        messages={messages}
        lines={lines}
        branchPoints={branchPoints}
        tags={tags}
        tagGroups={tagGroups}
        currentLineId={currentLineId}
        onLineSwitch={handleLineSwitch}
        onLineEdit={handleLineEdit}
        onLineDelete={handleLineDelete}
      />
    </PageLayout>
  )
}

"use client"

import { useState, useEffect } from "react"
import { BranchStructure } from "@/components/branch"
import { HamburgerMenu } from "@/components/hamburger-menu"
import { useRouter } from "next/navigation"
import { dataSourceManager } from "@/lib/data-source"
import { PageLayout } from "@/components/layouts/PageLayout"
import { LineList } from "@/components/ui/line-list"
import { Message, Line, Tag, TagGroup, BranchPoint } from "@/lib/types"

export default function BranchListPage() {
  const router = useRouter()
  const [messages, setMessages] = useState<Record<string, Message>>({})
  const [lines, setLines] = useState<Line[]>([])
  const [branchPoints, setBranchPoints] = useState<Record<string, BranchPoint>>({})
  const [tags, setTags] = useState<Record<string, Tag>>({})
  const [tagGroups, setTagGroups] = useState<Record<string, TagGroup>>({})
  const [currentLineId, setCurrentLineId] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)

  // データローディング
  useEffect(() => {
    const loadChatData = async () => {
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
    }

    loadChatData()
  }, [])

  // ライン切り替えハンドラー（URLルーティング付き）
  const handleLineSwitch = (lineId: string) => {
    const targetLine = lines.find(line => line.id === lineId)
    if (targetLine) {
      setCurrentLineId(lineId)
      // チャットページにリダイレクト
      const encodedLineName = encodeURIComponent(targetLine.name)
      router.push(`/chat?line=${encodedLineName}`)
    }
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

  // ライン削除ハンドラー
  const handleLineDelete = async (lineId: string) => {
    try {
      // mainラインは削除不可
      if (lineId === 'main') {
        alert('メインラインは削除できません')
        return
      }

      // ラインに属するメッセージも削除
      const lineToDelete = lines.find(line => line.id === lineId)
      if (lineToDelete && lineToDelete.messageIds.length > 0) {
        // メッセージを削除（存在するメッセージのみ）
        for (const messageId of lineToDelete.messageIds) {
          // ローカルの messages オブジェクトに存在するメッセージのみ削除
          if (messages[messageId] && dataSourceManager.getCurrentSource() === 'firestore') {
            try {
              await dataSourceManager.deleteMessage(messageId)
            } catch (error) {
              console.warn(`Failed to delete message ${messageId}:`, error)
              // 個別のメッセージ削除失敗はライン削除を妨げない
            }
          }
        }
      }

      // ラインを削除
      if (dataSourceManager.getCurrentSource() === 'firestore') {
        await dataSourceManager.deleteLine(lineId)
      }

      // 分岐点からも削除
      setBranchPoints(prev => {
        const updated = { ...prev }
        Object.keys(updated).forEach(branchPointId => {
          const branchPoint = updated[branchPointId]
          if (branchPoint.lines.includes(lineId)) {
            updated[branchPointId] = {
              ...branchPoint,
              lines: branchPoint.lines.filter(id => id !== lineId)
            }
            // 分岐点に他のラインがない場合は分岐点自体を削除
            if (updated[branchPointId].lines.length === 0) {
              delete updated[branchPointId]
            }
          }
        })
        return updated
      })

      // ローカル状態から削除
      setLines(prev => prev.filter(line => line.id !== lineId))
      setMessages(prev => {
        const updated = { ...prev }
        if (lineToDelete) {
          lineToDelete.messageIds.forEach(messageId => {
            delete updated[messageId]
          })
        }
        return updated
      })

      // 削除したラインが現在選択されている場合はmainに切り替え
      if (currentLineId === lineId) {
        setCurrentLineId('main')
      }

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
    <PageLayout
      title="Branch Structure"
      sidebar={
        <HamburgerMenu>
          <LineList
            lines={lines}
            currentLineId={currentLineId}
            onLineClick={handleLineSwitch}
          />
        </HamburgerMenu>
      }
    >
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
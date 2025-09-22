"use client"

import { useState, useEffect } from "react"
import { TagManagement } from "@/components/tag-management"
import { HamburgerMenu } from "@/components/hamburger-menu"
import { LineHistoryMenu } from "@/components/line-history-menu"
import { dataSourceManager } from "@/lib/data-source"

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

export default function ManagementPage() {
  const [lines, setLines] = useState<Line[]>([])

  // データローディング
  useEffect(() => {
    const loadLines = async () => {
      try {
        const data = await dataSourceManager.loadChatData()
        setLines(data.lines || [])
      } catch (error) {
        console.error('Failed to load lines:', error)
      }
    }

    loadLines()
  }, [])

  return (
    <div className="min-h-screen bg-white">
      {/* ハンバーガーメニューを右上に配置 */}
      <HamburgerMenu>
        <LineHistoryMenu lines={lines} />
      </HamburgerMenu>

      <div className="p-4 space-y-6">
        <TagManagement />
      </div>
    </div>
  )
}
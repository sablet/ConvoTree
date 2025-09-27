"use client"

import { useState, useEffect } from "react"
import { TagManagement } from "@/components/tag-management"
import { HamburgerMenu } from "@/components/hamburger-menu"
import { LineHistoryMenu } from "@/components/line-history-menu"
import { dataSourceManager } from "@/lib/data-source"
import { PageLayout } from "@/components/layouts/PageLayout"
import { Line } from "@/lib/types"

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
    <PageLayout
      title="Tag Management"
      sidebar={
        <HamburgerMenu>
          <LineHistoryMenu lines={lines} />
        </HamburgerMenu>
      }
    >
      <TagManagement />
    </PageLayout>
  )
}
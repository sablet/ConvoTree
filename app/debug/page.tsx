"use client"

import { useState, useEffect } from "react"
import { DataSourceToggle } from "@/components/data-source-toggle"
import { FirestoreDebug } from "@/components/firestore-debug"
import TagCrudTest from "@/components/tag-crud-test"
import { MessageCrudTest } from "@/components/message-crud-test"
import { HamburgerMenu } from "@/components/hamburger-menu"
import { LineHistoryMenu } from "@/components/line-history-menu"
import { TagProvider } from "@/lib/tag-context"
import { dataSourceManager } from "@/lib/data-source"
import { PageLayout } from "@/components/layouts/PageLayout"
import { Line } from "@/lib/types"

export default function DebugPage() {
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

  // データソース変更ハンドラー
  const handleDataSourceChange = () => {
  }

  // データ再読み込みハンドラー
  const handleDataReload = () => {
    // 必要に応じてデータの再読み込み処理を実装
  }

  return (
    <TagProvider>
      <PageLayout
        title="🐛 Debug Tools"
        sidebar={
          <HamburgerMenu>
            <LineHistoryMenu lines={lines} />
          </HamburgerMenu>
        }
      >
        <div className="space-y-6">
          {/* データソース選択 */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h2 className="text-lg font-semibold mb-3">Data Source Selection</h2>
            <DataSourceToggle
              onDataSourceChange={handleDataSourceChange}
              onDataReload={handleDataReload}
            />
          </div>

          {/* Tag CRUD Test */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h2 className="text-lg font-semibold mb-3">Tag CRUD Test</h2>
            <TagCrudTest />
          </div>

          {/* デバッグツール */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h2 className="text-lg font-semibold mb-3">Firestore Debug Tool</h2>
            <FirestoreDebug />
          </div>

          {/* Message CRUD テスト */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h2 className="text-lg font-semibold mb-3">🧪 Message CRUD Test</h2>
            <MessageCrudTest />
          </div>
        </div>
      </PageLayout>
    </TagProvider>
  )
}
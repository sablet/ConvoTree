"use client"

import { useCallback, useState } from "react"
import { DataSourceToggle } from "@/components/data-source-toggle"
import { FirestoreDebug } from "@/components/firestore-debug"
import TagCrudTest from "@/components/tag-crud-test"
import { MessageCrudTest } from "@/components/message-crud-test"
import { HamburgerMenu } from "@/components/hamburger-menu"
import { LineHistoryMenu } from "@/components/line-history-menu"
import { TagProvider } from "@/lib/tag-context"
import { PageLayout } from "@/components/layouts/PageLayout"
import { useLines } from "@/hooks/use-lines"
import { DataSource, dataSourceManager } from "@/lib/data-source"

export default function DebugPage() {
  const { lines, reloadLines } = useLines()
  const [currentSource, setCurrentSource] = useState<DataSource>(dataSourceManager.getCurrentSource())

  const reloadData = useCallback(async () => {
    await reloadLines()
  }, [reloadLines])

  // データソース変更ハンドラー
  const handleDataSourceChange = useCallback((nextSource: DataSource) => {
    setCurrentSource(nextSource)
  }, [])

  // データ再読み込みハンドラー
  const handleDataReload = useCallback(() => {
    void reloadData()
  }, [reloadData])

  return (
    <TagProvider>
      <PageLayout
        title="🐛 Debug Tools"
        sidebar={
          <HamburgerMenu
            onDataReload={reloadData}
            currentDataSource={currentSource}
          >
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

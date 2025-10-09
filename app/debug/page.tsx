"use client"

import { useCallback, useState } from "react"
import { DataSourceToggle } from "@/components/data-source-toggle"
import { FirestoreDebug } from "@/components/firestore-debug"
import TagCrudTest from "@/components/tag-crud-test"
import { MessageCrudTest } from "@/components/message-crud-test"
import { HamburgerMenu } from "@/components/hamburger-menu"
import { TagProvider } from "@/lib/tag-context"
import { PageLayout } from "@/components/layouts/PageLayout"
import { DataSource, dataSourceManager } from "@/lib/data-source"

export default function DebugPage() {
  const [currentSource, setCurrentSource] = useState<DataSource>(dataSourceManager.getCurrentSource())

  // データソース変更ハンドラー
  const handleDataSourceChange = useCallback((nextSource: DataSource) => {
    setCurrentSource(nextSource)
  }, [])

  // データ再読み込みハンドラー
  const handleDataReload = useCallback(() => {
    // HamburgerMenu内部でreloadLinesを呼ぶため、ここでは何もしない
  }, [])

  return (
    <TagProvider>
      <PageLayout
        sidebar={
          <HamburgerMenu
            currentDataSource={currentSource}
          />
        }
      >
        <div className="space-y-6">
          {/* データソース選択 */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <DataSourceToggle
              onDataSourceChange={handleDataSourceChange}
              onDataReload={handleDataReload}
            />
          </div>

          {/* Tag CRUD Test */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <TagCrudTest />
          </div>

          {/* デバッグツール */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <FirestoreDebug />
          </div>

          {/* Message CRUD テスト */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <MessageCrudTest />
          </div>
        </div>
      </PageLayout>
    </TagProvider>
  )
}

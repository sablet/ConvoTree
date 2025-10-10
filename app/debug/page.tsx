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
import { debugConsoleState } from "@/lib/debug-console-state"
import { Button } from "@/components/ui/button"
import { Eye, EyeOff } from "lucide-react"

export default function DebugPage() {
  const [currentSource, setCurrentSource] = useState<DataSource>(dataSourceManager.getCurrentSource())
  const [consoleVisible, setConsoleVisible] = useState(debugConsoleState.isVisible())

  // データソース変更ハンドラー
  const handleDataSourceChange = useCallback((nextSource: DataSource) => {
    setCurrentSource(nextSource)
  }, [])

  // データ再読み込みハンドラー
  const handleDataReload = useCallback(() => {
    // HamburgerMenu内部でreloadLinesを呼ぶため、ここでは何もしない
  }, [])

  // デバッグコンソール表示トグル
  const toggleDebugConsole = useCallback(() => {
    const newValue = debugConsoleState.toggle()
    setConsoleVisible(newValue)
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
          {/* デバッグコンソール表示トグル */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-1">Debug Console</h3>
                <p className="text-xs text-gray-500">
                  画面下部にコンソールログを表示します
                </p>
              </div>
              <Button
                onClick={toggleDebugConsole}
                variant={consoleVisible ? "default" : "outline"}
                size="sm"
                className="flex items-center gap-2"
              >
                {consoleVisible ? (
                  <>
                    <Eye className="w-4 h-4" />
                    表示中
                  </>
                ) : (
                  <>
                    <EyeOff className="w-4 h-4" />
                    非表示
                  </>
                )}
              </Button>
            </div>
          </div>

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

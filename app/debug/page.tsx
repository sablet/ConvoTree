"use client"

import { useState } from "react"
import { DataSourceToggle } from "@/components/data-source-toggle"
import { FirestoreDebug } from "@/components/firestore-debug"
import TagCrudTest from "@/components/tag-crud-test"
import { MessageCrudTest } from "@/components/message-crud-test"
import { FooterNavigation } from "@/components/footer-navigation"
import { TagProvider } from "@/lib/tag-context"
import { DataSource } from "@/lib/data-source"
import { useRouter } from "next/navigation"

export default function DebugPage() {
  const router = useRouter()
  const [currentView, setCurrentView] = useState<'chat' | 'management' | 'branches'>('management')

  // データソース変更ハンドラー
  const handleDataSourceChange = (source: DataSource) => {
    console.log(`Data source changed to: ${source}`)
  }

  // データ再読み込みハンドラー
  const handleDataReload = () => {
    // 必要に応じてデータの再読み込み処理を実装
    console.log('Data reload requested')
  }

  // ビューが変更されたときのハンドラー
  const handleViewChange = (newView: 'chat' | 'management' | 'branches') => {
    setCurrentView(newView)

    // ビューに応じてルーティング
    if (newView === 'chat') {
      router.push('/')
    } else if (newView === 'branches') {
      router.push('/branch_list')
    } else if (newView === 'management') {
      router.push('/management')
    }
  }

  return (
    <TagProvider>
      <div className="min-h-screen bg-white pb-16">
        <div className="p-4 space-y-6">
          <h1 className="text-2xl font-bold text-gray-800 mb-6">🐛 Debug Tools</h1>

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

        <FooterNavigation
          currentView={currentView}
          onViewChange={handleViewChange}
        />
      </div>
    </TagProvider>
  )
}
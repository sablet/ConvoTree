"use client"

import { useState } from "react"
import { TagManagement } from "@/components/tag-management"
import { FooterNavigation } from "@/components/footer-navigation"
import { useRouter } from "next/navigation"

export default function ManagementPage() {
  const router = useRouter()
  const [currentView, setCurrentView] = useState<'chat' | 'management' | 'branches'>('management')

  // ビューが変更されたときのハンドラー
  const handleViewChange = (newView: 'chat' | 'management' | 'branches') => {
    setCurrentView(newView)

    // ビューに応じてルーティング
    if (newView === 'chat') {
      router.push('/')
    } else if (newView === 'branches') {
      router.push('/branch_list')
    }
    // managementの場合は現在のページに留まる
  }

  return (
    <div className="min-h-screen bg-white pb-16">
      <div className="p-4 space-y-6">
        <TagManagement />
      </div>
      <FooterNavigation
        currentView={currentView}
        onViewChange={handleViewChange}
      />
    </div>
  )
}
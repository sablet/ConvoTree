"use client"

import { useState } from "react"
import { BranchingChatUI } from "@/components/branching-chat-ui"
import { TagManagement } from "@/components/tag-management"
import { FooterNavigation } from "@/components/footer-navigation"

export default function Home() {
  const [currentView, setCurrentView] = useState<'chat' | 'management'>('chat')

  return (
    <div className="min-h-screen bg-white pb-16">
      {currentView === 'chat' && <BranchingChatUI />}
      {currentView === 'management' && (
        <div className="p-4">
          <TagManagement />
        </div>
      )}
      <FooterNavigation
        currentView={currentView}
        onViewChange={setCurrentView}
      />
    </div>
  )
}

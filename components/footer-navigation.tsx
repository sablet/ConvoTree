"use client"

import { MessageSquare, Tags, GitBranch, Bug } from "lucide-react"
import { useRouter, usePathname } from "next/navigation"

interface FooterNavigationProps {
  currentView: 'chat' | 'management' | 'branches'
  onViewChange: (view: 'chat' | 'management' | 'branches') => void
}

export function FooterNavigation({ currentView, onViewChange }: FooterNavigationProps) {
  const router = useRouter()
  const pathname = usePathname()

  const navItems = [
    {
      id: 'chat' as const,
      label: 'チャット',
      icon: MessageSquare,
      description: 'ブランチングチャット'
    },
    {
      id: 'branches' as const,
      label: 'ブランチ',
      icon: GitBranch,
      description: 'ブランチ構造'
    },
    {
      id: 'management' as const,
      label: 'タグ',
      icon: Tags,
      description: 'タグ管理'
    },
    {
      id: 'debug' as const,
      label: 'デバッグ',
      icon: Bug,
      description: 'デバッグツール'
    }
  ]

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-lg">
      <div className="flex">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === '/debug'
            ? item.id === 'debug'
            : item.id === currentView ||
              (item.id === 'management' && currentView === 'management') ||
              (item.id === 'branches' && currentView === 'branches')

          return (
            <button
              key={item.id}
              onClick={() => {
                if (item.id === 'chat' || item.id === 'management' || item.id === 'branches') {
                  onViewChange(item.id)
                } else if (item.id === 'debug') {
                  router.push('/debug')
                }
              }}
              className={`
                flex-1 flex flex-col items-center justify-center py-3 px-2
                transition-colors duration-200
                ${isActive
                  ? 'text-blue-600 bg-blue-50 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                }
              `}
            >
              <Icon className="w-5 h-5 mb-1" />
              <span className="text-xs font-medium">{item.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
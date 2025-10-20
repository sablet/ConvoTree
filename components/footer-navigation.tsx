"use client"

import { MessageSquare, Tags, GitBranch, Bug } from "lucide-react"
import { useRouter, usePathname } from "next/navigation"
import { ROUTE_DEBUG } from "@/lib/routes"
import {
  NAV_CHAT,
  NAV_BRANCHES,
  NAV_TAGS,
  NAV_DEBUG,
  NAV_CHAT_DESC,
  NAV_BRANCHES_DESC,
  NAV_TAGS_DESC,
  NAV_DEBUG_DESC
} from "@/lib/ui-strings"

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
      label: NAV_CHAT,
      icon: MessageSquare,
      description: NAV_CHAT_DESC
    },
    {
      id: 'branches' as const,
      label: NAV_BRANCHES,
      icon: GitBranch,
      description: NAV_BRANCHES_DESC
    },
    {
      id: 'management' as const,
      label: NAV_TAGS,
      icon: Tags,
      description: NAV_TAGS_DESC
    },
    {
      id: 'debug' as const,
      label: NAV_DEBUG,
      icon: Bug,
      description: NAV_DEBUG_DESC
    }
  ]

  return (
    <div className="bg-white border-t border-gray-200 shadow-lg">
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
                  router.push(ROUTE_DEBUG)
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
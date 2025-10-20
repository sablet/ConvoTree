"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Menu, X, MessageSquare, Tags, GitBranch, Bug, CheckSquare, RotateCw } from "lucide-react"
import { useRouter, usePathname } from "next/navigation"
import { ROUTE_HOME, ROUTE_BRANCHES, ROUTE_MANAGEMENT, ROUTE_TASKS, ROUTE_DEBUG } from "@/lib/routes"
import { DataSourceMenuAction } from "@/components/data-source-menu-action"
import { DataSource } from "@/lib/data-source"
import { useAuth } from "@/lib/auth-context"
import { useLines } from "@/hooks/use-lines"
import { LineHistoryMenu } from "@/components/line-history-menu"
import {
  NAV_CHAT,
  NAV_BRANCHES,
  NAV_TAGS,
  NAV_TASKS,
  NAV_DEBUG,
  NAV_CHAT_DESC,
  NAV_BRANCHES_DESC,
  NAV_TAGS_DESC,
  NAV_TASKS_DESC,
  NAV_DEBUG_DESC,
  AUTH_LOGOUT,
  PAGE_RELOAD_LABEL
} from "@/lib/ui-strings"

interface HamburgerMenuProps {
  position?: {
    top?: string
    left?: string
    right?: string
    bottom?: string
  }
  onDataReload?: () => Promise<void> | void
  currentDataSource?: DataSource
}

export function HamburgerMenu({
  position = { top: '1rem', right: '1rem' },
  onDataReload,
  currentDataSource
}: HamburgerMenuProps) {
  const { lines, reloadLines } = useLines()
  const [isOpen, setIsOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const { user, signOut } = useAuth()

  const navItems = [
    {
      id: 'chat' as const,
      label: NAV_CHAT,
      icon: MessageSquare,
      description: NAV_CHAT_DESC,
      path: ROUTE_HOME
    },
    {
      id: 'branches' as const,
      label: NAV_BRANCHES,
      icon: GitBranch,
      description: NAV_BRANCHES_DESC,
      path: ROUTE_BRANCHES
    },
    {
      id: 'management' as const,
      label: NAV_TAGS,
      icon: Tags,
      description: NAV_TAGS_DESC,
      path: ROUTE_MANAGEMENT
    },
    {
      id: 'tasks' as const,
      label: NAV_TASKS,
      icon: CheckSquare,
      description: NAV_TASKS_DESC,
      path: ROUTE_TASKS
    },
    {
      id: 'debug' as const,
      label: NAV_DEBUG,
      icon: Bug,
      description: NAV_DEBUG_DESC,
      path: ROUTE_DEBUG
    }
  ]

  const handleNavigation = (item: typeof navItems[0]) => {
    router.push(item.path)
    setIsOpen(false) // メニューを閉じる
  }

  return (
    <>
      {/* Hamburger Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="fixed z-40 h-10 w-10 p-0 bg-white shadow-md border border-gray-200 hover:bg-gray-50"
        style={{
          top: position.top,
          left: position.left,
          right: position.right,
          bottom: position.bottom
        }}
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-50"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Menu Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-80 bg-white shadow-xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-lg font-medium text-gray-900">メニュー</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsOpen(false)}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-4 space-y-6 overflow-y-auto flex-1">
          {/* User Section */}
          {user && (
            <div className="border-b border-gray-200 pb-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3">ユーザー</h3>
              <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 rounded-md">
                <span className="truncate text-sm text-gray-700">
                  {user.email ?? user.displayName ?? user.uid}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void signOut()}
                  className="flex-shrink-0 text-xs"
                >
                  {AUTH_LOGOUT}
                </Button>
              </div>
            </div>
          )}

          {/* Navigation Section */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3">ナビゲーション</h3>
            <div className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon
                const isActive = pathname === item.path

                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavigation(item)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                      isActive
                        ? 'bg-blue-100 text-blue-900 border border-blue-200'
                        : 'hover:bg-gray-100 text-gray-700 hover:text-gray-900'
                    }`}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <div className="flex-1 text-left">
                      <div className="font-medium">{item.label}</div>
                      <div className="text-xs text-gray-500">{item.description}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <DataSourceMenuAction
            onReload={onDataReload ?? reloadLines}
            currentSource={currentDataSource}
          />

          {/* Page Reload */}
          <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <Button
              onClick={() => window.location.reload()}
              size="sm"
              variant="outline"
              className="w-full justify-center"
            >
              <RotateCw className="mr-2 h-4 w-4" />
              {PAGE_RELOAD_LABEL}
            </Button>
          </div>

          {/* Line History */}
          <LineHistoryMenu lines={lines} />
        </div>
      </div>
    </>
  )
}

"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { RefreshCw } from "lucide-react"
import { dataSourceManager, DataSource } from "@/lib/data-source"
import { useChatRepository } from "@/lib/chat-repository-context"
import {
  DATA_SOURCE_SECTION_TITLE,
  DATA_SOURCE_RELOAD_LABEL,
  DATA_SOURCE_LABEL_FIRESTORE,
  DATA_SOURCE_LABEL_SAMPLE,
  DATA_SOURCE_STATUS_FIRESTORE,
  DATA_SOURCE_STATUS_SAMPLE
} from "@/lib/ui-strings"

interface DataSourceMenuActionProps {
  onReload?: () => Promise<void> | void
  currentSource?: DataSource
}

export function DataSourceMenuAction({ onReload, currentSource }: DataSourceMenuActionProps) {
  const chatRepository = useChatRepository();
  const [source, setSource] = useState<DataSource>(currentSource ?? dataSourceManager.getCurrentSource())
  const [isReloading, setIsReloading] = useState(false)

  useEffect(() => {
    if (currentSource) {
      setSource(currentSource)
    } else {
      setSource(dataSourceManager.getCurrentSource())
    }
  }, [currentSource])

  const handleReload = async () => {
    setIsReloading(true)
    try {
      if (onReload) {
        await onReload()
      } else {
        await chatRepository.loadChatData({
          source: dataSourceManager.getCurrentSource()
        })
      }
    } catch (error) {
      console.error("Failed to reload data source:", error)
    } finally {
      setIsReloading(false)
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-gray-700">{DATA_SOURCE_SECTION_TITLE}</div>
        <span className="text-xs font-semibold text-gray-600">
          {source === "firestore" ? DATA_SOURCE_LABEL_FIRESTORE : DATA_SOURCE_LABEL_SAMPLE}
        </span>
      </div>
      <div className="text-xs text-gray-500">
        {source === "firestore" ? DATA_SOURCE_STATUS_FIRESTORE : DATA_SOURCE_STATUS_SAMPLE}
      </div>
      <Button
        onClick={handleReload}
        disabled={isReloading}
        size="sm"
        variant="outline"
        className="w-full justify-center"
      >
        <RefreshCw className={`mr-2 h-4 w-4 ${isReloading ? "animate-spin" : ""}`} />
        {DATA_SOURCE_RELOAD_LABEL}
      </Button>
    </div>
  )
}

"use client"

import React from "react"
import { Button } from "@/components/ui/button"
import {
  GitBranch,
  BarChart3,
  MessageSquare,
  X
} from "lucide-react"

interface StatisticsData {
  totalLines: number
  totalMessages: number
  totalBranches: number
  maxDepth: number
  avgMessagesPerLine: number
  linesByDepth: Record<number, number>
  messagesByLine: Record<string, number>
}

interface StatisticsViewProps {
  statistics: StatisticsData
  onClose: () => void
}

export function StatisticsView({ statistics, onClose }: StatisticsViewProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">ブランチ統計</h2>
        <Button
          onClick={onClose}
          variant="outline"
          size="sm"
        >
          <X className="w-4 h-4 mr-1" />
          閉じる
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 bg-blue-50 rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <GitBranch className="w-4 h-4 text-blue-600" />
            <span className="text-sm text-blue-600">総ライン数</span>
          </div>
          <span className="text-2xl font-bold text-blue-900">{statistics.totalLines}</span>
        </div>

        <div className="p-4 bg-green-50 rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <MessageSquare className="w-4 h-4 text-green-600" />
            <span className="text-sm text-green-600">総メッセージ数</span>
          </div>
          <span className="text-2xl font-bold text-green-900">{statistics.totalMessages}</span>
        </div>

        <div className="p-4 bg-purple-50 rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <GitBranch className="w-4 h-4 text-purple-600" />
            <span className="text-sm text-purple-600">分岐点数</span>
          </div>
          <span className="text-2xl font-bold text-purple-900">{statistics.totalBranches}</span>
        </div>

        <div className="p-4 bg-orange-50 rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="w-4 h-4 text-orange-600" />
            <span className="text-sm text-orange-600">最大深度</span>
          </div>
          <span className="text-2xl font-bold text-orange-900">{statistics.maxDepth}</span>
        </div>
      </div>

      <div className="p-4 bg-gray-50 rounded-lg">
        <h3 className="font-medium text-gray-900 mb-3">平均メッセージ数/ライン</h3>
        <span className="text-xl font-bold text-gray-700">
          {statistics.avgMessagesPerLine.toFixed(1)}
        </span>
      </div>

      <div className="p-4 bg-gray-50 rounded-lg">
        <h3 className="font-medium text-gray-900 mb-3">深度別ライン数</h3>
        <div className="space-y-2">
          {Object.entries(statistics.linesByDepth).map(([depth, count]) => (
            <div key={depth} className="flex items-center justify-between">
              <span className="text-sm text-gray-600">深度 {depth}</span>
              <span className="font-medium">{count}ライン</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

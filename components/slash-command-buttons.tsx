"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { CheckSquare, FileText, Timer, AlertTriangle, Zap } from "lucide-react"
import {
  SLASH_COMMAND_TASK,
  SLASH_COMMAND_TASK_HIGH,
  SLASH_COMMAND_TASK_LOW,
  SLASH_COMMAND_DOCUMENT,
  SLASH_COMMAND_SESSION
} from "@/lib/constants"
import {
  LABEL_TASK_HIGH,
  LABEL_TASK_MEDIUM,
  LABEL_TASK_LOW,
  LABEL_DOCUMENT,
  LABEL_SESSION
} from "@/lib/ui-strings"

interface SlashCommandButtonsProps {
  onCommandSelect: (command: string) => void
}

interface SlashCommand {
  command: string
  label: string
  icon: React.ReactNode
  description: string
  color: string
}

const SLASH_COMMANDS: SlashCommand[] = [
  {
    command: `${SLASH_COMMAND_TASK_HIGH} `,
    label: LABEL_TASK_HIGH,
    icon: <AlertTriangle className="h-3 w-3" />,
    description: "緊急度の高いタスクを作成",
    color: "bg-white hover:bg-blue-50 text-gray-700 hover:text-blue-700 border-gray-200 hover:border-blue-300"
  },
  {
    command: `${SLASH_COMMAND_TASK} `,
    label: LABEL_TASK_MEDIUM,
    icon: <CheckSquare className="h-3 w-3" />,
    description: "通常の優先度のタスクを作成",
    color: "bg-white hover:bg-blue-50 text-gray-700 hover:text-blue-700 border-gray-200 hover:border-blue-300"
  },
  {
    command: `${SLASH_COMMAND_TASK_LOW} `,
    label: LABEL_TASK_LOW,
    icon: <CheckSquare className="h-3 w-3" />,
    description: "優先度の低いタスクを作成",
    color: "bg-white hover:bg-blue-50 text-gray-700 hover:text-blue-700 border-gray-200 hover:border-blue-300"
  },
  {
    command: `${SLASH_COMMAND_DOCUMENT} `,
    label: LABEL_DOCUMENT,
    icon: <FileText className="h-3 w-3" />,
    description: "長文ドキュメントを作成",
    color: "bg-white hover:bg-blue-50 text-gray-700 hover:text-blue-700 border-gray-200 hover:border-blue-300"
  },
  {
    command: `${SLASH_COMMAND_SESSION} `,
    label: LABEL_SESSION,
    icon: <Timer className="h-3 w-3" />,
    description: "作業時間を記録するセッションを開始",
    color: "bg-white hover:bg-blue-50 text-gray-700 hover:text-blue-700 border-gray-200 hover:border-blue-300"
  }
]

export function SlashCommandButtons({ onCommandSelect }: SlashCommandButtonsProps) {
  const [isOpen, setIsOpen] = useState(false)

  const handleCommandSelect = (command: string) => {
    onCommandSelect(command)
    setIsOpen(false)
  }

  return (
    <div className="relative">
      <Button
        onClick={() => setIsOpen(!isOpen)}
        variant="outline"
        size="sm"
        className="h-9 w-9 p-0 text-gray-600 hover:text-gray-800 border-gray-300 [&_svg]:!size-3"
        title="スラッシュコマンドを挿入"
      >
        <Zap className="h-3 w-3" />
      </Button>

      {isOpen && (
        <div className="absolute bottom-full mb-2 right-0 bg-white border border-gray-200 rounded-lg shadow-lg p-2 space-y-1 min-w-48 z-50">
          <div className="text-xs text-gray-500 px-2 py-1 font-medium">
            メッセージタイプを選択
          </div>

          {SLASH_COMMANDS.map((cmd) => (
            <Button
              key={cmd.command}
              onClick={() => handleCommandSelect(cmd.command)}
              variant="ghost"
              size="sm"
              className={`w-full justify-start text-xs h-8 border ${cmd.color}`}
              title={cmd.description}
            >
              <div className="flex items-center gap-2 w-full">
                {cmd.icon}
                <span className="flex-1 text-left">{cmd.label}</span>
                <span className="text-xs opacity-60 font-mono">
                  {cmd.command.trim()}
                </span>
              </div>
            </Button>
          ))}

          <div className="border-t pt-1">
            <Button
              onClick={() => setIsOpen(false)}
              variant="ghost"
              size="sm"
              className="w-full text-xs h-6 text-gray-500"
            >
              キャンセル
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

"use client"

import { Button } from "@/components/ui/button"
import { Timer, Edit3, Check, X } from "lucide-react"

interface SessionMessageHeaderProps {
  content: string
  isWorking: boolean
  isEditable: boolean
  hasSessionData: boolean
  isEditMode: boolean
  onEditToggle: () => void
  onEditSave: () => void
  onEditCancel: () => void
}

export function SessionMessageHeader({
  content,
  isWorking,
  isEditable,
  hasSessionData,
  isEditMode,
  onEditToggle,
  onEditSave,
  onEditCancel
}: SessionMessageHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <Timer className={`h-4 w-4 ${isWorking ? 'text-green-600' : 'text-purple-600'}`} />
        <span className={`text-sm font-medium break-words overflow-wrap-anywhere ${
          isWorking ? 'text-green-800' : 'text-purple-800'
        }`}>
          {content}
        </span>
        {isWorking && (
          <div className="flex items-center gap-1 animate-pulse">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-xs text-green-600">作業中</span>
          </div>
        )}
      </div>

      {/* 編集ボタン */}
      {isEditable && !isWorking && hasSessionData && (
        <div className="flex items-center gap-1">
          {isEditMode ? (
            <>
              <Button
                onClick={onEditSave}
                size="sm"
                variant="outline"
                className="h-6 w-6 p-0 text-green-600 hover:text-green-700"
              >
                <Check className="h-3 w-3" />
              </Button>
              <Button
                onClick={onEditCancel}
                size="sm"
                variant="outline"
                className="h-6 w-6 p-0 text-red-600 hover:text-red-700"
              >
                <X className="h-3 w-3" />
              </Button>
            </>
          ) : (
            <Button
              onClick={onEditToggle}
              size="sm"
              variant="outline"
              className="h-6 w-6 p-0 text-gray-600 hover:text-gray-700"
            >
              <Edit3 className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

"use client"

import React from "react"
import { Button } from "@/components/ui/button"
import { Line } from "@/lib/types"

interface DeleteConfirmDialogProps {
  line: Line | null
  onConfirm: () => void
  onCancel: () => void
}

export function DeleteConfirmDialog({
  line,
  onConfirm,
  onCancel
}: DeleteConfirmDialogProps) {
  if (!line) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold mb-4">ブランチを削除しますか?</h3>
        <p className="text-gray-600 mb-4">
          ライン「{line.name}」を削除します。
          この操作は取り消せません。
        </p>
        <div className="flex gap-3 justify-end">
          <Button
            variant="outline"
            onClick={onCancel}
          >
            キャンセル
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            className="bg-red-600 hover:bg-red-700"
          >
            削除
          </Button>
        </div>
      </div>
    </div>
  )
}

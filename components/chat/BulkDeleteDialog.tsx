"use client"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { AlertTriangle } from "lucide-react"

interface BulkDeleteDialogProps {
  isOpen: boolean
  selectedMessagesCount: number
  isUpdating: boolean
  onConfirm: () => Promise<void>
  onCancel: () => void
}

/**
 * BulkDeleteDialog Component
 *
 * Confirmation dialog for bulk message deletion
 */
export function BulkDeleteDialog({
  isOpen,
  selectedMessagesCount,
  isUpdating,
  onConfirm,
  onCancel
}: BulkDeleteDialogProps) {
  const handleConfirm = () => {
    void onConfirm()
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            メッセージの一括削除
          </DialogTitle>
        </DialogHeader>

        <div className="py-4 text-sm text-gray-700">
          選択した{selectedMessagesCount}件のメッセージを削除します。
          <br />
          <strong className="text-red-600">この操作は取り消せません。</strong>
          <br />
          本当に削除しますか?
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button
            onClick={onCancel}
            variant="outline"
            disabled={isUpdating}
          >
            キャンセル
          </Button>
          <Button
            onClick={handleConfirm}
            className="bg-red-600 hover:bg-red-700 text-white"
            disabled={isUpdating}
          >
            {isUpdating ? '削除中...' : '削除する'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

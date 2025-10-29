import { Button } from "@/components/ui/button"

export interface DeleteOption {
  id: string
  label: string
  disabled: boolean
  messageCount: number
  hasChildren: boolean
}

interface LineSidebarDeleteLineFormProps {
  options: DeleteOption[]
  selectedLineId: string
  isDeleting: boolean
  onSelect: (lineId: string) => void
  onConfirm: () => void
  onCancel: () => void
}

export function LineSidebarDeleteLineForm({
  options,
  selectedLineId,
  isDeleting,
  onSelect,
  onConfirm,
  onCancel
}: LineSidebarDeleteLineFormProps) {
  const selectedOption = options.find(option => option.id === selectedLineId)
  const hasAvailableOption = options.some(option => !option.disabled)

  return (
    <div className="mb-3 rounded-md border border-dashed border-red-300 bg-white p-3 shadow-sm">
      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          削除するライン
          <select
            value={selectedLineId}
            onChange={(event) => onSelect(event.target.value)}
            disabled={isDeleting || !hasAvailableOption}
            className="rounded border border-gray-300 px-2 py-1 text-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200 disabled:opacity-50"
          >
            <option value="">(ラインを選択)</option>
            {options.map(option => (
              <option key={option.id} value={option.id} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {!hasAvailableOption && (
          <p className="text-[11px] text-gray-500">
            削除可能なラインがありません。子ラインを先に削除してください。
          </p>
        )}

        {selectedOption && !selectedOption.disabled && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-[11px] text-red-600">
            <p className="font-medium">この操作は元に戻せません。</p>
            <p>メッセージ数: {selectedOption.messageCount}</p>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={
              isDeleting ||
              !selectedOption ||
              selectedOption.disabled ||
              selectedLineId === ""
            }
          >
            {isDeleting ? "削除中..." : "ラインを削除"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isDeleting}
          >
            キャンセル
          </Button>
        </div>
      </div>
    </div>
  )
}



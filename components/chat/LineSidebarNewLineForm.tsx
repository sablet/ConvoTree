import type { RefObject } from "react"
import { Button } from "@/components/ui/button"

interface LineSidebarNewLineFormProps {
  value: string
  isSubmitting: boolean
  onChange: (value: string) => void
  onSubmit: () => void
  onCancel: () => void
  inputRef: RefObject<HTMLInputElement>
  parentOptions: Array<{
    id: string
    label: string
    disabled: boolean
  }>
  selectedParentId: string
  onParentChange: (value: string) => void
}

export function LineSidebarNewLineForm({
  value,
  isSubmitting,
  onChange,
  onSubmit,
  onCancel,
  inputRef,
  parentOptions,
  selectedParentId,
  onParentChange
}: LineSidebarNewLineFormProps) {
  return (
    <div className="mb-3 rounded-md border border-dashed border-blue-300 bg-white p-3 shadow-sm">
      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          親ライン
          <select
            value={selectedParentId}
            onChange={(e) => onParentChange(e.target.value)}
            disabled={isSubmitting}
            className="rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-50"
          >
            <option value="">(最上位に作成)</option>
            {parentOptions.map(option => (
              <option key={option.id} value={option.id} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {parentOptions.length > 0 && (
          <p className="text-[11px] text-gray-500">
            メッセージが存在するラインのみ子ラインを作成できます
          </p>
        )}
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onSubmit()
            } else if (e.key === 'Escape') {
              onCancel()
            }
          }}
          placeholder="新しいライン名を入力"
          disabled={isSubmitting}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-50"
        />
        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={onSubmit}
            disabled={isSubmitting || !value.trim()}
          >
            {isSubmitting ? '作成中...' : 'ラインを作成'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            キャンセル
          </Button>
        </div>
      </div>
    </div>
  )
}


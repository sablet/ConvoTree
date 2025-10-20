import type { Line } from "@/lib/types"
import { TIMELINE_BRANCH_ID } from "@/lib/constants"

interface LineBreadcrumbProps {
  lineId: string
  lines: Record<string, Line>
  getLineAncestry: (lineId: string) => string[]
  isCurrentLine?: boolean
  isLeafNode?: boolean
  onClick?: (lineId: string) => void
  className?: string
}

/**
 * LineBreadcrumb Component
 *
 * Displays a compact breadcrumb-style line path (ancestor chain + current line)
 * Used in both BranchSelector header and MessageMoveDialog
 */
export function LineBreadcrumb({
  lineId,
  lines,
  getLineAncestry,
  isCurrentLine = false,
  isLeafNode = false,
  onClick,
  className = ""
}: LineBreadcrumbProps) {
  // Get ancestor chain without filtering
  const ancestry = getLineAncestry(lineId)
  const breadcrumbPath = [...ancestry, lineId]

  return (
    <div className={`flex items-center gap-1 flex-shrink-0 ${className}`}>
      {breadcrumbPath.map((pathLineId, index) => {
        // タイムライン仮想ブランチの特別処理
        if (pathLineId === TIMELINE_BRANCH_ID) {
          return (
            <div key={`breadcrumb-${pathLineId}-${index}`} className="flex items-center gap-1 flex-shrink-0">
              <button
                className="px-2 py-1 rounded-md text-xs font-medium transition-all duration-200 whitespace-nowrap bg-blue-500 text-white shadow-sm"
                onClick={() => onClick?.(pathLineId)}
              >
                全メッセージ
              </button>
              {index < breadcrumbPath.length - 1 && (
                <div className="text-gray-400 text-xs font-medium px-1">
                  &gt;
                </div>
              )}
            </div>
          )
        }

        const line = lines[pathLineId]
        if (!line) return null

        const isThisCurrentLine = pathLineId === lineId && isCurrentLine
        const isThisLeafNode = pathLineId === lineId && isLeafNode
        const isLast = index === breadcrumbPath.length - 1

        return (
          <div key={`breadcrumb-${pathLineId}-${index}`} className="flex items-center gap-1 flex-shrink-0">
            <button
              className={`px-2 py-1 rounded-md text-xs font-medium transition-all duration-200 whitespace-nowrap ${
                isThisCurrentLine || isThisLeafNode
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700 hover:text-gray-900'
              }`}
              onClick={() => onClick?.(pathLineId)}
            >
              {line.name}
            </button>
            {!isLast && (
              <div className="text-gray-400 text-xs font-medium px-1">
                &gt;
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

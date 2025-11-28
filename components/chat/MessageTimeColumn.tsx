export interface MessageConvertButtonConfig {
  label: string
  icon: JSX.Element
  onClick: () => void
}

interface MessageTimeColumnProps {
  createdLabel: string
  createdTooltip?: string
  isCurrentLine: boolean
}

/**
 * Displays the message timestamp column.
 */
export function MessageTimeColumn({
  createdLabel,
  createdTooltip,
  isCurrentLine
}: MessageTimeColumnProps) {
  return (
    <div
      className={`flex flex-col items-end text-xs font-mono min-w-[48px] pt-0.5 leading-tight ${
        !isCurrentLine ? 'text-blue-400' : 'text-gray-400'
      }`}
    >
      <span className="w-full text-right" title={createdTooltip}>{createdLabel}</span>
    </div>
  )
}

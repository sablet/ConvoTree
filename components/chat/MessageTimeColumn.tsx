import { Button } from "@/components/ui/button"

export interface MessageConvertButtonConfig {
  label: string
  icon: JSX.Element
  onClick: () => void
}

interface MessageTimeColumnProps {
  createdLabel: string
  createdTooltip?: string
  isCurrentLine: boolean
  convertButton?: MessageConvertButtonConfig
}

/**
 * Displays the message timestamp column with optional conversion action.
 */
export function MessageTimeColumn({
  createdLabel,
  createdTooltip,
  isCurrentLine,
  convertButton
}: MessageTimeColumnProps) {
  return (
    <div
      className={`flex flex-col items-start gap-1 text-xs font-mono min-w-[48px] pt-0.5 leading-tight ${
        !isCurrentLine ? 'text-blue-400' : 'text-gray-400'
      }`}
    >
      <span title={createdTooltip}>{createdLabel}</span>
      {convertButton && (
        <Button
          onClick={(event) => {
            event.stopPropagation()
            convertButton.onClick()
          }}
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-gray-500 hover:text-gray-900 hover:bg-gray-100"
          title={convertButton.label}
        >
          {convertButton.icon}
          <span className="sr-only">{convertButton.label}</span>
        </Button>
      )}
    </div>
  )
}

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
  timeTrackingButton?: MessageConvertButtonConfig
}

/**
 * Displays the message timestamp column with optional conversion action.
 */
export function MessageTimeColumn({
  createdLabel,
  createdTooltip,
  isCurrentLine,
  convertButton,
  timeTrackingButton
}: MessageTimeColumnProps) {
  const renderActionButton = (config: MessageConvertButtonConfig) => (
    <Button
      onClick={(event) => {
        event.stopPropagation()
        config.onClick()
      }}
      variant="ghost"
      size="icon"
      className="h-6 w-6 text-gray-500 hover:text-gray-900 hover:bg-gray-100"
      title={config.label}
    >
      {config.icon}
      <span className="sr-only">{config.label}</span>
    </Button>
  )

  return (
    <div
      className={`flex flex-col items-end gap-1 text-xs font-mono min-w-[48px] pt-0.5 leading-tight ${
        !isCurrentLine ? 'text-blue-400' : 'text-gray-400'
      }`}
    >
      <span className="w-full text-right" title={createdTooltip}>{createdLabel}</span>
      {(convertButton || timeTrackingButton) && (
        <div className="flex items-center justify-end gap-1 w-full">
          {convertButton && renderActionButton(convertButton)}
          {timeTrackingButton && renderActionButton(timeTrackingButton)}
        </div>
      )}
    </div>
  )
}

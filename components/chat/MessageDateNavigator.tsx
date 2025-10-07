"use client"

import { useState } from "react"
import { CalendarDays, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import {
  DATE_NAVIGATION_FIRST,
  DATE_NAVIGATION_LAST_MONTH,
  DATE_NAVIGATION_NO_MESSAGES,
  DATE_NAVIGATION_SELECT_DATE,
  DATE_NAVIGATION_SPECIFIC_DATE,
  DATE_NAVIGATION_TITLE,
  DATE_NAVIGATION_LAST_WEEK,
  DATE_YESTERDAY
} from "@/lib/ui-strings"

interface MessageDateNavigatorProps {
  label: string | null
  disabled?: boolean
  onJumpToYesterday: () => void
  onJumpToLastWeek: () => void
  onJumpToLastMonth: () => void
  onJumpToFirst: () => void
  onJumpToSpecificDate: (date: Date) => void
}

export function MessageDateNavigator({
  label,
  disabled = false,
  onJumpToYesterday,
  onJumpToLastWeek,
  onJumpToLastMonth,
  onJumpToFirst,
  onJumpToSpecificDate
}: MessageDateNavigatorProps) {
  const [open, setOpen] = useState(false)
  const [customDateValue, setCustomDateValue] = useState("")

  const handleSelectDate = (value: string) => {
    setCustomDateValue(value)
    if (!value) {
      return
    }

    const selectedDate = new Date(value)
    if (Number.isNaN(selectedDate.getTime())) {
      return
    }

    onJumpToSpecificDate(selectedDate)
    setTimeout(() => {
      setOpen(false)
      setCustomDateValue("")
    }, 0)
  }

  const displayLabel = label ?? DATE_NAVIGATION_NO_MESSAGES

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className="gap-2 rounded-full border-gray-200 bg-white/80 px-4 py-2 text-sm font-medium text-gray-700 shadow-sm backdrop-blur hover:bg-white"
        >
          <CalendarDays className="size-4 text-gray-500" />
          <span>{displayLabel}</span>
          <ChevronDown className="size-4 text-gray-500" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60" align="center">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          {DATE_NAVIGATION_TITLE}
        </DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => { onJumpToYesterday(); setOpen(false) }}>
          {DATE_YESTERDAY}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => { onJumpToLastWeek(); setOpen(false) }}>
          {DATE_NAVIGATION_LAST_WEEK}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => { onJumpToLastMonth(); setOpen(false) }}>
          {DATE_NAVIGATION_LAST_MONTH}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => { onJumpToFirst(); setOpen(false) }}>
          {DATE_NAVIGATION_FIRST}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5">
          <label className="flex flex-col gap-2 text-xs text-muted-foreground">
            <span>{DATE_NAVIGATION_SPECIFIC_DATE}</span>
            <input
              type="date"
              value={customDateValue}
              onChange={(event) => handleSelectDate(event.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <span className="text-[10px] text-muted-foreground/80">
              {DATE_NAVIGATION_SELECT_DATE}
            </span>
          </label>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

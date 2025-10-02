"use client"

import { Button } from "@/components/ui/button"
import { Play } from "lucide-react"

interface SessionMessageCheckInButtonProps {
  onCheckIn: () => void
}

export function SessionMessageCheckInButton({ onCheckIn }: SessionMessageCheckInButtonProps) {
  return (
    <div className="flex justify-center">
      <Button
        onClick={onCheckIn}
        className="bg-purple-500 hover:bg-purple-600 text-white"
        size="sm"
      >
        <Play className="h-3 w-3 mr-1" />
        チェックイン
      </Button>
    </div>
  )
}

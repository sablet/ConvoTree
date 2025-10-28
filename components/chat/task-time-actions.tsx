import { Play, Square } from "lucide-react"
import { sanitizeTaskMetadata, type TaskMessageData } from "@/components/message-types/task-message-shared"
import {
  ACTION_TASK_CHECK_IN,
  ACTION_TASK_CHECK_OUT
} from "@/lib/ui-strings"
import type { Message } from "@/lib/types"
import type { MessageConvertButtonConfig } from "./MessageTimeColumn"

interface TaskTimeButtonParams {
  message: Message
  isTaskMessage: boolean
  isSelectionMode: boolean
  isEditing: boolean
  onUpdateMessage: (messageId: string, updates: Partial<Message>) => Promise<void>
}

export function createTaskTimeTrackingButton({
  message,
  isTaskMessage,
  isSelectionMode,
  isEditing,
  onUpdateMessage
}: TaskTimeButtonParams): MessageConvertButtonConfig | undefined {
  if (!isTaskMessage || isSelectionMode || isEditing) {
    return undefined
  }

  const taskMetadata = (message.metadata ?? {}) as Partial<TaskMessageData>
  const isTaskInProgress = Boolean(taskMetadata.checkedInAt && !taskMetadata.checkedOutAt)

  const handleTaskCheckIn = () => {
    const updatedMetadata: Partial<TaskMessageData> = {
      ...taskMetadata,
      checkedInAt: new Date().toISOString()
    }
    delete updatedMetadata.checkedOutAt

    const sanitizedMetadata = sanitizeTaskMetadata(updatedMetadata)
    void onUpdateMessage(message.id, {
      metadata: sanitizedMetadata,
      updatedAt: new Date()
    })
  }

  const handleTaskCheckOut = () => {
    const checkedInAt = taskMetadata.checkedInAt
    if (!checkedInAt) {
      return
    }

    const startTime = new Date(checkedInAt).getTime()
    if (Number.isNaN(startTime)) {
      return
    }

    const previousTimeSpent = typeof taskMetadata.timeSpent === "number" ? taskMetadata.timeSpent : 0
    const elapsedMinutes = Math.max(0, Math.round((Date.now() - startTime) / (1000 * 60)))

    const updatedMetadata: Partial<TaskMessageData> = {
      ...taskMetadata,
      checkedOutAt: new Date().toISOString(),
      timeSpent: previousTimeSpent + elapsedMinutes
    }

    const sanitizedMetadata = sanitizeTaskMetadata(updatedMetadata)
    void onUpdateMessage(message.id, {
      metadata: sanitizedMetadata,
      updatedAt: new Date()
    })
  }

  return {
    label: isTaskInProgress ? ACTION_TASK_CHECK_OUT : ACTION_TASK_CHECK_IN,
    icon: isTaskInProgress
      ? <Square className="h-4 w-4 text-green-600" />
      : <Play className="h-4 w-4 text-purple-600" />,
    onClick: () => {
      if (isTaskInProgress) {
        handleTaskCheckOut()
      } else {
        handleTaskCheckIn()
      }
    }
  }
}

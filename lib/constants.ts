import type { TaskPriority } from "@/lib/types/task";

/**
 * Core application constants for IDs and identifiers
 */

// Line IDs
export const MAIN_LINE_ID = "main";
export const TIMELINE_BRANCH_ID = "__timeline__";

// Message Types
export const MESSAGE_TYPE_TEXT = "text";
export const MESSAGE_TYPE_TASK = "task";
export const MESSAGE_TYPE_DOCUMENT = "document";
export const MESSAGE_TYPE_SESSION = "session";

// Message Type Union
export type MessageType = typeof MESSAGE_TYPE_TEXT | typeof MESSAGE_TYPE_TASK | typeof MESSAGE_TYPE_DOCUMENT | typeof MESSAGE_TYPE_SESSION;

// Priority Levels
const PRIORITY_LOW = "低";
const PRIORITY_MEDIUM = "中";
const PRIORITY_HIGH = "高";
const PRIORITY_URGENT = "緊急";

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  urgent: PRIORITY_URGENT,
  high: PRIORITY_HIGH,
  medium: PRIORITY_MEDIUM,
  low: PRIORITY_LOW,
};

export const TASK_PRIORITY_ORDER: Record<TaskPriority, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export const TASK_PRIORITY_KEYS: TaskPriority[] = ['urgent', 'high', 'medium', 'low'];

// Slash Commands
export const SLASH_COMMAND_TASK = "/task";
export const SLASH_COMMAND_TASK_HIGH = "/task_high";
export const SLASH_COMMAND_TASK_MEDIUM = "/task_medium";
export const SLASH_COMMAND_TASK_LOW = "/task_low";
export const SLASH_COMMAND_DOCUMENT = "/document";
export const SLASH_COMMAND_SESSION = "/session";

// Application Metadata
export const APP_TITLE = "ConvoTree";
export const APP_DESCRIPTION = "Branching conversation tree with timeline navigation";

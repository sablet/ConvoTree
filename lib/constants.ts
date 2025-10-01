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
export const PRIORITY_LOW = "低";
export const PRIORITY_MEDIUM = "中";
export const PRIORITY_HIGH = "高";

// Slash Commands
export const SLASH_COMMAND_TASK_HIGH = "/task_high";
export const SLASH_COMMAND_TASK_MEDIUM = "/task_medium";
export const SLASH_COMMAND_TASK_LOW = "/task_low";
export const SLASH_COMMAND_DOCUMENT = "/document";
export const SLASH_COMMAND_SESSION = "/session";

// Application Metadata
export const APP_TITLE = "ConvoTree";
export const APP_DESCRIPTION = "Branching conversation tree with timeline navigation";

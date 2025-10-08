/**
 * UI display strings (Japanese)
 * Future: Consider moving to i18n structure for internationalization
 */

// Relative Time
export const RELATIVE_TIME_NOW = "今";
export const RELATIVE_TIME_MINUTES = "分前";
export const RELATIVE_TIME_HOURS = "時間前";
export const RELATIVE_TIME_DAYS = "日前";
export const RELATIVE_TIME_MONTHS = "ヶ月前";

// Date Labels
export const DATE_TODAY = "今日";
export const DATE_YESTERDAY = "昨日";
export const DATE_NAVIGATION_TITLE = "次の期間に移動";
export const DATE_NAVIGATION_LAST_WEEK = "先週";
export const DATE_NAVIGATION_LAST_MONTH = "先月";
export const DATE_NAVIGATION_FIRST = "最初";
export const DATE_NAVIGATION_LAST = "最後へ";
export const DATE_NAVIGATION_SPECIFIC_DATE = "特定の日付に移動";
export const DATE_NAVIGATION_SELECT_DATE = "日付を選択";
export const DATE_NAVIGATION_NO_MESSAGES = "メッセージがありません";

// Weekday Names
export const WEEKDAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];

// Filter Options
export const FILTER_ALL = "全て";
export const FILTER_TEXT = "テキスト";
export const FILTER_TASK = "タスク";
export const FILTER_DOCUMENT = "ドキュメント";
export const FILTER_SESSION = "セッション";

// Navigation Labels
export const NAV_CHAT = "チャット";
export const NAV_BRANCHES = "ブランチ";
export const NAV_TAGS = "タグ";
export const NAV_TASKS = "タスク";
export const NAV_DEBUG = "デバッグ";

// Navigation Descriptions
export const NAV_CHAT_DESC = "ブランチングチャット";
export const NAV_BRANCHES_DESC = "ブランチ構造";
export const NAV_TAGS_DESC = "タグ管理";
export const NAV_TASKS_DESC = "タスク一覧";
export const NAV_DEBUG_DESC = "デバッグツール";

// Timeline/Branch Names
export const TIMELINE_BRANCH_NAME = "全メッセージ (時系列)";

// Placeholders
export const PLACEHOLDER_SEARCH = "検索...";
export const PLACEHOLDER_TAG = "タグ...";

// Loading Messages
export const LOADING_TAGS = "タグを読み込み中...";
export const LOADING_CHAT_DATA = "チャットデータを読み込み中...";
export const LOADING_BRANCH_DATA = "ブランチデータを読み込み中...";
export const LOADING_GENERIC = "読み込み中...";

// Error Messages
export const ERROR_PREFIX = "エラー: ";

// Auth
export const AUTH_PROMPT_TITLE = "アクセスにはログインが必要です";
export const AUTH_PROMPT_DESCRIPTION = "Googleアカウントでサインインしてください";
export const AUTH_LOGOUT = "ログアウト";
export const AUTH_ERROR_PREFIX = "ログインエラー: ";

// Badge Labels
export const BADGE_TIMELINE = "Timeline";
export const BADGE_MAIN = "Main";

// Footer Labels
export const FOOTER_LABEL_RECENT_LINES = "タイムライン・メインブランチ・最近の更新";

// Command Labels
export const LABEL_TASK_HIGH = "高優先度タスク";
export const LABEL_TASK_MEDIUM = "通常タスク";
export const LABEL_TASK_LOW = "低優先度タスク";
export const LABEL_DOCUMENT = "ドキュメント";
export const LABEL_SESSION = "作業セッション";

// Emojis
export const EMOJI_FIRESTORE = "🔥";
export const EMOJI_SAMPLE = "📄";
export const EMOJI_SUCCESS = "✅";
export const EMOJI_ERROR = "❌";

// Data Source Controls
export const DATA_SOURCE_SECTION_TITLE = "データソース";
export const DATA_SOURCE_RELOAD_LABEL = "データソースを更新";
export const DATA_SOURCE_LABEL_FIRESTORE = "Firestore";
export const DATA_SOURCE_LABEL_SAMPLE = "サンプル";
export const DATA_SOURCE_BUTTON_FIRESTORE = "Firestore";
export const DATA_SOURCE_BUTTON_SAMPLE = "サンプルデータ";
export const DATA_SOURCE_STATUS_FIRESTORE = `${EMOJI_FIRESTORE} リアルタイムデータベースから読み込み中`;
export const DATA_SOURCE_STATUS_SAMPLE = `${EMOJI_SAMPLE} デバッグ用サンプルデータを使用中`;

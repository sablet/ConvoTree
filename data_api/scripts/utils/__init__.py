"""Utils package for history parsers"""

from .message_deduplication import (
    DEFAULT_ASSISTANT_PREFIX_PATTERNS,
    DEFAULT_EXCLUDED_COMMANDS,
    DEFAULT_MIN_MESSAGE_LENGTH,
    clean_assistant_message,
    deduplicate_by_timestamp,
    deduplicate_sequential_messages,
    is_similar_by_sequence_matcher,
    merge_by_time_window,
    should_skip_message,
    truncate_message,
)

__all__ = [
    "DEFAULT_ASSISTANT_PREFIX_PATTERNS",
    "DEFAULT_EXCLUDED_COMMANDS",
    "DEFAULT_MIN_MESSAGE_LENGTH",
    "clean_assistant_message",
    "deduplicate_by_timestamp",
    "deduplicate_sequential_messages",
    "is_similar_by_sequence_matcher",
    "merge_by_time_window",
    "should_skip_message",
    "truncate_message",
]

#!/usr/bin/env python3
"""
Message Deduplication Utilities

履歴パーサー（Gemini/ChatGPT/Claude）で共通利用する重複除去機能を提供する。
"""

import re
from collections import OrderedDict, defaultdict
from datetime import datetime
from difflib import SequenceMatcher
from typing import Dict, List, Optional, Set

# 類似判定の閾値
SEQUENCE_MATCHER_THRESHOLD = 0.9  # SequenceMatcherの類似度閾値（90%）
LEVENSHTEIN_SIMILARITY_THRESHOLD = 0.7  # Levenshtein距離の類似度閾値（70%）
DEFAULT_PREFIX_LENGTH = 20  # デフォルトの先頭文字数

# メッセージフィルタリング
DEFAULT_MIN_MESSAGE_LENGTH = 4  # デフォルトの最小メッセージ長

# Aの先頭で除去する定型句パターン（Gemini/ChatGPT共通）
DEFAULT_ASSISTANT_PREFIX_PATTERNS = [
    r"^いい質問ですね。?\s*",
    r"^良い質問ですね。?\s*",
    r"^なるほど[、。]\s*",
    r"^はい[、。]\s*",
    r"^そうですね[、。]\s*",
    r"^ありがとうございます[、。]\s*",
    r"^---+\s*",
    r"^#{1,6}\s+",  # Markdownのヘッダー
    r"^\*{3,}\s*",  # Markdownの区切り線
    r"^_{3,}\s*",  # Markdownの区切り線
]

# 除外するスラッシュコマンド（Claude用）
DEFAULT_EXCLUDED_COMMANDS = {
    "/clear",
    "/login",
    "/mcp",
    "/stickers",
    "/init",
    "/compact",
    "/agents",
    "/stashAndMoveToNewBranch",
    "/project_status",
    "/refactor-test-driven",
}


def clean_assistant_message(
    message: str, prefix_patterns: Optional[List[str]] = None, max_iterations: int = 3
) -> str:
    """
    アシスタントメッセージの先頭から情報量の薄い定型句を除去

    Args:
        message: アシスタントのメッセージ
        prefix_patterns: 除去するパターンのリスト（Noneの場合はデフォルト）
        max_iterations: パターン除去の最大繰り返し回数

    Returns:
        クリーニング済みメッセージ
    """
    if prefix_patterns is None:
        prefix_patterns = DEFAULT_ASSISTANT_PREFIX_PATTERNS

    cleaned = message

    # 各パターンを先頭から除去（最大N回まで繰り返し）
    for _ in range(max_iterations):
        original = cleaned
        for pattern in prefix_patterns:
            cleaned = re.sub(pattern, "", cleaned, count=1, flags=re.MULTILINE)

        # 変化がなければ終了
        if cleaned == original:
            break

    return cleaned.strip()


def should_skip_message(
    message: str,
    min_length: int = DEFAULT_MIN_MESSAGE_LENGTH,
    excluded_commands: Optional[Set[str]] = None,
    exclude_file_paths: bool = False,
) -> bool:
    """
    メッセージをスキップすべきか判定

    Args:
        message: メッセージテキスト
        min_length: 最小文字数（これ未満はスキップ）
        excluded_commands: 除外するコマンドのセット（Claude用、Noneの場合はデフォルト）
        exclude_file_paths: ファイルパスを除外するか（Claude用）

    Returns:
        スキップすべき場合True
    """
    display = message.strip()

    if not display:
        return True

    # 文字数チェック
    if len(display) < min_length:
        return True

    # スラッシュコマンド（Claude用）
    if excluded_commands is not None:
        first_word = display.split()[0] if display.split() else ""
        if first_word in excluded_commands:
            return True

    # ファイルパス（Claude用）
    if exclude_file_paths and display.startswith("/Users/"):
        return True

    return False


def truncate_message(message: str, max_lines: int = 2) -> str:
    """
    長いメッセージを切り詰める

    3行以上のメッセージの場合、max_lines行まで保持し、残りを "..." に置き換える

    Args:
        message: メッセージテキスト
        max_lines: 保持する最大行数

    Returns:
        切り詰められたメッセージ
    """
    lines = message.split("\n")
    if len(lines) < 3:
        return message

    # max_lines行まで保持
    truncated = lines[:max_lines]
    truncated.append("...")
    return "\n".join(truncated)


def levenshtein_distance(s1: str, s2: str) -> int:
    """
    2つの文字列間のLevenshtein距離（編集距離）を計算

    Args:
        s1: 文字列1
        s2: 文字列2

    Returns:
        編集距離
    """
    if len(s1) < len(s2):
        return levenshtein_distance(s2, s1)
    if len(s2) == 0:
        return len(s1)

    previous_row = list(range(len(s2) + 1))
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            # 挿入、削除、置換のコストを計算
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (0 if c1 == c2 else 1)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row

    return previous_row[-1]


def is_similar_by_sequence_matcher(msg1: str, msg2: str) -> bool:
    """
    SequenceMatcher（全体比較）で2つのメッセージが類似しているか判定

    Args:
        msg1: メッセージ1
        msg2: メッセージ2

    Returns:
        類似している場合True
    """
    # [Q] や [A] を除去
    text1 = msg1[4:] if msg1.startswith(("[Q] ", "[A] ")) else msg1
    text2 = msg2[4:] if msg2.startswith(("[Q] ", "[A] ")) else msg2

    if not text1 or not text2:
        return False

    similarity = SequenceMatcher(None, text1, text2).ratio()
    return similarity >= SEQUENCE_MATCHER_THRESHOLD


def is_similar_by_levenshtein(msg1: str, msg2: str, prefix_length: int = DEFAULT_PREFIX_LENGTH) -> bool:
    """
    Levenshtein距離（先頭N文字比較）で2つのメッセージが類似しているか判定

    Args:
        msg1: メッセージ1
        msg2: メッセージ2
        prefix_length: 比較する先頭文字数

    Returns:
        類似している場合True
    """
    # [Q] や [A] を除去
    text1 = msg1[4:] if msg1.startswith(("[Q] ", "[A] ")) else msg1
    text2 = msg2[4:] if msg2.startswith(("[Q] ", "[A] ")) else msg2

    # 先頭N文字を取得
    prefix1 = text1[:prefix_length]
    prefix2 = text2[:prefix_length]

    # 両方が空または同一なら類似
    if prefix1 == prefix2:
        return True

    # どちらかが空なら非類似
    if not prefix1 or not prefix2:
        return False

    # Levenshtein距離を計算
    distance = levenshtein_distance(prefix1, prefix2)

    # 類似度を計算（1 - 正規化された距離）
    max_len = max(len(prefix1), len(prefix2))
    similarity = 1.0 - (distance / max_len)

    return similarity >= LEVENSHTEIN_SIMILARITY_THRESHOLD


def is_similar_message(
    msg1: str, msg2: str, prefix_length: int = DEFAULT_PREFIX_LENGTH, similarity_threshold: float = LEVENSHTEIN_SIMILARITY_THRESHOLD
) -> bool:
    """
    2つのメッセージが類似しているかを判定（先頭N文字の部分一致率で判定）

    Args:
        msg1: メッセージ1
        msg2: メッセージ2
        prefix_length: 比較する先頭文字数（デフォルト: 20）
        similarity_threshold: 類似と判定する閾値（0.0-1.0、デフォルト: 0.7）

    Returns:
        類似している場合True
    """
    # [Q] や [A] を除去
    text1 = msg1[4:] if msg1.startswith(("[Q] ", "[A] ")) else msg1
    text2 = msg2[4:] if msg2.startswith(("[Q] ", "[A] ")) else msg2

    # 先頭N文字を取得
    prefix1 = text1[:prefix_length]
    prefix2 = text2[:prefix_length]

    # 両方が空または同一なら類似
    if prefix1 == prefix2:
        return True

    # どちらかが空なら非類似
    if not prefix1 or not prefix2:
        return False

    # Levenshtein距離を計算
    distance = levenshtein_distance(prefix1, prefix2)

    # 類似度を計算（1 - 正規化された距離）
    max_len = max(len(prefix1), len(prefix2))
    similarity = 1.0 - (distance / max_len)

    return similarity >= similarity_threshold


def deduplicate_within_session(
    messages: List[str], prefix_length: int = 20, similarity_threshold: float = 0.7
) -> List[str]:
    """
    セッション内の類似メッセージを除去（最新のみ保持）

    Args:
        messages: メッセージのリスト
        prefix_length: 比較する先頭文字数
        similarity_threshold: 類似と判定する閾値

    Returns:
        重複除去後のメッセージリスト
    """
    if len(messages) <= 1:
        return messages

    # 各メッセージについて、それより後に類似メッセージがあるかチェック
    kept_messages = []
    for i, msg in enumerate(messages):
        # このメッセージより後に類似メッセージがあるかチェック
        has_similar_later = False
        for j in range(i + 1, len(messages)):
            if is_similar_message(msg, messages[j], prefix_length, similarity_threshold):
                has_similar_later = True
                break

        # 後に類似メッセージがなければ保持
        if not has_similar_later:
            kept_messages.append(msg)

    return kept_messages


def deduplicate_by_timestamp(rows: List[Dict[str, str]], timestamp_key: str = "start_time") -> List[Dict[str, str]]:
    """
    タイムスタンプによる重複を除去（同じタイムスタンプの最後のものだけを残す）

    Args:
        rows: CSV行データのリスト
        timestamp_key: タイムスタンプのキー名

    Returns:
        重複除去後の行データリスト
    """
    # タイムスタンプをキーとしたOrderedDictを使用
    # 後から追加されたものが上書きされるため、最後のものだけが残る
    deduplicated = OrderedDict()
    for row in rows:
        timestamp = row[timestamp_key]
        deduplicated[timestamp] = row

    return list(deduplicated.values())


def deduplicate_sequential_messages(rows: List[Dict[str, str]], prefix_length: int = DEFAULT_PREFIX_LENGTH) -> List[Dict[str, str]]:
    """
    時系列順のメッセージから類似を除去（最初のメッセージを保持）

    SequenceMatcher（全体比較、90%以上）OR Levenshtein距離（先頭N文字比較、70%以上）
    どちらかにマッチしたら重複とみなして削除

    Args:
        rows: CSV行データのリスト（タイムスタンプでソート済み前提）
        prefix_length: Levenshtein比較での先頭文字数

    Returns:
        重複除去後の行データリスト
    """
    if not rows:
        return []

    kept_rows = []
    seen_messages = []

    for row in rows:
        content = row["combined_content"]

        # 既出メッセージと類似度チェック
        is_duplicate = False
        for seen in seen_messages:
            # SequenceMatcher（全体）OR Levenshtein（先頭N文字）
            if is_similar_by_sequence_matcher(content, seen) or is_similar_by_levenshtein(content, seen, prefix_length):
                is_duplicate = True
                break

        if not is_duplicate:
            kept_rows.append(row)
            seen_messages.append(content)

    return kept_rows


def deduplicate_by_prefix(rows: List[Dict[str, str]], prefix_length: int = 30) -> List[Dict[str, str]]:
    """
    先頭テキストが同じメッセージを検出し、最新のもの以外を除去

    Args:
        rows: CSV行データのリスト
        prefix_length: 比較する先頭文字数

    Returns:
        重複除去後の行データリスト
    """
    from collections import defaultdict

    # 先頭テキストでグループ化（[Q]を除いた実際のテキスト部分で比較）
    prefix_groups = defaultdict(list)

    for row in rows:
        content = row["combined_content"]
        # [Q] の後の実際のテキスト部分を取得
        if content.startswith("[Q] "):
            text_part = content[4:]  # "[Q] " を除去
        else:
            text_part = content

        # 先頭N文字を取得（改行エスケープを考慮）
        prefix = text_part[:prefix_length]
        prefix_groups[prefix].append(row)

    # 各グループで最新のもの以外を除去
    deduplicated = []

    for prefix, group in prefix_groups.items():
        if len(group) == 1:
            deduplicated.append(group[0])
        else:
            # タイムスタンプでソート（最新が最後）
            sorted_group = sorted(group, key=lambda x: x["start_time"])
            # 最新のもののみを保持
            deduplicated.append(sorted_group[-1])

    # タイムスタンプでソート
    deduplicated.sort(key=lambda x: x["start_time"])

    return deduplicated


def merge_by_time_window(
    rows: List[Dict[str, str]],
    time_window_minutes: int = 30,
    prefix_length: int = 20,
    similarity_threshold: float = 0.7,
) -> List[Dict[str, str]]:
    """
    時間的に近いメッセージを統合（Geminiのみ使用）

    Args:
        rows: CSV行データのリスト（タイムスタンプでソート済み前提）
        time_window_minutes: 統合する時間窓（分）
        prefix_length: セッション内重複判定の先頭文字数
        similarity_threshold: セッション内重複判定の閾値

    Returns:
        統合後の行データリスト
    """
    if not rows:
        return []

    merged = []
    current_group = [rows[0]]

    for i in range(1, len(rows)):
        prev_row = current_group[-1]
        current_row = rows[i]

        # タイムスタンプをパース
        prev_time = datetime.strptime(prev_row["start_time"], "%Y-%m-%d %H:%M")
        current_time = datetime.strptime(current_row["start_time"], "%Y-%m-%d %H:%M")

        # 時間差を計算（絶対値で判定）
        time_diff = abs((current_time - prev_time).total_seconds() / 60)  # 分単位

        if time_diff <= time_window_minutes:
            # 同じグループに追加
            current_group.append(current_row)
        else:
            # 現在のグループをマージして保存
            merged.append(_merge_group(current_group, prefix_length, similarity_threshold))
            # 新しいグループを開始
            current_group = [current_row]

    # 最後のグループをマージ
    merged.append(_merge_group(current_group, prefix_length, similarity_threshold))

    return merged


def _merge_group(
    group: List[Dict[str, str]], prefix_length: int = 20, similarity_threshold: float = 0.7
) -> Dict[str, str]:
    """
    同じグループのメッセージを1つにマージ

    Args:
        group: マージするメッセージグループ
        prefix_length: セッション内重複判定の先頭文字数
        similarity_threshold: セッション内重複判定の閾値

    Returns:
        マージされたメッセージ
    """
    if len(group) == 1:
        return group[0]

    # 最初と最後のタイムスタンプを使用
    start_time = group[0]["start_time"]
    end_time = group[-1]["start_time"]

    # すべてのメッセージを収集
    combined_contents = []
    for row in group:
        combined_contents.append(row["combined_content"])

    # セッション内の類似メッセージを除去
    deduplicated_contents = deduplicate_within_session(combined_contents, prefix_length, similarity_threshold)

    # \\n\\n で区切って結合
    merged_content = "\\n\\n".join(deduplicated_contents)

    return {
        "full_path": group[0]["full_path"],
        "start_time": start_time,
        "end_time": end_time,
        "combined_content": merged_content,
    }

#!/usr/bin/env python3
"""
Claude History Parser

~/.claude/history.jsonl を messages_with_hierarchy.csv と同じフォーマットのCSVに変換する。

使用例:
  # 基本的な使い方
  python scripts/claude_history_parser.py parse

  # 詳細なオプション指定
  python scripts/claude_history_parser.py parse \
    --input_path=~/.claude/history.jsonl \
    --output_dir=output/claude-history \
    --config_path=scripts/config/line_mapping.yaml

  # フィルタ設定
  python scripts/claude_history_parser.py parse \
    --min_message_length=10 \
    --similarity_threshold=0.85 \
    --time_threshold_minutes=20

  # セッション間の重複削除を無効化
  python scripts/claude_history_parser.py parse \
    --remove_cross_session_dups=False

主な機能:
  - 6文字以下のメッセージを除外
  - 7行以上のメッセージを3行 + "..." に切り詰め
  - セッション内およびセッション間の重複メッセージを削除
  - LINEマッピング設定（scripts/config/line_mapping.yaml）でfull_pathをカスタマイズ
"""

import csv
import json
import sys
from datetime import datetime
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

import fire  # type: ignore[import-untyped]
import yaml

# 除外するスラッシュコマンド
EXCLUDED_COMMANDS = {
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


def load_line_mapping(config_path: Path | None = None) -> dict[str, str]:
    """
    LINE マッピング設定を読み込む

    Args:
        config_path: 設定ファイルパス（Noneの場合はデフォルト）

    Returns:
        line_id → 表示名のマッピング辞書
    """
    if config_path is None:
        # デフォルトパス: scripts/config/line_mapping.yaml
        default_path = Path(__file__).parent / "config" / "line_mapping.yaml"
        if not default_path.exists():
            # 設定ファイルがない場合は空のマッピング
            return {}
        config_path = default_path

    if not config_path.exists():
        print(f"Warning: Config file not found: {config_path}", file=sys.stderr)
        return {}

    try:
        with config_path.open("r", encoding="utf-8") as f:
            config = yaml.safe_load(f)
            return config.get("line_mapping", {})
    except Exception as e:
        print(f"Warning: Failed to load config: {e}", file=sys.stderr)
        return {}


def project_to_line_id(project_path: str) -> str:
    """プロジェクトパスからline_idを生成"""
    parts = project_path.split("/")

    # 'git_dir' 以降のパスを使用
    if "git_dir" in parts:
        idx = parts.index("git_dir")
        return "/".join(parts[idx + 1 :])

    # git_dirがない場合は最後の2つのディレクトリを使用
    if len(parts) >= 2:
        return "/".join(parts[-2:])

    # それでもない場合は最後のディレクトリ
    return parts[-1] if parts else "unknown"


def apply_line_mapping(line_id: str, mapping: dict[str, str]) -> str:
    """
    line_idをマッピング設定に従って変換（部分一致）

    Args:
        line_id: プロジェクトパスから生成されたline_id
        mapping: マッピング辞書（キー: パターン, 値: 表示名）

    Returns:
        マッピングされた表示名（マッピングがない場合は元のline_id）

    Note:
        - より長い（具体的な）パターンを優先してマッチング
        - 部分一致でマッチング（line_idにパターンが含まれていればマッチ）
    """
    # より長いパターンを優先するため、キーを長さの降順でソート
    sorted_patterns = sorted(mapping.keys(), key=len, reverse=True)

    for pattern in sorted_patterns:
        if pattern in line_id:
            return mapping[pattern]

    # マッチしない場合は元のline_idを返す
    return line_id


def format_timestamp(timestamp_ms: int) -> str:
    """UNIXタイムスタンプ（ミリ秒）を 'YYYY-MM-DD HH:MM' 形式に変換"""
    dt = datetime.fromtimestamp(timestamp_ms / 1000)
    return dt.strftime("%Y-%m-%d %H:%M")


def truncate_long_message(message: str, max_lines: int = 3) -> str:
    """
    長いメッセージを切り詰める

    7行以上のメッセージの場合、max_lines行まで保持し、残りを "..." に置き換える
    """
    lines = message.split("\n")
    if len(lines) <= max_lines:
        return message

    # max_lines行まで保持
    truncated = lines[:max_lines]
    truncated.append("...")
    return "\n".join(truncated)


def calculate_similarity(text1: str, text2: str) -> float:
    """2つのテキストの類似度を計算（0.0〜1.0）"""
    return SequenceMatcher(None, text1, text2).ratio()


def preprocess_entry(entry: dict[str, Any]) -> dict[str, Any]:
    """
    エントリの前処理

    - 7行以上のメッセージを切り詰める
    """
    processed = entry.copy()
    display = processed.get("display", "")
    processed["display"] = truncate_long_message(display)
    return processed


def should_skip_entry(entry: dict[str, Any], min_length: int = 7) -> bool:
    """
    エントリをスキップすべきか判定

    Args:
        entry: エントリ
        min_length: 最小文字数（これ未満はスキップ）
    """
    display = entry.get("display", "").strip()

    if not display:
        return True

    # 6文字以下のメッセージはスキップ
    if len(display) < min_length:
        return True

    # スラッシュコマンド
    first_word = display.split()[0] if display.split() else ""
    if first_word in EXCLUDED_COMMANDS:
        return True

    # ファイルパス（メッセージではない）
    if display.startswith("/Users/"):
        return True

    return False


def is_session_boundary(
    current: dict[str, Any],
    prev: dict[str, Any],
    time_threshold_minutes: float = 30.0,
) -> bool:
    """セッションの境界かどうかを判定"""
    # プロジェクトが変わった
    if current["project"] != prev["project"]:
        return True

    # sessionIdベースの判定
    curr_session = current.get("sessionId")
    prev_session = prev.get("sessionId")

    if curr_session is not None and prev_session is not None:
        if curr_session != prev_session:
            return True
    else:
        # sessionIdがない場合は時間ベースで判定
        time_diff_minutes = (current["timestamp"] - prev["timestamp"]) / 1000 / 60
        if time_diff_minutes > time_threshold_minutes:
            return True

    return False


def remove_duplicates_from_session(
    session: list[dict[str, Any]], similarity_threshold: float = 0.9
) -> list[dict[str, Any]]:
    """
    セッション内のほぼ同じメッセージを削除

    Args:
        session: セッション内のエントリリスト
        similarity_threshold: 類似度の閾値（この値以上で重複とみなす）

    Returns:
        重複を削除したエントリリスト
    """
    if not session:
        return session

    filtered: list[dict[str, Any]] = []
    seen_messages: list[str] = []

    for entry in session:
        display = entry.get("display", "").strip()

        # 既存メッセージと類似度チェック
        is_duplicate = False
        for seen in seen_messages:
            similarity = calculate_similarity(display, seen)
            if similarity >= similarity_threshold:
                is_duplicate = True
                break

        if not is_duplicate:
            filtered.append(entry)
            seen_messages.append(display)

    return filtered


def group_into_sessions(
    entries: list[dict[str, Any]], time_threshold_minutes: float = 30.0
) -> list[list[dict[str, Any]]]:
    """エントリをセッション単位でグループ化"""
    sessions: list[list[dict[str, Any]]] = []
    current_session: list[dict[str, Any]] = []

    for i, entry in enumerate(entries):
        # /clear はセッション区切りとして扱う
        display = entry.get("display", "").strip()
        if display == "/clear":
            if current_session:
                sessions.append(current_session)
                current_session = []
            continue

        # スキップ対象
        if should_skip_entry(entry):
            continue

        # セッション境界判定
        if i > 0 and current_session:
            prev_entry = entries[i - 1]
            if is_session_boundary(entry, prev_entry, time_threshold_minutes):
                sessions.append(current_session)
                current_session = []

        current_session.append(entry)

    # 最後のセッションを追加
    if current_session:
        sessions.append(current_session)

    return sessions


def create_combined_content(session: list[dict[str, Any]]) -> str:
    """セッション内のメッセージを結合"""
    messages = [entry["display"] for entry in session if not should_skip_entry(entry)]
    return "\n".join(messages)


def remove_cross_session_duplicates(
    sessions: list[list[dict[str, Any]]], similarity_threshold: float = 0.9
) -> list[list[dict[str, Any]]]:
    """
    セッション間の重複メッセージを削除

    同じプロジェクト内で、前のセッションと類似したメッセージがある場合は削除する
    """
    if not sessions:
        return sessions

    filtered_sessions: list[list[dict[str, Any]]] = []
    project_seen_messages: dict[str, list[str]] = {}

    for session in sessions:
        if not session:
            continue

        project = session[0].get("project", "")
        filtered_session: list[dict[str, Any]] = []

        # プロジェクトごとの既出メッセージリストを取得
        if project not in project_seen_messages:
            project_seen_messages[project] = []

        for entry in session:
            display = entry.get("display", "").strip()

            # 既出メッセージと類似度チェック
            is_duplicate = False
            for seen in project_seen_messages[project]:
                similarity = calculate_similarity(display, seen)
                if similarity >= similarity_threshold:
                    is_duplicate = True
                    break

            if not is_duplicate:
                filtered_session.append(entry)
                project_seen_messages[project].append(display)

        if filtered_session:
            filtered_sessions.append(filtered_session)

    return filtered_sessions


def parse_history(
    input_path: str = "~/.claude/history.jsonl",
    output_dir: str = "output/claude-history",
    time_threshold_minutes: float = 30.0,
    min_message_length: int = 7,
    similarity_threshold: float = 0.9,
    remove_cross_session_dups: bool = True,
    config_path: str | None = None,
) -> None:
    """
    Claude履歴をパースしてCSVに変換

    Args:
        input_path: 入力JSONLファイルパス
        output_dir: 出力ディレクトリ
        time_threshold_minutes: セッション区切りの時間閾値（分）
        min_message_length: 最小メッセージ文字数
        similarity_threshold: 重複判定の類似度閾値
        remove_cross_session_dups: セッション間の重複も削除するか
        config_path: LINEマッピング設定ファイルパス
    """
    # パスを展開
    input_file = Path(input_path).expanduser()
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    print(f"Reading from: {input_file}")

    # LINEマッピング設定を読み込み
    config_file = Path(config_path).expanduser() if config_path else None
    line_mapping = load_line_mapping(config_file)
    if line_mapping:
        print(f"Loaded {len(line_mapping)} line mappings from config")

    if not input_file.exists():
        print(f"Error: Input file not found: {input_file}", file=sys.stderr)
        sys.exit(1)

    # JSONLファイルを読み込み
    entries: list[dict[str, Any]] = []
    skipped_lines = 0

    with input_file.open("r", encoding="utf-8") as f:
        for line_no, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue

            try:
                entry = json.loads(line)
                entries.append(entry)
            except json.JSONDecodeError as e:
                print(
                    f"Warning: Skipping invalid JSON at line {line_no}: {e}",
                    file=sys.stderr,
                )
                skipped_lines += 1

    print(f"Loaded {len(entries)} entries ({skipped_lines} skipped)")

    # エントリの前処理（行数制限）
    print("Preprocessing entries (truncating long messages)...")
    entries = [preprocess_entry(entry) for entry in entries]

    # タイムスタンプでソート
    entries.sort(key=lambda x: x.get("timestamp", 0))

    # セッションにグループ化
    sessions = group_into_sessions(entries, time_threshold_minutes)
    print(f"Grouped into {len(sessions)} sessions")

    # セッション内の重複を削除
    print("Removing duplicates within sessions...")
    filtered_sessions = [
        remove_duplicates_from_session(session, similarity_threshold)
        for session in sessions
    ]

    # 統計（セッション内重複削除後）
    original_messages = sum(len(s) for s in sessions)
    after_within_session_dedup = sum(len(s) for s in filtered_sessions)
    print(
        f"Removed {original_messages - after_within_session_dedup} duplicate messages within sessions "
        f"({original_messages} → {after_within_session_dedup})"
    )

    # セッション間の重複を削除（オプション）
    final_sessions = filtered_sessions
    cross_session_dups_removed = 0
    if remove_cross_session_dups:
        print("Removing duplicates across sessions...")
        final_sessions = remove_cross_session_duplicates(
            filtered_sessions, similarity_threshold
        )
        after_cross_session_dedup = sum(len(s) for s in final_sessions)
        cross_session_dups_removed = after_within_session_dedup - after_cross_session_dedup
        print(
            f"Removed {cross_session_dups_removed} duplicate messages across sessions "
            f"({after_within_session_dedup} → {after_cross_session_dedup})"
        )

    filtered_messages = sum(len(s) for s in final_sessions)

    # CSV出力
    csv_path = output_path / "parsed_messages.csv"
    stats: dict[str, int] = {}

    with csv_path.open("w", encoding="utf-8", newline="") as csvfile:
        writer = csv.writer(csvfile, quoting=csv.QUOTE_MINIMAL)
        writer.writerow(["full_path", "start_time", "end_time", "combined_content"])

        for session in final_sessions:
            if not session:
                continue

            # LINE名を取得
            line_id = project_to_line_id(session[0]["project"])

            # マッピングを適用
            display_name = apply_line_mapping(line_id, line_mapping)

            # 開始・終了時刻
            start_time = format_timestamp(session[0]["timestamp"])
            end_time = format_timestamp(session[-1]["timestamp"])

            # メッセージ結合
            combined_content = create_combined_content(session)

            if not combined_content:
                continue

            writer.writerow([display_name, start_time, end_time, combined_content])

            # 統計（表示名で集計）
            stats[display_name] = stats.get(display_name, 0) + 1

    print(f"\nCSV written to: {csv_path}")
    print(f"\nLine statistics:")
    for line_id in sorted(stats.keys()):
        print(f"  {line_id}: {stats[line_id]} sessions")

    # プロジェクトマッピングをJSON出力
    mapping_path = output_path / "project_line_mapping.json"
    project_mapping = {}
    for entry in entries:
        project = entry.get("project", "")
        if project:
            line_id = project_to_line_id(project)
            project_mapping[project] = line_id

    with mapping_path.open("w", encoding="utf-8") as f:
        json.dump(project_mapping, f, indent=2, ensure_ascii=False)

    print(f"Project mapping written to: {mapping_path}")

    # 統計情報をJSON出力
    stats_path = output_path / "statistics.json"
    statistics = {
        "total_entries": len(entries),
        "skipped_lines": skipped_lines,
        "total_sessions": len(sessions),
        "total_messages_before_dedup": original_messages,
        "total_messages_after_dedup": filtered_messages,
        "duplicates_removed_within_sessions": original_messages - after_within_session_dedup,
        "duplicates_removed_across_sessions": cross_session_dups_removed,
        "duplicates_removed_total": original_messages - filtered_messages,
        "line_distribution": stats,
        "filters": {
            "min_message_length": min_message_length,
            "similarity_threshold": similarity_threshold,
            "time_threshold_minutes": time_threshold_minutes,
            "remove_cross_session_duplicates": remove_cross_session_dups,
        },
    }

    with stats_path.open("w", encoding="utf-8") as f:
        json.dump(statistics, f, indent=2, ensure_ascii=False)

    print(f"Statistics written to: {stats_path}")


class CLI:
    """Claude History Parser CLI"""

    def parse(
        self,
        input_path: str = "~/.claude/history.jsonl",
        output_dir: str = "output/claude-history",
        time_threshold_minutes: float = 30.0,
        min_message_length: int = 7,
        similarity_threshold: float = 0.9,
        remove_cross_session_dups: bool = True,
        config_path: str | None = None,
    ) -> None:
        """
        Claude履歴をパースしてCSVに変換

        Args:
            input_path: 入力JSONLファイルパス
            output_dir: 出力ディレクトリ
            time_threshold_minutes: セッション区切りの時間閾値（分）
            min_message_length: 最小メッセージ文字数（これ未満はスキップ）
            similarity_threshold: 重複判定の類似度閾値（0.0〜1.0）
            remove_cross_session_dups: セッション間の重複も削除するか
            config_path: LINEマッピング設定ファイルパス（Noneの場合はscripts/config/line_mapping.yaml）
        """
        parse_history(
            input_path,
            output_dir,
            time_threshold_minutes,
            min_message_length,
            similarity_threshold,
            remove_cross_session_dups,
            config_path,
        )


if __name__ == "__main__":
    fire.Fire(CLI)

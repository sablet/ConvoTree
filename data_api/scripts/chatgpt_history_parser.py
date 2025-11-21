#!/usr/bin/env python3
"""
ChatGPT History Parser

ChatGPTのconversations.jsonを messages_with_hierarchy.csv と同じフォーマットのCSVに変換する。

使用例:
  # 基本的な使い方（config.yamlから設定を読み込む）
  python scripts/chatgpt_history_parser.py parse

  # 入出力パスを明示的に指定
  python scripts/chatgpt_history_parser.py parse \
    --input_path=/path/to/conversations.json \
    --output_dir=output/chatgpt-history

  # 処理件数を制限（テスト用）
  python scripts/chatgpt_history_parser.py parse --limit=100

  # カスタム設定ファイルを使用
  python scripts/chatgpt_history_parser.py parse \
    --config_path=custom_config.yaml

主な機能:
  - デフォルトでQのみ抽出（--include_assistantでAも含める）
  - Q/Aそれぞれが3行以上の場合、2行 + "..." に切り詰め
  - 会話ごとに時系列順にメッセージを結合
  - 会話タイトルをcombined_contentの先頭に追加
  - 改行を\nに置き換え
  - 4文字以下のメッセージは省略
  - Aの先頭の定型句を除去
  - タイムスタンプによる重複除去
  - 類似メッセージの除去（SequenceMatcher OR Levenshtein距離、最初のメッセージを保持）
"""

import csv
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import fire  # type: ignore[import-untyped]
import yaml

from utils.message_deduplication import (
    clean_assistant_message,
    deduplicate_by_timestamp,
    deduplicate_sequential_messages,
    should_skip_message,
    truncate_message,
)


def load_config(config_path: Optional[Path] = None) -> Dict[str, Any]:
    """
    設定ファイルを読み込む

    Args:
        config_path: 設定ファイルパス（Noneの場合はデフォルト）

    Returns:
        設定辞書
    """
    if config_path is None:
        # デフォルトパス: data_api/config.yaml
        default_path = Path(__file__).parent.parent / "config.yaml"
        if not default_path.exists():
            return {}
        config_path = default_path

    if not config_path.exists():
        print(f"Warning: Config file not found: {config_path}", file=sys.stderr)
        return {}

    try:
        with config_path.open("r", encoding="utf-8") as f:
            config = yaml.safe_load(f)
            return config or {}
    except Exception as e:
        print(f"Warning: Failed to load config: {e}", file=sys.stderr)
        return {}


def format_timestamp(timestamp: float) -> str:
    """UNIXタイムスタンプ（秒）を 'YYYY-MM-DD HH:MM' 形式に変換"""
    dt = datetime.fromtimestamp(timestamp)
    return dt.strftime("%Y-%m-%d %H:%M")


def extract_messages_from_mapping(mapping: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    mappingオブジェクトからメッセージを時系列順に抽出

    Args:
        mapping: 会話のmappingオブジェクト

    Returns:
        メッセージのリスト（時系列順）
    """
    messages = []

    for node_id, node in mapping.items():
        msg = node.get("message")
        if not msg:
            continue

        role = msg.get("author", {}).get("role", "unknown")
        # user と assistant のメッセージのみを抽出
        if role not in ["user", "assistant"]:
            continue

        create_time = msg.get("create_time")
        if not create_time:
            continue

        content_parts = msg.get("content", {}).get("parts", [])
        if not content_parts:
            continue

        # パーツを結合してコンテンツを作成
        content = " ".join([str(part) for part in content_parts if part])

        messages.append(
            {
                "time": datetime.fromtimestamp(create_time),
                "role": role,
                "content": content.strip(),
            }
        )

    # 時系列順にソート
    messages.sort(key=lambda x: x["time"])
    return messages


def process_conversation(conv: Dict[str, Any], include_assistant: bool = False) -> Optional[Dict[str, str]]:
    """
    1つの会話を処理してCSV行データを生成

    Args:
        conv: 会話オブジェクト
        include_assistant: Assistantメッセージを含めるか（デフォルト: False = Qのみ）

    Returns:
        CSV行データ（full_path, start_time, end_time, combined_content）
        メッセージがない場合はNone
    """
    title = conv.get("title", "Untitled")
    mapping = conv.get("mapping", {})

    messages = extract_messages_from_mapping(mapping)

    if not messages:
        return None

    # 時刻範囲
    start_time = messages[0]["time"]
    end_time = messages[-1]["time"]

    # 全メッセージを結合（3行以上は2行+...に切り詰める）
    combined_parts = []
    for msg in messages:
        # include_assistant=False の場合、assistantメッセージをスキップ
        if not include_assistant and msg["role"] == "assistant":
            continue

        content = msg["content"]

        # 4文字以下のメッセージはスキップ
        if should_skip_message(content, min_length=5):
            continue

        # アシスタントメッセージの場合、先頭の定型句を除去
        if msg["role"] == "assistant":
            content = clean_assistant_message(content)

            # クリーニング後も4文字以下ならスキップ
            if should_skip_message(content, min_length=5):
                continue

        # メッセージを切り詰め
        truncated_content = truncate_message(content)

        # メッセージ内の改行を\nに置き換え
        truncated_content = truncated_content.replace("\n", "\\n")

        # プレフィックスを追加
        prefix = "[Q] " if msg["role"] == "user" else "[A] "
        combined_parts.append(f"{prefix}{truncated_content}")

    # 有効なメッセージがない場合
    if not combined_parts:
        return None

    # 会話タイトル内の改行も置き換え
    title_escaped = title.replace("\n", "\\n")

    # 会話タイトルを先頭に追加
    combined_parts.insert(0, f"[Title] {title_escaped}")

    # パーツを\nで結合（実際のバックスラッシュn）
    combined_content = "\\n".join(combined_parts)

    return {
        "full_path": "chatgpt",  # full_pathは"chatgpt"固定
        "start_time": format_timestamp(start_time.timestamp()),
        "end_time": format_timestamp(end_time.timestamp()),
        "combined_content": combined_content,
    }


def parse_chatgpt_history(
    input_path: str,
    output_dir: str,
    limit: Optional[int] = None,
    include_assistant: bool = False,
) -> None:
    """
    ChatGPT履歴をパースしてCSVに変換

    Args:
        input_path: 入力JSONファイルパス
        output_dir: 出力ディレクトリ
        limit: 処理する会話数の上限（Noneの場合は全て処理）
        include_assistant: Assistantメッセージを含めるか（デフォルト: False = Qのみ）
    """
    # パスを展開
    input_file = Path(input_path).expanduser()
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    print(f"Reading from: {input_file}")
    print(f"File size: {input_file.stat().st_size / 1024 / 1024:.1f} MB")

    if not input_file.exists():
        print(f"Error: Input file not found: {input_file}", file=sys.stderr)
        sys.exit(1)

    # JSONファイルを読み込み
    print("Loading JSON file...")
    with open(input_file, "r", encoding="utf-8") as f:
        conversations = json.load(f)

    total_conversations = len(conversations)
    print(f"Loaded {total_conversations} conversations")

    # 処理する会話数を制限
    if limit:
        conversations = conversations[:limit]
        print(f"Processing first {limit} conversations (limit applied)")

    # 全会話を処理してrow_dataのリストを作成
    print("\nProcessing conversations...")
    processed = 0
    skipped = 0
    all_rows = []

    for i, conv in enumerate(conversations, 1):
        # 100件ごとに進捗表示
        if i % 100 == 0:
            print(f"  Processing... {i}/{len(conversations)} conversations ({i*100//len(conversations)}%)")

        row_data = process_conversation(conv, include_assistant=include_assistant)

        if row_data:
            all_rows.append(row_data)
            processed += 1
        else:
            skipped += 1

    # タイムスタンプで重複を除去
    print("\nDeduplicating by timestamp...")
    timestamp_dedup_rows = deduplicate_by_timestamp(all_rows)
    timestamp_dedup_count = processed - len(timestamp_dedup_rows)

    print(f"  Removed {timestamp_dedup_count} duplicate timestamp entries")
    print(f"  After timestamp dedup: {len(timestamp_dedup_rows)} rows")

    # 類似メッセージを除去（SequenceMatcher OR Levenshtein）
    print("\nDeduplicating sequential messages...")
    before_dedup_count = len(timestamp_dedup_rows)
    final_rows = deduplicate_sequential_messages(timestamp_dedup_rows)
    sequential_dedup_count = before_dedup_count - len(final_rows)

    print(f"  Removed {sequential_dedup_count} similar messages (keeping first)")
    print(f"  Final output count: {len(final_rows)}")

    # CSV出力
    csv_path = output_path / "parsed_messages.csv"
    print(f"\nWriting CSV...")

    with csv_path.open("w", encoding="utf-8", newline="") as csvfile:
        writer = csv.writer(csvfile, quoting=csv.QUOTE_MINIMAL)
        writer.writerow(["full_path", "start_time", "end_time", "combined_content"])

        for row_data in final_rows:
            writer.writerow(
                [
                    row_data["full_path"],
                    row_data["start_time"],
                    row_data["end_time"],
                    row_data["combined_content"],
                ]
            )

    print(f"CSV written to: {csv_path}")
    print(f"\nStatistics:")
    print(f"  Total conversations: {total_conversations}")
    print(f"  Processed: {processed}")
    print(f"  Skipped (no messages): {skipped}")
    print(f"  After timestamp dedup: {len(timestamp_dedup_rows)}")
    print(f"  After sequential dedup: {len(final_rows)}")
    print(f"  Final output count: {len(final_rows)}")

    # 統計情報をJSON出力
    stats_path = output_path / "statistics.json"
    statistics = {
        "total_conversations": total_conversations,
        "processed_conversations": processed,
        "skipped_conversations": skipped,
        "timestamp_dedup_count": len(timestamp_dedup_rows),
        "sequential_dedup_count": len(final_rows),
        "final_output_count": len(final_rows),
        "limit_applied": limit,
    }

    with stats_path.open("w", encoding="utf-8") as f:
        json.dump(statistics, f, indent=2, ensure_ascii=False)

    print(f"Statistics written to: {stats_path}")


class CLI:
    """ChatGPT History Parser CLI"""

    def parse(
        self,
        input_path: Optional[str] = None,
        output_dir: Optional[str] = None,
        limit: Optional[int] = None,
        include_assistant: bool = False,
        config_path: Optional[str] = None,
    ) -> None:
        """
        ChatGPT履歴をパースしてCSVに変換

        Args:
            input_path: 入力JSONファイルパス（Noneの場合はconfig.yamlから取得）
            output_dir: 出力ディレクトリ（Noneの場合はconfig.yamlから取得）
            limit: 処理する会話数の上限（テスト用、Noneの場合は全て処理）
            include_assistant: Assistantメッセージを含めるか（デフォルト: False = Qのみ）
            config_path: 設定ファイルパス（Noneの場合はdata_api/config.yaml）
        """
        # 設定ファイルを読み込み
        config_file = Path(config_path).expanduser() if config_path else None
        config = load_config(config_file)

        # config.yamlからデフォルト値を取得
        chatgpt_config = config.get("parsers", {}).get("chatgpt", {})

        # パラメータが指定されていない場合、config.yamlから取得
        final_input_path = input_path or chatgpt_config.get(
            "input_path",
            "/Users/mikke/Downloads/98e96bc0b6dac515d2f490fdf85f5f18002a282106d8ac4a30f9033021d2e4d4-2025-11-13-11-11-29-9d4f6d2d4eae48e9a7d4f59ea5a13a74/conversations.json",
        )
        final_output_dir = output_dir or chatgpt_config.get(
            "output_dir", "output/chatgpt-history"
        )

        parse_chatgpt_history(final_input_path, final_output_dir, limit, include_assistant)


if __name__ == "__main__":
    fire.Fire(CLI)

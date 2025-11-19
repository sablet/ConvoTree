#!/usr/bin/env python3
"""
Gemini History Parser

Google Takeoutのマイアクティビティ.htmlを messages_with_hierarchy.csv と同じフォーマットのCSVに変換する。

使用例:
  # 基本的な使い方（config.yamlから設定を読み込む）
  python scripts/gemini_history_parser.py parse

  # 入出力パスを明示的に指定
  python scripts/gemini_history_parser.py parse \
    --input_path=/path/to/マイアクティビティ.html \
    --output_dir=output/gemini-history

  # 処理件数を制限（テスト用）
  python scripts/gemini_history_parser.py parse --limit=100

  # カスタム設定ファイルを使用
  python scripts/gemini_history_parser.py parse \
    --config_path=custom_config.yaml

主な機能:
  - Q/Aそれぞれが3行以上の場合、2行 + "..." に切り詰め
  - アクティビティごとにメッセージを結合
  - 改行を\\nに置き換え
  - 4文字以下のメッセージは省略
  - Aの先頭の定型句を除去
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
from bs4 import BeautifulSoup

# Aの先頭で除去する定型句パターン
ASSISTANT_PREFIX_PATTERNS = [
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


def clean_assistant_message(message: str) -> str:
    """
    アシスタントメッセージの先頭から情報量の薄い定型句を除去

    Args:
        message: アシスタントのメッセージ

    Returns:
        クリーニング済みメッセージ
    """
    cleaned = message

    # 各パターンを先頭から除去（最大3回まで繰り返し）
    for _ in range(3):
        original = cleaned
        for pattern in ASSISTANT_PREFIX_PATTERNS:
            cleaned = re.sub(pattern, "", cleaned, count=1, flags=re.MULTILINE)

        # 変化がなければ終了
        if cleaned == original:
            break

    return cleaned.strip()


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


def format_timestamp(timestamp_str: str) -> str:
    """
    'YYYY/MM/DD HH:MM:SS JST' を 'YYYY-MM-DD HH:MM' 形式に変換

    Args:
        timestamp_str: 元のタイムスタンプ文字列

    Returns:
        フォーマット済みタイムスタンプ
    """
    # "2025/11/13 20:10:22 JST" -> datetime
    dt = datetime.strptime(timestamp_str.replace(" JST", ""), "%Y/%m/%d %H:%M:%S")
    return dt.strftime("%Y-%m-%d %H:%M")


def extract_activity_data(activity_div: Any) -> Optional[Dict[str, str]]:
    """
    1つのアクティビティブロックからデータを抽出

    Args:
        activity_div: BeautifulSoupのアクティビティ要素

    Returns:
        抽出されたデータ（user_message, timestamp, assistant_response）
        抽出できない場合はNone
    """
    content_cells = activity_div.find_all("div", class_="content-cell")
    if not content_cells:
        return None

    # 最初のセルにユーザーメッセージとGeminiの応答が含まれる
    first_cell = content_cells[0]
    text = first_cell.get_text()

    # ユーザーメッセージとタイムスタンプを抽出
    # パターン: "送信したメッセージ: XXX\n2025/11/13 20:10:22 JST"
    pattern = r"送信したメッセージ:\s*(.*?)\s*(\d{4}/\d{2}/\d{2}\s+\d{1,2}:\d{2}:\d{2}\s+JST)"
    match = re.search(pattern, text, re.DOTALL)

    if not match:
        return None

    user_message = match.group(1).strip()
    timestamp_str = match.group(2).strip()

    # Geminiの応答を抽出（タイムスタンプ以降、サービス情報の前まで）
    # タイムスタンプの後の部分を取得
    timestamp_pos = text.find(timestamp_str)
    if timestamp_pos == -1:
        assistant_response = ""
    else:
        after_timestamp = text[timestamp_pos + len(timestamp_str) :]
        # "サービス:" より前の部分を取得
        service_pos = after_timestamp.find("サービス:")
        if service_pos != -1:
            assistant_response = after_timestamp[:service_pos].strip()
        else:
            assistant_response = after_timestamp.strip()

    return {
        "user_message": user_message,
        "timestamp": timestamp_str,
        "assistant_response": assistant_response,
    }


def process_activity(activity_data: Dict[str, str]) -> Optional[Dict[str, str]]:
    """
    1つのアクティビティを処理してCSV行データを生成

    Args:
        activity_data: extract_activity_dataで抽出されたデータ

    Returns:
        CSV行データ（full_path, start_time, end_time, combined_content）
        メッセージがない場合はNone
    """
    user_msg = activity_data["user_message"]
    assistant_msg = activity_data["assistant_response"]
    timestamp_str = activity_data["timestamp"]

    # 4文字以下のユーザーメッセージはスキップ
    if len(user_msg.strip()) <= 4:
        return None

    # アシスタントメッセージの処理
    if assistant_msg:
        # 先頭の定型句を除去
        assistant_msg = clean_assistant_message(assistant_msg)

        # 4文字以下ならスキップ
        if len(assistant_msg.strip()) <= 4:
            assistant_msg = ""

    # メッセージを切り詰め
    user_truncated = truncate_message(user_msg)
    assistant_truncated = truncate_message(assistant_msg) if assistant_msg else ""

    # 改行を\\nに置き換え
    user_escaped = user_truncated.replace("\n", "\\n")
    assistant_escaped = assistant_truncated.replace("\n", "\\n") if assistant_truncated else ""

    # combined_contentを構築
    combined_parts = [f"[Q] {user_escaped}"]
    if assistant_escaped:
        combined_parts.append(f"[A] {assistant_escaped}")

    combined_content = "\\n".join(combined_parts)

    # タイムスタンプをフォーマット
    formatted_time = format_timestamp(timestamp_str)

    return {
        "full_path": "gemini",  # full_pathは"gemini"固定
        "start_time": formatted_time,
        "end_time": formatted_time,  # Geminiは1つのQ/Aなので同じ時刻
        "combined_content": combined_content,
    }


def parse_gemini_history(
    input_path: str,
    output_dir: str,
    limit: Optional[int] = None,
) -> None:
    """
    Gemini履歴をパースしてCSVに変換

    Args:
        input_path: 入力HTMLファイルパス
        output_dir: 出力ディレクトリ
        limit: 処理するアクティビティ数の上限（Noneの場合は全て処理）
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

    # HTMLファイルを読み込み
    print("Loading HTML file...")
    with open(input_file, "r", encoding="utf-8") as f:
        html_content = f.read()

    # BeautifulSoupでパース
    print("Parsing HTML...")
    soup = BeautifulSoup(html_content, "html.parser")

    # 全アクティビティを取得
    activities = soup.find_all("div", class_="outer-cell")
    total_activities = len(activities)
    print(f"Loaded {total_activities} activities")

    # 処理するアクティビティ数を制限
    if limit:
        activities = activities[:limit]
        print(f"Processing first {limit} activities (limit applied)")

    # 全アクティビティを処理してrow_dataのリストを作成
    print("\nProcessing activities...")
    processed = 0
    skipped = 0
    all_rows = []

    for i, activity in enumerate(activities, 1):
        # 100件ごとに進捗表示
        if i % 100 == 0:
            print(
                f"  Processing... {i}/{len(activities)} activities ({i*100//len(activities)}%)"
            )

        # アクティビティからデータを抽出
        activity_data = extract_activity_data(activity)
        if not activity_data:
            skipped += 1
            continue

        # CSV行データを生成
        row_data = process_activity(activity_data)

        if row_data:
            all_rows.append(row_data)
            processed += 1
        else:
            skipped += 1

    # タイムスタンプで重複を除去（同じタイムスタンプの最後のものだけを残す）
    print("\nDeduplicating by timestamp...")
    from collections import OrderedDict

    # タイムスタンプをキーとしたOrderedDictを使用
    # 後から追加されたものが上書きされるため、最後のものだけが残る
    deduplicated = OrderedDict()
    for row in all_rows:
        timestamp = row["start_time"]
        deduplicated[timestamp] = row

    deduplicated_count = processed - len(deduplicated)
    final_rows = list(deduplicated.values())

    print(f"  Removed {deduplicated_count} duplicate timestamp entries")
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
    print(f"  Total activities: {total_activities}")
    print(f"  Processed: {processed}")
    print(f"  Skipped (no messages): {skipped}")
    print(f"  Deduplicated (same timestamp): {deduplicated_count}")
    print(f"  Final output count: {len(final_rows)}")

    # 統計情報をJSON出力
    stats_path = output_path / "statistics.json"
    statistics = {
        "total_activities": total_activities,
        "processed_activities": processed,
        "skipped_activities": skipped,
        "deduplicated_activities": deduplicated_count,
        "final_output_count": len(final_rows),
        "limit_applied": limit,
    }

    with stats_path.open("w", encoding="utf-8") as f:
        json.dump(statistics, f, indent=2, ensure_ascii=False)

    print(f"Statistics written to: {stats_path}")


class CLI:
    """Gemini History Parser CLI"""

    def parse(
        self,
        input_path: Optional[str] = None,
        output_dir: Optional[str] = None,
        limit: Optional[int] = None,
        config_path: Optional[str] = None,
    ) -> None:
        """
        Gemini履歴をパースしてCSVに変換

        Args:
            input_path: 入力HTMLファイルパス（Noneの場合はconfig.yamlから取得）
            output_dir: 出力ディレクトリ（Noneの場合はconfig.yamlから取得）
            limit: 処理するアクティビティ数の上限（テスト用、Noneの場合は全て処理）
            config_path: 設定ファイルパス（Noneの場合はdata_api/config.yaml）
        """
        # 設定ファイルを読み込み
        config_file = Path(config_path).expanduser() if config_path else None
        config = load_config(config_file)

        # config.yamlからデフォルト値を取得
        gemini_config = config.get("parsers", {}).get("gemini", {})

        # パラメータが指定されていない場合、config.yamlから取得
        final_input_path = input_path or gemini_config.get(
            "input_path",
            "/Users/mikke/Downloads/Takeout/マイ アクティビティ/Gemini アプリ/マイアクティビティ.html",
        )
        final_output_dir = output_dir or gemini_config.get(
            "output_dir", "output/gemini-history"
        )

        parse_gemini_history(final_input_path, final_output_dir, limit)


if __name__ == "__main__":
    fire.Fire(CLI)

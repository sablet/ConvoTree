"""Utility functions"""
import csv
import json
from datetime import datetime
from pathlib import Path
from app.models import Message


def load_messages_from_csv(file_path: str | Path) -> list[Message]:
    """CSVファイルからメッセージを読み込む"""
    messages: list[Message] = []

    with open(file_path, "r", encoding="utf-8") as f:
        reader = csv.reader(f)
        for i, row in enumerate(reader):
            if len(row) < 3:
                continue

            # "* " プレフィックスを除去
            timestamp_str = row[0].strip("* ").strip()
            text = row[1].strip().strip('"')
            message_type = row[2].strip()

            # タイムスタンプをパース
            try:
                timestamp = datetime.strptime(timestamp_str, "%Y-%m-%d %H:%M:%S")
            except ValueError:
                print(f"Warning: Invalid timestamp format at line {i+1}: {timestamp_str}")
                continue

            message = Message(
                id=str(i),
                timestamp=timestamp,
                text=text,
                message_type=message_type,
            )
            messages.append(message)

    return messages


def save_json(data: list | dict, file_path: str | Path) -> None:
    """JSONファイルに保存"""
    # ディレクトリを作成
    Path(file_path).parent.mkdir(parents=True, exist_ok=True)

    # データを辞書に変換
    if isinstance(data, list):
        json_data = [item.to_dict() if hasattr(item, "to_dict") else item for item in data]
    elif hasattr(data, "to_dict"):
        json_data = data.to_dict()
    else:
        json_data = data

    # JSON形式で保存
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(json_data, f, ensure_ascii=False, indent=2)

    print(f"Saved: {file_path}")


def load_json(file_path: str | Path) -> list | dict:
    """JSONファイルから読み込む"""
    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)

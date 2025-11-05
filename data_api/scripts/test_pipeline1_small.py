#!/usr/bin/env python3
"""Pipeline 1のみを小規模データでテスト"""
import sys
sys.path.insert(0, ".")

from app.utils import load_messages_from_csv
from app.pipelines.pipeline1 import run_pipeline1
import json

# メッセージを読み込み（最初の20件のみ）
messages = load_messages_from_csv("data/messagees_sample.csv")[:20]

print(f"読み込みメッセージ数: {len(messages)}")
print("\n" + "=" * 60)
print("メッセージ一覧:")
print("=" * 60)
for i, msg in enumerate(messages):
    print(f"{i}. [{msg.timestamp}] {msg.text[:50]}...")

# Pipeline 1実行
print("\n" + "=" * 60)
print("Pipeline 1: 時系列グループ化")
print("=" * 60)
groups = run_pipeline1(messages, threshold_minutes=30)

print(f"\n作成グループ数: {len(groups)}")
print("\n" + "=" * 60)
print("グループ詳細:")
print("=" * 60)
for group in groups:
    print(f"\nグループID: {group.id}")
    print(f"  メッセージ数: {len(group.message_ids)}")
    print(f"  開始時刻: {group.start_time}")
    print(f"  終了時刻: {group.end_time}")
    print(f"  メッセージID: {group.message_ids}")

# JSON出力
print("\n" + "=" * 60)
print("JSON出力:")
print("=" * 60)
groups_json = [group.to_dict() for group in groups]
print(json.dumps(groups_json, ensure_ascii=False, indent=2))

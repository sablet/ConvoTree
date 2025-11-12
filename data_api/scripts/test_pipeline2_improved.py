#!/usr/bin/env python3
"""改善されたPipeline 2のテスト（サンプル数増加）"""
import sys
sys.path.insert(0, ".")

from app.utils import load_messages_from_csv
from app.pipelines.pipeline1 import run_pipeline1
from app.pipelines.pipeline2 import run_pipeline2
import json

# メッセージを読み込み（最初の50件に増やす）
messages = load_messages_from_csv("data/messagees_sample.csv")[:50]
print(f"読み込みメッセージ数: {len(messages)}")

# Pipeline 1実行
groups = run_pipeline1(messages, threshold_minutes=30)
print(f"作成グループ数: {len(groups)}")

# 複数メッセージを含むグループのみを抽出
multi_msg_groups = [g for g in groups if len(g.message_ids) >= 2]
print(f"複数メッセージを含むグループ数: {len(multi_msg_groups)}")

# 最初の3グループでテスト
test_groups = multi_msg_groups[:3]

print("\n" + "=" * 80)
print("テスト対象グループ:")
print("=" * 80)
messages_dict = {msg.id: msg for msg in messages}
for group in test_groups:
    print(f"\n{group.id}: {len(group.message_ids)}メッセージ")
    for msg_id in group.message_ids:
        msg = messages_dict[msg_id]
        # 改行を含むメッセージを見やすく表示
        text_lines = msg.text.split('\n')
        if len(text_lines) > 1:
            print(f"  [{msg.timestamp.strftime('%H:%M:%S')}] {text_lines[0][:70]}...")
            for line in text_lines[1:3]:  # 最初の3行のみ
                if line.strip():
                    print(f"      {line[:70]}...")
        else:
            print(f"  [{msg.timestamp.strftime('%H:%M:%S')}] {msg.text[:70]}...")

# Pipeline 2: Intent抽出
print("\n" + "=" * 80)
print("Pipeline 2: Intent抽出（改善版プロンプト）")
print("=" * 80)
intents = run_pipeline2(test_groups, messages_dict)
print(f"\n抽出Intent数: {len(intents)}")

# グループごとにIntent数を集計
group_intent_count = {}
for intent in intents:
    group_id = intent.group_id
    group_intent_count[group_id] = group_intent_count.get(group_id, 0) + 1

print("\nグループごとのIntent数:")
for group in test_groups:
    msg_count = len(group.message_ids)
    intent_count = group_intent_count.get(group.id, 0)
    ratio = intent_count / msg_count if msg_count > 0 else 0
    print(f"  {group.id}: {msg_count}メッセージ → {intent_count}Intent (比率: {ratio:.2f})")

print("\n" + "=" * 80)
print("抽出されたIntent詳細:")
print("=" * 80)
for intent in intents:
    print(f"\n{intent.id}")
    print(f"  {intent.summary}")

# 特定のメッセージがどうIntent化されたか確認
print("\n" + "=" * 80)
print("1メッセージ→複数Intentの例を確認:")
print("=" * 80)

# メッセージ2番（長文で複数の提案を含む）を確認
msg_2 = messages_dict["1"]
print("\n元メッセージ（ID: 1）:")
print(f"{msg_2.text}")

group_000_intents = [i for i in intents if i.group_id == "group_000"]
print(f"\ngroup_000から抽出されたIntent数: {len(group_000_intents)}")
print("\nIntent一覧:")
for i, intent in enumerate(group_000_intents[:5], 1):
    print(f"{i}. {intent.summary}")

# JSON出力
output_data = {
    "summary": {
        "total_messages": len(messages),
        "total_groups": len(groups),
        "test_groups": len(test_groups),
        "total_intents": len(intents),
        "group_stats": [
            {
                "group_id": g.id,
                "message_count": len(g.message_ids),
                "intent_count": group_intent_count.get(g.id, 0),
                "ratio": group_intent_count.get(g.id, 0) / len(g.message_ids)
            }
            for g in test_groups
        ]
    },
    "intents": [intent.to_dict() for intent in intents]
}

with open("output/pipeline2_improved_test.json", "w", encoding="utf-8") as f:
    json.dump(output_data, f, ensure_ascii=False, indent=2)

print("\n✓ 詳細結果を保存: output/pipeline2_improved_test.json")

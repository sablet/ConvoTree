#!/usr/bin/env python3
"""Pipeline 2-3を小規模データでテスト（複数メッセージを含むグループのみ）"""
import sys
sys.path.insert(0, ".")

from app.utils import load_messages_from_csv
from app.pipelines.pipeline1 import run_pipeline1
from app.pipelines.pipeline2 import run_pipeline2
from app.pipelines.pipeline3 import run_pipeline3
import json

# メッセージを読み込み（最初の20件）
messages = load_messages_from_csv("data/messagees_sample.csv")[:20]
print(f"読み込みメッセージ数: {len(messages)}")

# Pipeline 1実行
groups = run_pipeline1(messages, threshold_minutes=30)
print(f"作成グループ数: {len(groups)}")

# 複数メッセージを含むグループのみを抽出
multi_msg_groups = [g for g in groups if len(g.message_ids) >= 2]
print(f"複数メッセージを含むグループ数: {len(multi_msg_groups)}")

# 最初の2グループのみテスト
test_groups = multi_msg_groups[:2]

print("\n" + "=" * 60)
print("テスト対象グループ:")
print("=" * 60)
messages_dict = {msg.id: msg for msg in messages}
for group in test_groups:
    print(f"\n{group.id}: {len(group.message_ids)}メッセージ")
    for msg_id in group.message_ids:
        msg = messages_dict[msg_id]
        print(f"  [{msg.timestamp}] {msg.text[:60]}...")

# Pipeline 2: Intent抽出
print("\n" + "=" * 60)
print("Pipeline 2: Intent抽出")
print("=" * 60)
intents = run_pipeline2(test_groups, messages_dict)
print(f"\n抽出Intent数: {len(intents)}")

for intent in intents:
    print(f"\n{intent.id}")
    print(f"  グループ: {intent.group_id}")
    print(f"  要約: {intent.summary}")

# Pipeline 3: Embedding生成
print("\n" + "=" * 60)
print("Pipeline 3: Embedding生成")
print("=" * 60)
intents = run_pipeline3(intents)
print(f"\nEmbedding生成数: {len([i for i in intents if i.embedding])}")

for intent in intents:
    if intent.embedding:
        print(f"\n{intent.id}")
        print(f"  次元数: {len(intent.embedding)}")
        print(f"  最初の5次元: {intent.embedding[:5]}")

# JSON出力
print("\n" + "=" * 60)
print("JSON出力（Embeddingは最初の5次元のみ表示）:")
print("=" * 60)
intents_json = []
for intent in intents:
    intent_dict = intent.to_dict()
    if intent_dict["embedding"]:
        intent_dict["embedding"] = intent_dict["embedding"][:5]  # 最初の5次元のみ
    intents_json.append(intent_dict)

print(json.dumps(intents_json, ensure_ascii=False, indent=2))

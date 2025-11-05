#!/usr/bin/env python3
"""Pipeline 5をグループ単位でテスト"""
import sys
sys.path.insert(0, ".")

from app.utils import load_json
from app.models import Intent
from app.pipelines.pipeline5 import run_pipeline5
import json

# Embeddingを含むIntentsを読み込み
intents_data = load_json("output/intents_embedded.json")
intents = [
    Intent(
        id=i["id"],
        group_id=i["group_id"],
        summary=i["summary"],
        embedding=i.get("embedding"),
    )
    for i in intents_data
]

print(f"読み込みIntent数: {len(intents)}")

# グループ一覧を表示
groups_dict: dict[str, list[Intent]] = {}
for intent in intents:
    if intent.group_id not in groups_dict:
        groups_dict[intent.group_id] = []
    groups_dict[intent.group_id].append(intent)

print(f"\nグループ数: {len(groups_dict)}")

# 最初のグループでテスト
test_group_id = list(groups_dict.keys())[0] if groups_dict else None
if not test_group_id:
    print("テスト対象グループが見つかりません")
    sys.exit(1)

print(f"\nテスト対象グループ: {test_group_id}")
print(f"グループ内Intent数: {len(groups_dict[test_group_id])}")
print("\n対象グループのIntents:")
for intent in groups_dict[test_group_id]:
    print(f"  {intent.id}: {intent.summary}")

# Pipeline 5実行
print("\n" + "=" * 60)
print("Pipeline 5: Why/How関係抽出（グループ単位）")
print("=" * 60)

relations = run_pipeline5(intents, test_group_id, top_k_similar=3)

print(f"\n抽出関係数: {len(relations)}")

# 結果表示
intents_dict = {intent.id: intent for intent in intents}
for rel in relations:
    source = intents_dict[rel.source_intent_id]
    target = intents_dict[rel.target_intent_id]
    print(f"\n{rel.relation_type.upper()} 関係:")
    print(f"  FROM: {source.id} - {source.summary}")
    print(f"  TO: {target.id} - {target.summary}")

# JSON出力
print("\n" + "=" * 60)
print("JSON出力:")
print("=" * 60)
relations_json = [rel.to_dict() for rel in relations]
print(json.dumps(relations_json, ensure_ascii=False, indent=2))

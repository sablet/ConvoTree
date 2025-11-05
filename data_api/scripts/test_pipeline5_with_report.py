#!/usr/bin/env python3
"""Pipeline 5をグループ単位でテストし、結果をテーブル形式で出力"""
import sys
sys.path.insert(0, ".")

from app.utils import load_json
from app.models import Intent
from app.pipelines.pipeline5 import run_pipeline5
import pandas as pd

# Embeddingを含むIntentsを読み込み
print("=" * 60)
print("データ読み込み中...")
print("=" * 60)

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

print(f"グループ数: {len(groups_dict)}")

# 最初のグループでテスト
test_group_id = list(groups_dict.keys())[0] if groups_dict else None
if not test_group_id:
    print("テスト対象グループが見つかりません")
    sys.exit(1)

print(f"\n{'=' * 60}")
print(f"テスト対象グループ: {test_group_id}")
print(f"{'=' * 60}")
print(f"グループ内Intent数: {len(groups_dict[test_group_id])}")
print("\n【対象グループのIntents】")
for i, intent in enumerate(groups_dict[test_group_id], 1):
    print(f"  {i}. {intent.id}")
    print(f"     {intent.summary}")

# Pipeline 5実行
print(f"\n{'=' * 60}")
print("Pipeline 5: Why/How関係抽出（グループ単位）")
print(f"{'=' * 60}")

relations = run_pipeline5(intents, test_group_id, top_k_similar=3)

print(f"\n{'=' * 60}")
print("結果サマリー")
print(f"{'=' * 60}")
print(f"抽出関係数: {len(relations)}")

# 結果をテーブル形式でまとめる
intents_dict = {intent.id: intent for intent in intents}

# 1. 関係のテーブル
relation_data = []
for rel in relations:
    source = intents_dict[rel.source_intent_id]
    target = intents_dict[rel.target_intent_id]

    # 対象グループのIntentかどうかを判定
    source_in_target = source.id in [i.id for i in groups_dict[test_group_id]]
    target_in_target = target.id in [i.id for i in groups_dict[test_group_id]]

    relation_data.append({
        "関係タイプ": rel.relation_type.upper(),
        "FROM_ID": rel.source_intent_id,
        "FROM_グループ": source.group_id,
        "FROM_対象?": "●" if source_in_target else "",
        "FROM_要約": source.summary[:50] + "..." if len(source.summary) > 50 else source.summary,
        "TO_ID": rel.target_intent_id,
        "TO_グループ": target.group_id,
        "TO_対象?": "●" if target_in_target else "",
        "TO_要約": target.summary[:50] + "..." if len(target.summary) > 50 else target.summary,
    })

if relation_data:
    df_relations = pd.DataFrame(relation_data)
    print(f"\n{'=' * 60}")
    print("【抽出された関係一覧】")
    print(f"{'=' * 60}")
    print(df_relations.to_string(index=False))

    # 関係タイプ別の集計
    print(f"\n{'=' * 60}")
    print("【関係タイプ別集計】")
    print(f"{'=' * 60}")
    type_counts = df_relations["関係タイプ"].value_counts()
    for rel_type, count in type_counts.items():
        print(f"  {rel_type}: {count}件")

    # 対象グループのIntentごとの関係数
    print(f"\n{'=' * 60}")
    print("【対象グループのIntentごとの関係数】")
    print(f"{'=' * 60}")

    intent_relation_counts = []
    for intent in groups_dict[test_group_id]:
        # このIntentが関わる関係をカウント
        as_source = len([r for r in relations if r.source_intent_id == intent.id])
        as_target = len([r for r in relations if r.target_intent_id == intent.id])
        total = as_source + as_target

        intent_relation_counts.append({
            "Intent_ID": intent.id,
            "要約": intent.summary[:60] + "..." if len(intent.summary) > 60 else intent.summary,
            "FROM数": as_source,
            "TO数": as_target,
            "合計": total,
        })

    df_intent_counts = pd.DataFrame(intent_relation_counts)
    print(df_intent_counts.to_string(index=False))

    # CSVとして保存
    output_path = "output/pipeline5_relations_report.csv"
    df_relations.to_csv(output_path, index=False, encoding="utf-8-sig")
    print(f"\n{'=' * 60}")
    print(f"結果を保存しました: {output_path}")
    print(f"{'=' * 60}")
else:
    print("\n関係が見つかりませんでした")

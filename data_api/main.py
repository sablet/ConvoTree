#!/usr/bin/env python3
"""
Data API - Message Intent Analysis

使用例:
    # 全パイプライン実行
    python main.py --input data/messagees_sample.csv --pipelines 1,2,3 --output output/

    # Pipeline 1のみ
    python main.py --input data/messagees_sample.csv --pipelines 1 --output output/

    # Pipeline 4のみ（既存データを使用）
    python main.py --pipelines 4 --intents output/intents_embedded.json --intent-id group_000_intent_0 --output output/

    # Pipeline 5のみ（グループ単位、既存データを使用）
    python main.py --pipelines 5 --intents output/intents_embedded.json --group-id group_000 --output output/
"""
import argparse
from tqdm import tqdm
from app.utils import load_messages_from_csv, save_json, load_json
from app.pipelines.pipeline1 import run_pipeline1
from app.pipelines.pipeline2 import run_pipeline2
from app.pipelines.pipeline3 import run_pipeline3
from app.pipelines.pipeline4 import run_pipeline4
from app.pipelines.pipeline5 import run_pipeline5
from app.models import Intent, MessageGroup


def main():
    parser = argparse.ArgumentParser(description="Message Intent Analysis")
    parser.add_argument("--input", help="入力CSVファイル")
    parser.add_argument("--pipelines", required=True, help="実行するパイプライン (例: 1,2,3)")
    parser.add_argument("--output", required=True, help="出力ディレクトリ")
    parser.add_argument("--threshold", type=int, default=30, help="グループ化の時間閾値（分）")
    parser.add_argument("--groups", help="既存のgroups.jsonファイル")
    parser.add_argument("--intents", help="既存のintents.jsonファイル")
    parser.add_argument("--intent-id", help="Pipeline 4で使用するIntent ID")
    parser.add_argument("--group-id", help="Pipeline 5で使用するGroup ID")
    parser.add_argument("--n-temporal", type=int, default=5, help="Pipeline 4: 時系列で近いIntent数")
    parser.add_argument("--m-similarity", type=int, default=5, help="Pipeline 4: 類似度が高いIntent数")
    parser.add_argument("--top-k-similar", type=int, default=3, help="Pipeline 5: 各Intentごとの類似Intent数")

    args = parser.parse_args()

    pipelines = [p.strip() for p in args.pipelines.split(",")]
    output_dir = args.output

    messages = []
    groups = []
    intents = []

    # Pipeline 1: 時系列グループ化
    if "1" in pipelines:
        if not args.input:
            raise ValueError("--input が必要です")

        print("=" * 60)
        print("Pipeline 1: 時系列グループ化")
        print("=" * 60)

        messages = load_messages_from_csv(args.input)
        print(f"読み込みメッセージ数: {len(messages)}")

        groups = run_pipeline1(messages, args.threshold)
        print(f"作成グループ数: {len(groups)}")

        save_json(groups, f"{output_dir}/groups.json")

    # Pipeline 2: Intent抽出
    if "2" in pipelines:
        print("\n" + "=" * 60)
        print("Pipeline 2: Intent抽出")
        print("=" * 60)

        # groupsが未読み込みの場合
        if not groups:
            if args.groups:
                groups_data = load_json(args.groups)
                groups = [
                    MessageGroup(
                        id=g["id"],
                        message_ids=g["message_ids"],
                        start_time=g["start_time"],
                        end_time=g["end_time"],
                    )
                    for g in groups_data
                ]
            else:
                raise ValueError("--groups または Pipeline 1 が必要です")

        # messagesが未読み込みの場合
        if not messages:
            if args.input:
                messages = load_messages_from_csv(args.input)
            else:
                raise ValueError("--input が必要です")

        messages_dict = {msg.id: msg for msg in messages}
        intents = run_pipeline2(groups, messages_dict)
        print(f"抽出Intent数: {len(intents)}")

        save_json(intents, f"{output_dir}/intents.json")

    # Pipeline 3: Embedding生成
    if "3" in pipelines:
        print("\n" + "=" * 60)
        print("Pipeline 3: Embedding生成")
        print("=" * 60)

        # intentsが未読み込みの場合
        if not intents:
            if args.intents:
                intents_data = load_json(args.intents)
                intents = [
                    Intent(
                        id=i["id"],
                        group_id=i["group_id"],
                        summary=i["summary"],
                        embedding=i.get("embedding"),
                    )
                    for i in intents_data
                ]
            else:
                raise ValueError("--intents または Pipeline 2 が必要です")

        intents = run_pipeline3(intents)
        print(f"Embedding生成数: {len([i for i in intents if i.embedding])}")

        save_json(intents, f"{output_dir}/intents_embedded.json")

    # Pipeline 4: 類似検索
    if "4" in pipelines:
        print("\n" + "=" * 60)
        print("Pipeline 4: 類似Intent検索")
        print("=" * 60)

        # intentsが未読み込みの場合
        if not intents:
            if args.intents:
                intents_data = load_json(args.intents)
                intents = [
                    Intent(
                        id=i["id"],
                        group_id=i["group_id"],
                        summary=i["summary"],
                        embedding=i.get("embedding"),
                    )
                    for i in intents_data
                ]
            else:
                raise ValueError("--intents または Pipeline 3 が必要です")

        # intent_idが指定されている場合は1つのみ処理（デバッグ用）
        if args.intent_id:
            similar = run_pipeline4(intents, args.intent_id, args.n_temporal, args.m_similarity)
            print(f"対象Intent: {args.intent_id}")
            print(f"時系列近傍: {len(similar.temporal_neighbors)}")
            print(f"類似近傍: {len(similar.similarity_neighbors)}")
            save_json(similar, f"{output_dir}/similar.json")
        else:
            # 全Intentに対して処理
            similar_list = []
            for intent in tqdm(intents, desc="類似検索", unit="intent"):
                similar = run_pipeline4(intents, intent.id, args.n_temporal, args.m_similarity)
                similar_list.append(similar)
            print(f"処理件数: {len(similar_list)}")
            save_json(similar_list, f"{output_dir}/similar.json")

    # Pipeline 5: Why/How関係抽出（グループ単位）
    if "5" in pipelines:
        print("\n" + "=" * 60)
        print("Pipeline 5: Why/How関係抽出（グループ単位）")
        print("=" * 60)

        # intentsが未読み込みの場合
        if not intents:
            if args.intents:
                intents_data = load_json(args.intents)
                intents = [
                    Intent(
                        id=i["id"],
                        group_id=i["group_id"],
                        summary=i["summary"],
                        embedding=i.get("embedding"),
                    )
                    for i in intents_data
                ]
            else:
                raise ValueError("--intents または Pipeline 3 が必要です")

        # group_idが指定されている場合は1つのみ処理（デバッグ用）
        if args.group_id:
            relations = run_pipeline5(intents, args.group_id, args.top_k_similar)
            print(f"対象グループ: {args.group_id}")
            print(f"抽出関係数: {len(relations)}")
            save_json(relations, f"{output_dir}/relations.json")
        elif args.intent_id:
            # intent_idから自動抽出
            group_id = args.intent_id.rsplit("_intent_", 1)[0]
            print(f"Intent IDから自動抽出: group_id={group_id}")
            relations = run_pipeline5(intents, group_id, args.top_k_similar)
            print(f"抽出関係数: {len(relations)}")
            save_json(relations, f"{output_dir}/relations.json")
        else:
            # 全グループに対して処理
            all_relations = []
            group_ids = sorted(set(intent.group_id for intent in intents))
            for group_id in tqdm(group_ids, desc="Why/How抽出", unit="group"):
                relations = run_pipeline5(intents, group_id, args.top_k_similar)
                all_relations.extend(relations)
            print(f"\n総抽出関係数: {len(all_relations)}")
            save_json(all_relations, f"{output_dir}/relations.json")

    print("\n" + "=" * 60)
    print("完了")
    print("=" * 60)


if __name__ == "__main__":
    main()

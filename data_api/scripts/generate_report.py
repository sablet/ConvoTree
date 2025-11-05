#!/usr/bin/env python3
"""
依存関係可視化レポート生成スクリプト

Usage:
    python scripts/generate_report.py
    python scripts/generate_report.py --max-groups 5 --max-relations 50
"""

import json
from pathlib import Path
from collections import defaultdict
from typing import Dict, List, Any
import argparse


def load_json(filepath: Path) -> Any:
    """JSONファイルを読み込む"""
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)


def generate_summary_stats(
    intents: List[Dict], relations: List[Dict]
) -> Dict[str, Any]:
    """概要統計を生成"""
    groups = set(intent["group_id"] for intent in intents)
    relation_types = defaultdict(int)
    for rel in relations:
        relation_types[rel["relation_type"]] += 1

    return {
        "total_intents": len(intents),
        "total_groups": len(groups),
        "total_relations": len(relations),
        "relation_types": dict(relation_types),
    }


def group_intents_by_group(intents: List[Dict]) -> Dict[str, List[Dict]]:
    """グループIDごとにインテントをグルーピング"""
    grouped = defaultdict(list)
    for intent in intents:
        grouped[intent["group_id"]].append(intent)
    return dict(grouped)


def build_relation_graph(relations: List[Dict]) -> Dict[str, List[Dict]]:
    """インテントIDをキーとした関係グラフを構築"""
    graph = defaultdict(list)
    for rel in relations:
        graph[rel["source_intent_id"]].append(
            {"target": rel["target_intent_id"], "type": rel["relation_type"]}
        )
    return dict(graph)


def get_intent_summary_map(intents: List[Dict]) -> Dict[str, str]:
    """インテントIDから要約へのマッピングを作成"""
    return {intent["id"]: intent["summary"] for intent in intents}


def generate_mermaid_graph_for_group(
    group_id: str,
    relations: List[Dict],
    intent_summaries: Dict[str, str],
) -> str:
    """特定グループの依存関係図を生成"""
    # このグループに関連する関係のみを抽出
    group_relations = [
        rel
        for rel in relations
        if group_id in rel["source_intent_id"] or group_id in rel["target_intent_id"]
    ]

    if not group_relations:
        return "_このグループに関連する依存関係はありません_\n"

    mermaid = ["```mermaid", "graph TD"]

    # ノードの定義
    nodes = set()
    for rel in group_relations:
        nodes.add(rel["source_intent_id"])
        nodes.add(rel["target_intent_id"])

    for node_id in sorted(nodes):
        summary = intent_summaries.get(node_id, "Unknown")
        # 要約を短縮（最大40文字）
        short_summary = summary[:40] + "..." if len(summary) > 40 else summary

        # グループ内かグループ外かで表示を変える
        if group_id in node_id:
            # 自グループは強調表示
            mermaid.append(f'    {node_id}["{short_summary}"]')
            mermaid.append(f'    style {node_id} fill:#e3f2fd,stroke:#1976d2,stroke-width:2px')
        else:
            # 外部グループは薄く表示
            mermaid.append(f'    {node_id}["{node_id}<br/>{short_summary}"]')
            mermaid.append(f'    style {node_id} fill:#f5f5f5,stroke:#bdbdbd')

    mermaid.append("")

    # エッジの定義
    for rel in group_relations:
        source = rel["source_intent_id"]
        target = rel["target_intent_id"]
        rel_type = rel["relation_type"]

        # 関係タイプに応じてスタイルを変更
        if rel_type == "why":
            mermaid.append(f"    {source} -->|why| {target}")
        elif rel_type == "how":
            mermaid.append(f"    {source} -.->|how| {target}")
        else:
            mermaid.append(f"    {source} --- {target}")

    mermaid.append("```")
    return "\n".join(mermaid)


def generate_group_section(
    group_id: str,
    intents: List[Dict],
    relation_graph: Dict[str, List[Dict]],
    all_relations: List[Dict],
    intent_summaries: Dict[str, str],
) -> str:
    """グループごとのセクションを生成"""
    lines = [f"### {group_id} ({len(intents)} intents)\n"]

    # グループの依存関係図を追加
    mermaid_graph = generate_mermaid_graph_for_group(
        group_id, all_relations, intent_summaries
    )
    lines.append(mermaid_graph)
    lines.append("")

    # インテント一覧
    lines.append("#### インテント一覧\n")

    for intent in sorted(intents, key=lambda x: x["id"]):
        intent_id = intent["id"]
        summary = intent["summary"]

        # 関連関係を取得
        outgoing = relation_graph.get(intent_id, [])

        lines.append(f"**{intent_id}**")
        lines.append(f"- {summary}")

        if outgoing:
            lines.append("- 関連:")
            for rel in outgoing[:5]:  # 最大5件まで表示
                target_summary = intent_summaries.get(rel["target"], "Unknown")
                lines.append(
                    f"  - **{rel['type']}** → `{rel['target']}`: {target_summary}"
                )

        lines.append("")

    return "\n".join(lines)


def generate_relation_type_section(
    relation_type: str, relations: List[Dict], intent_summaries: Dict[str, str]
) -> str:
    """関係タイプごとのセクションを生成"""
    filtered = [rel for rel in relations if rel["relation_type"] == relation_type]

    lines = [f"### {relation_type.upper()} 関係 ({len(filtered)} 件)\n"]

    # 最大10件まで表示
    for rel in filtered[:10]:
        source_summary = intent_summaries.get(rel["source_intent_id"], "Unknown")
        target_summary = intent_summaries.get(rel["target_intent_id"], "Unknown")

        lines.append(f"**{rel['source_intent_id']}** → **{rel['target_intent_id']}**")
        lines.append(f"- From: {source_summary}")
        lines.append(f"- To: {target_summary}")
        lines.append("")

    if len(filtered) > 10:
        lines.append(f"... 他 {len(filtered) - 10} 件\n")

    return "\n".join(lines)


def generate_markdown_report(
    intents: List[Dict],
    relations: List[Dict],
    max_groups: int = None,
) -> str:
    """マークダウンレポートを生成"""
    # データ準備
    stats = generate_summary_stats(intents, relations)
    grouped_intents = group_intents_by_group(intents)
    relation_graph = build_relation_graph(relations)
    intent_summaries = get_intent_summary_map(intents)

    # レポート作成
    report = [
        "# 依存関係分析レポート\n",
        "## 概要統計\n",
        f"- **総インテント数**: {stats['total_intents']}",
        f"- **グループ数**: {stats['total_groups']}",
        f"- **関係数**: {stats['total_relations']}\n",
        "### 関係タイプの分布\n",
    ]

    for rel_type, count in stats["relation_types"].items():
        report.append(f"- **{rel_type}**: {count} 件")

    # グループごとの詳細
    sorted_groups = sorted(grouped_intents.keys())
    if max_groups:
        sorted_groups = sorted_groups[:max_groups]
        report.append("\n## グループ別インテント一覧と依存関係\n")
        report.append(
            f"先頭 {max_groups} グループを表示します。各グループの依存関係図を含みます。\n"
        )
    else:
        report.append("\n## グループ別インテント一覧と依存関係\n")
        report.append(
            f"全 {len(sorted_groups)} グループを表示します。各グループの依存関係図を含みます。\n"
        )

    report.append(
        "- **青い背景・太枠**: 自グループのインテント\n- **薄い背景**: 他グループのインテント\n- **実線矢印 (→)**: why関係（目的・理由）\n- **点線矢印 (-.->)**: how関係（実現方法）\n"
    )

    for group_id in sorted_groups:
        report.append(
            generate_group_section(
                group_id,
                grouped_intents[group_id],
                relation_graph,
                relations,
                intent_summaries,
            )
        )

    # 関係タイプ別の分析（簡略版）
    report.append("\n## 関係タイプ別サマリー\n")
    for rel_type in stats["relation_types"].keys():
        report.append(
            generate_relation_type_section(rel_type, relations, intent_summaries)
        )

    return "\n".join(report)


def main():
    parser = argparse.ArgumentParser(description="依存関係可視化レポート生成")
    parser.add_argument(
        "--intents",
        type=Path,
        default=Path("output/intents.json"),
        help="intents.jsonのパス",
    )
    parser.add_argument(
        "--relations",
        type=Path,
        default=Path("output/relations.json"),
        help="relations.jsonのパス",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("output/reports/dependency_report.md"),
        help="出力先パス",
    )
    parser.add_argument(
        "--max-groups",
        type=int,
        default=None,
        help="レポートに含める最大グループ数（指定しない場合は全グループ）",
    )

    args = parser.parse_args()

    # データ読み込み
    print(f"Loading {args.intents}...")
    intents = load_json(args.intents)

    print(f"Loading {args.relations}...")
    relations = load_json(args.relations)

    # レポート生成
    print("Generating report...")
    report = generate_markdown_report(
        intents, relations, max_groups=args.max_groups
    )

    # 出力
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        f.write(report)

    print(f"✓ Report generated: {args.output}")
    print(f"  - Total intents: {len(intents)}")
    print(f"  - Total relations: {len(relations)}")


if __name__ == "__main__":
    main()

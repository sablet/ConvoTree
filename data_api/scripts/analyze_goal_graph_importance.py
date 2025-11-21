#!/usr/bin/env python3
"""
Goal Graph Importance Analysis

有向グラフの重要度指標を計算し、重要ノードとその1-hop近傍のレポートを生成する。
以下の5種類のグラフを分析：
1. hierarchy のみ
2. means_end のみ
3. dependency のみ
4. causal のみ
5. 全てのリレーション

各グラフに対して以下の指標を計算：
- PageRank（方向あり）
- In-degree / Out-degree
- Hub & Authority scores (HITS)
- Betweenness centrality（方向あり）
- Closeness centrality（in/out）
"""

import json
from pathlib import Path
from typing import Dict, List, Set, Tuple
from dataclasses import dataclass
from collections import defaultdict

import pandas as pd
import networkx as nx


@dataclass
class GraphMetrics:
    """グラフの重要度指標"""
    node_id: str
    pagerank: float
    in_degree: int
    out_degree: int
    hub_score: float
    authority_score: float
    betweenness: float
    in_closeness: float
    out_closeness: float
    total_degree: int


@dataclass
class NodeData:
    """ノードの詳細データ"""
    node_id: str
    cluster_id: int
    index: int
    abstraction_level: str
    theme: str
    subject: str
    action: List[str]
    target: List[str]
    conditions: List[str]
    issue: List[str]
    domain: List[str]
    source_message_ids: List[str]
    raw_data: dict


def load_goal_nodes() -> Dict[str, NodeData]:
    """全クラスターファイルからGoalデータを読み込む"""
    processed_dir = Path("output/goal_extraction/processed")
    if not processed_dir.exists():
        raise FileNotFoundError(f"処理済みディレクトリが見つかりません: {processed_dir}")

    goal_files = sorted(processed_dir.glob("cluster_*_goals.json"))
    if not goal_files:
        raise FileNotFoundError(f"Goalファイルが見つかりません: {processed_dir}")

    nodes = {}
    for goal_file in goal_files:
        cluster_id = int(goal_file.stem.split("_")[1])
        with open(goal_file, "r", encoding="utf-8") as f:
            goals_data = json.load(f)

        for index, goal_data in enumerate(goals_data):
            node_id = f"{cluster_id:02d}_{index:02d}"

            # targetからテキスト部分を抽出
            target_texts = []
            for t in goal_data.get("target", []):
                if isinstance(t, dict):
                    target_texts.append(t.get("name", ""))
                else:
                    target_texts.append(str(t))

            nodes[node_id] = NodeData(
                node_id=node_id,
                cluster_id=cluster_id,
                index=index,
                abstraction_level=goal_data.get("abstraction_level", ""),
                theme=goal_data.get("theme", ""),
                subject=goal_data.get("subject", ""),
                action=goal_data.get("action", []),
                target=target_texts,
                conditions=goal_data.get("conditions", []),
                issue=goal_data.get("issue", []),
                domain=goal_data.get("domain", []),
                source_message_ids=goal_data.get("source_message_ids", []),
                raw_data=goal_data
            )

    print(f"✓ {len(nodes)}個のノードを読み込みました")
    return nodes


def load_relations() -> pd.DataFrame:
    """リレーションデータを読み込む"""
    relations_path = Path("output/goal_relation_extraction/goal_relations.csv")
    if not relations_path.exists():
        raise FileNotFoundError(f"リレーションファイルが見つかりません: {relations_path}")

    df = pd.read_csv(relations_path)
    print(f"✓ {len(df)}件のリレーションを読み込みました")
    print(f"  - リレーションタイプ: {df['relation_type'].unique().tolist()}")
    return df


def build_graph(relations_df: pd.DataFrame, relation_type: str | None = None) -> nx.DiGraph:
    """指定されたリレーションタイプのグラフを構築"""
    if relation_type:
        filtered_df = relations_df[relations_df['relation_type'] == relation_type]
        print(f"  - {relation_type}: {len(filtered_df)}件のエッジ")
    else:
        filtered_df = relations_df
        print(f"  - 全リレーション: {len(filtered_df)}件のエッジ")

    G = nx.DiGraph()
    for _, row in filtered_df.iterrows():
        G.add_edge(row['source_node_id'], row['target_node_id'],
                   relation_type=row['relation_type'],
                   score=row['score'],
                   reason=row.get('reason', ''))

    print(f"    ノード数: {G.number_of_nodes()}, エッジ数: {G.number_of_edges()}")
    return G


def calculate_metrics(G: nx.DiGraph) -> Dict[str, GraphMetrics]:
    """グラフの重要度指標を計算"""
    print("  - PageRankを計算中...")
    pagerank = nx.pagerank(G, alpha=0.85)

    print("  - 次数を計算中...")
    in_degree = dict(G.in_degree())
    out_degree = dict(G.out_degree())

    print("  - HITS (Hub & Authority) を計算中...")
    try:
        hubs, authorities = nx.hits(G, max_iter=100)
    except nx.PowerIterationFailedConvergence:
        print("    ⚠ HITS収束失敗、デフォルト値を使用")
        hubs = {node: 0.0 for node in G.nodes()}
        authorities = {node: 0.0 for node in G.nodes()}

    print("  - Betweenness centralityを計算中...")
    betweenness = nx.betweenness_centrality(G)

    print("  - Closeness centralityを計算中...")
    # in-closeness: 逆グラフでのcloseness（到達されやすさ）
    G_reverse = G.reverse()
    in_closeness = nx.closeness_centrality(G_reverse)
    # out-closeness: 通常のcloseness（到達しやすさ）
    out_closeness = nx.closeness_centrality(G)

    metrics = {}
    for node in G.nodes():
        metrics[node] = GraphMetrics(
            node_id=node,
            pagerank=pagerank.get(node, 0.0),
            in_degree=in_degree.get(node, 0),
            out_degree=out_degree.get(node, 0),
            hub_score=hubs.get(node, 0.0),
            authority_score=authorities.get(node, 0.0),
            betweenness=betweenness.get(node, 0.0),
            in_closeness=in_closeness.get(node, 0.0),
            out_closeness=out_closeness.get(node, 0.0),
            total_degree=in_degree.get(node, 0) + out_degree.get(node, 0)
        )

    return metrics


def get_1hop_neighborhood(G: nx.DiGraph, node: str) -> Tuple[Set[str], Set[str]]:
    """1-hop近傍を取得（in, out）"""
    predecessors = set(G.predecessors(node)) if node in G else set()
    successors = set(G.successors(node)) if node in G else set()
    return predecessors, successors


def generate_markdown_report(
    graph_name: str,
    G: nx.DiGraph,
    metrics: Dict[str, GraphMetrics],
    nodes_data: Dict[str, NodeData],
    top_n: int = 20
) -> str:
    """Markdownレポートを生成"""

    # メトリクスでソート（PageRankで降順）
    sorted_metrics = sorted(metrics.values(), key=lambda m: m.pagerank, reverse=True)

    md = f"""# Graph Importance Analysis: {graph_name}

## Graph Summary

| Metric | Value |
|--------|-------|
| **Total Nodes** | {G.number_of_nodes()} |
| **Total Edges** | {G.number_of_edges()} |
| **Average Degree** | {G.number_of_edges() * 2 / G.number_of_nodes() if G.number_of_nodes() > 0 else 0:.2f} |
| **Graph Density** | {nx.density(G):.4f} |

---

## Top {top_n} Important Nodes (by PageRank)

| Rank | Node ID | PageRank | In-Degree | Out-Degree | Authority | Hub | Betweenness | In-Closeness | Out-Closeness |
|------|---------|----------|-----------|------------|-----------|-----|-------------|--------------|---------------|
"""

    for rank, metric in enumerate(sorted_metrics[:top_n], 1):
        md += f"| {rank} | **{metric.node_id}** | {metric.pagerank:.6f} | {metric.in_degree} | {metric.out_degree} | {metric.authority_score:.6f} | {metric.hub_score:.6f} | {metric.betweenness:.6f} | {metric.in_closeness:.6f} | {metric.out_closeness:.6f} |\n"

    md += "\n---\n\n"
    md += f"## Top {top_n} Nodes Details with 1-Hop Neighborhood\n\n"

    for rank, metric in enumerate(sorted_metrics[:top_n], 1):
        node_data = nodes_data.get(metric.node_id)
        if not node_data:
            continue

        predecessors, successors = get_1hop_neighborhood(G, metric.node_id)

        md += f"""### Rank #{rank}: {metric.node_id}

#### Metrics

| Metric | Value |
|--------|-------|
| **PageRank** | {metric.pagerank:.6f} |
| **In-Degree** | {metric.in_degree} |
| **Out-Degree** | {metric.out_degree} |
| **Authority Score** | {metric.authority_score:.6f} |
| **Hub Score** | {metric.hub_score:.6f} |
| **Betweenness** | {metric.betweenness:.6f} |
| **In-Closeness** | {metric.in_closeness:.6f} |
| **Out-Closeness** | {metric.out_closeness:.6f} |

#### Node Content

- **Abstraction Level**: `{node_data.abstraction_level}`
- **Theme**: {node_data.theme}
- **Subject**: {node_data.subject}
"""

        if node_data.action:
            md += "- **Actions**:\n"
            for action in node_data.action:
                md += f"  - {action}\n"

        if node_data.target:
            md += "- **Targets**:\n"
            for target in node_data.target:
                md += f"  - {target}\n"

        if node_data.conditions:
            md += "- **Conditions**:\n"
            for cond in node_data.conditions:
                md += f"  - {cond}\n"

        if node_data.issue:
            md += "- **Issues**:\n"
            for issue in node_data.issue:
                md += f"  - {issue}\n"

        if node_data.domain:
            md += f"- **Domain**: {', '.join(node_data.domain)}\n"

        md += "\n#### 1-Hop Neighborhood\n\n"

        if predecessors:
            md += f"##### ← IN: Predecessors ({len(predecessors)})\n\n"
            for pred in sorted(predecessors):
                pred_data = nodes_data.get(pred)
                edge_data = G.get_edge_data(pred, metric.node_id)
                if pred_data and edge_data:
                    md += f"- **{pred}**: {pred_data.theme}\n"
                    md += f"  - Relation: `{edge_data.get('relation_type', 'unknown')}` (score: {edge_data.get('score', 0):.4f})\n"
                    md += f"  - Level: `{pred_data.abstraction_level}`\n"

        if successors:
            md += f"\n##### → OUT: Successors ({len(successors)})\n\n"
            for succ in sorted(successors):
                succ_data = nodes_data.get(succ)
                edge_data = G.get_edge_data(metric.node_id, succ)
                if succ_data and edge_data:
                    md += f"- **{succ}**: {succ_data.theme}\n"
                    md += f"  - Relation: `{edge_data.get('relation_type', 'unknown')}` (score: {edge_data.get('score', 0):.4f})\n"
                    md += f"  - Level: `{succ_data.abstraction_level}`\n"

        if not predecessors and not successors:
            md += "*このノードは孤立しています*\n"

        md += "\n---\n\n"

    return md


def generate_html_report(
    graph_name: str,
    G: nx.DiGraph,
    metrics: Dict[str, GraphMetrics],
    nodes_data: Dict[str, NodeData],
    top_n: int = 20
) -> str:
    """HTMLレポートを生成（後方互換性のため残す）"""

    # メトリクスでソート（PageRankで降順）
    sorted_metrics = sorted(metrics.values(), key=lambda m: m.pagerank, reverse=True)

    html = f"""<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Graph Importance Analysis: {graph_name}</title>
    <style>
        body {{
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 20px;
            background-color: #f5f5f5;
        }}
        h1 {{
            color: #333;
            border-bottom: 3px solid #4CAF50;
            padding-bottom: 10px;
        }}
        h2 {{
            color: #555;
            margin-top: 30px;
            border-bottom: 2px solid #2196F3;
            padding-bottom: 5px;
        }}
        h3 {{
            color: #666;
            margin-top: 20px;
        }}
        .summary {{
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 20px;
        }}
        .summary-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-top: 15px;
        }}
        .summary-item {{
            background: #f9f9f9;
            padding: 15px;
            border-radius: 5px;
            border-left: 4px solid #4CAF50;
        }}
        .summary-item strong {{
            display: block;
            color: #666;
            font-size: 0.9em;
            margin-bottom: 5px;
        }}
        .summary-item span {{
            font-size: 1.5em;
            color: #333;
            font-weight: bold;
        }}
        .node-card {{
            background: white;
            padding: 20px;
            margin: 15px 0;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            border-left: 5px solid #2196F3;
        }}
        .node-header {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
        }}
        .node-id {{
            font-size: 1.3em;
            font-weight: bold;
            color: #2196F3;
        }}
        .rank-badge {{
            background: #4CAF50;
            color: white;
            padding: 5px 15px;
            border-radius: 20px;
            font-weight: bold;
        }}
        .metrics-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 10px;
            margin: 15px 0;
            padding: 15px;
            background: #f9f9f9;
            border-radius: 5px;
        }}
        .metric {{
            text-align: center;
        }}
        .metric-label {{
            font-size: 0.85em;
            color: #666;
            display: block;
        }}
        .metric-value {{
            font-size: 1.2em;
            font-weight: bold;
            color: #333;
            display: block;
            margin-top: 5px;
        }}
        .node-content {{
            margin: 15px 0;
        }}
        .field {{
            margin: 10px 0;
        }}
        .field-label {{
            font-weight: bold;
            color: #555;
            display: inline-block;
            min-width: 120px;
        }}
        .field-value {{
            color: #333;
        }}
        .field-list {{
            list-style: none;
            padding-left: 120px;
            margin: 5px 0;
        }}
        .field-list li {{
            padding: 3px 0;
            color: #333;
        }}
        .neighborhood {{
            margin-top: 20px;
            padding: 15px;
            background: #fff8e1;
            border-radius: 5px;
            border: 1px solid #ffd54f;
        }}
        .neighborhood h4 {{
            color: #f57c00;
            margin-top: 0;
        }}
        .neighbor-list {{
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 10px;
            margin-top: 10px;
        }}
        .neighbor-item {{
            background: white;
            padding: 10px;
            border-radius: 4px;
            border-left: 3px solid #ff9800;
        }}
        .neighbor-id {{
            font-weight: bold;
            color: #ff9800;
        }}
        .neighbor-relation {{
            font-size: 0.85em;
            color: #666;
            margin-top: 5px;
        }}
        .direction {{
            display: inline-block;
            padding: 2px 8px;
            border-radius: 3px;
            font-size: 0.8em;
            margin-right: 5px;
        }}
        .direction-in {{
            background: #e3f2fd;
            color: #1976d2;
        }}
        .direction-out {{
            background: #fff3e0;
            color: #f57c00;
        }}
        table {{
            width: 100%;
            border-collapse: collapse;
            background: white;
            margin: 20px 0;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }}
        th, td {{
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #ddd;
        }}
        th {{
            background-color: #2196F3;
            color: white;
            font-weight: bold;
        }}
        tr:hover {{
            background-color: #f5f5f5;
        }}
        .level-badge {{
            display: inline-block;
            padding: 3px 8px;
            border-radius: 3px;
            font-size: 0.85em;
            background: #e0e0e0;
            color: #333;
        }}
    </style>
</head>
<body>
    <h1>Graph Importance Analysis: {graph_name}</h1>

    <div class="summary">
        <h2>Graph Summary</h2>
        <div class="summary-grid">
            <div class="summary-item">
                <strong>Total Nodes</strong>
                <span>{G.number_of_nodes()}</span>
            </div>
            <div class="summary-item">
                <strong>Total Edges</strong>
                <span>{G.number_of_edges()}</span>
            </div>
            <div class="summary-item">
                <strong>Avg Degree</strong>
                <span>{G.number_of_edges() * 2 / G.number_of_nodes() if G.number_of_nodes() > 0 else 0:.2f}</span>
            </div>
            <div class="summary-item">
                <strong>Density</strong>
                <span>{nx.density(G):.4f}</span>
            </div>
        </div>
    </div>
"""

    # Top N nodes のテーブル
    html += f"""
    <h2>Top {top_n} Important Nodes (by PageRank)</h2>
    <table>
        <thead>
            <tr>
                <th>Rank</th>
                <th>Node ID</th>
                <th>PageRank</th>
                <th>In-Degree</th>
                <th>Out-Degree</th>
                <th>Authority</th>
                <th>Hub</th>
                <th>Betweenness</th>
            </tr>
        </thead>
        <tbody>
"""

    for rank, metric in enumerate(sorted_metrics[:top_n], 1):
        html += f"""
            <tr>
                <td>{rank}</td>
                <td><strong>{metric.node_id}</strong></td>
                <td>{metric.pagerank:.6f}</td>
                <td>{metric.in_degree}</td>
                <td>{metric.out_degree}</td>
                <td>{metric.authority_score:.6f}</td>
                <td>{metric.hub_score:.6f}</td>
                <td>{metric.betweenness:.6f}</td>
            </tr>
"""

    html += """
        </tbody>
    </table>
"""

    # Top N nodes の詳細カード
    html += f"""
    <h2>Top {top_n} Nodes Details with 1-Hop Neighborhood</h2>
"""

    for rank, metric in enumerate(sorted_metrics[:top_n], 1):
        node_data = nodes_data.get(metric.node_id)
        if not node_data:
            continue

        predecessors, successors = get_1hop_neighborhood(G, metric.node_id)

        html += f"""
    <div class="node-card">
        <div class="node-header">
            <span class="node-id">{metric.node_id}</span>
            <span class="rank-badge">Rank #{rank}</span>
        </div>

        <div class="metrics-grid">
            <div class="metric">
                <span class="metric-label">PageRank</span>
                <span class="metric-value">{metric.pagerank:.6f}</span>
            </div>
            <div class="metric">
                <span class="metric-label">In-Degree</span>
                <span class="metric-value">{metric.in_degree}</span>
            </div>
            <div class="metric">
                <span class="metric-label">Out-Degree</span>
                <span class="metric-value">{metric.out_degree}</span>
            </div>
            <div class="metric">
                <span class="metric-label">Authority</span>
                <span class="metric-value">{metric.authority_score:.6f}</span>
            </div>
            <div class="metric">
                <span class="metric-label">Hub</span>
                <span class="metric-value">{metric.hub_score:.6f}</span>
            </div>
            <div class="metric">
                <span class="metric-label">Betweenness</span>
                <span class="metric-value">{metric.betweenness:.6f}</span>
            </div>
            <div class="metric">
                <span class="metric-label">In-Closeness</span>
                <span class="metric-value">{metric.in_closeness:.6f}</span>
            </div>
            <div class="metric">
                <span class="metric-label">Out-Closeness</span>
                <span class="metric-value">{metric.out_closeness:.6f}</span>
            </div>
        </div>

        <div class="node-content">
            <div class="field">
                <span class="field-label">Abstraction Level:</span>
                <span class="level-badge">{node_data.abstraction_level}</span>
            </div>
            <div class="field">
                <span class="field-label">Theme:</span>
                <span class="field-value">{node_data.theme}</span>
            </div>
            <div class="field">
                <span class="field-label">Subject:</span>
                <span class="field-value">{node_data.subject}</span>
            </div>
"""

        if node_data.action:
            html += """
            <div class="field">
                <span class="field-label">Action:</span>
            </div>
            <ul class="field-list">
"""
            for action in node_data.action:
                html += f"                <li>{action}</li>\n"
            html += """
            </ul>
"""

        if node_data.target:
            html += """
            <div class="field">
                <span class="field-label">Target:</span>
            </div>
            <ul class="field-list">
"""
            for target in node_data.target:
                html += f"                <li>{target}</li>\n"
            html += """
            </ul>
"""

        if node_data.domain:
            html += f"""
            <div class="field">
                <span class="field-label">Domain:</span>
                <span class="field-value">{', '.join(node_data.domain)}</span>
            </div>
"""

        html += """
        </div>

        <div class="neighborhood">
            <h4>1-Hop Neighborhood</h4>
"""

        if predecessors:
            html += f"""
            <h5><span class="direction direction-in">← IN</span> Predecessors ({len(predecessors)})</h5>
            <div class="neighbor-list">
"""
            for pred in sorted(predecessors):
                pred_data = nodes_data.get(pred)
                edge_data = G.get_edge_data(pred, metric.node_id)
                if pred_data and edge_data:
                    html += f"""
                <div class="neighbor-item">
                    <div class="neighbor-id">{pred}</div>
                    <div>{pred_data.theme}</div>
                    <div class="neighbor-relation">
                        {edge_data.get('relation_type', 'unknown')} (score: {edge_data.get('score', 0):.4f})
                    </div>
                </div>
"""
            html += """
            </div>
"""

        if successors:
            html += f"""
            <h5><span class="direction direction-out">→ OUT</span> Successors ({len(successors)})</h5>
            <div class="neighbor-list">
"""
            for succ in sorted(successors):
                succ_data = nodes_data.get(succ)
                edge_data = G.get_edge_data(metric.node_id, succ)
                if succ_data and edge_data:
                    html += f"""
                <div class="neighbor-item">
                    <div class="neighbor-id">{succ}</div>
                    <div>{succ_data.theme}</div>
                    <div class="neighbor-relation">
                        {edge_data.get('relation_type', 'unknown')} (score: {edge_data.get('score', 0):.4f})
                    </div>
                </div>
"""
            html += """
            </div>
"""

        if not predecessors and not successors:
            html += """
            <p style="color: #666; font-style: italic;">このノードは孤立しています</p>
"""

        html += """
        </div>
    </div>
"""

    html += """
</body>
</html>
"""

    return html


def generate_unified_markdown_report(
    all_results: Dict,
    nodes_data: Dict[str, NodeData],
    top_n: int = 10
) -> str:
    """全てのグラフの分析結果を1つのMarkdownにまとめる"""

    md = """# Goal Graph Importance Analysis - Unified Report

## Executive Summary

このレポートは、goal_relation_extractionで抽出された4種類のリレーション（hierarchy, means_end, dependency, causal）および全リレーションを統合したグラフの重要度分析結果をまとめたものです。

各グラフに対して以下の指標を計算：
- **PageRank**: ノードの全体的な重要度（方向あり）
- **In-Degree / Out-Degree**: 入次数・出次数
- **Hub & Authority Scores (HITS)**: Hubスコア（情報発信）とAuthorityスコア（情報集約）
- **Betweenness Centrality**: ノード間の最短経路における媒介性
- **Closeness Centrality**: 他ノードへの到達しやすさ（In/Out）

---

## Graph Statistics Comparison

"""

    # グラフ統計の比較テーブル
    md += "| Graph Type | Nodes | Edges | Avg Degree | Density | Avg PageRank |\n"
    md += "|------------|-------|-------|------------|---------|-------------|\n"

    for graph_name, result in all_results.items():
        G = result['graph']
        metrics = result['metrics']
        avg_pr = sum(m.pagerank for m in metrics.values()) / len(metrics) if metrics else 0
        avg_degree = G.number_of_edges() * 2 / G.number_of_nodes() if G.number_of_nodes() > 0 else 0

        md += f"| **{graph_name}** | {G.number_of_nodes()} | {G.number_of_edges()} | {avg_degree:.2f} | {nx.density(G):.4f} | {avg_pr:.6f} |\n"

    md += "\n---\n\n"

    # 各グラフのTop Nノード
    for graph_name, result in all_results.items():
        G = result['graph']
        metrics = result['metrics']
        sorted_metrics = sorted(metrics.values(), key=lambda m: m.pagerank, reverse=True)

        md += f"## {graph_name.upper()} - Top {top_n} Important Nodes\n\n"

        # サマリーテーブル
        md += "| Rank | Node ID | PageRank | In° | Out° | Auth | Hub | Between |\n"
        md += "|------|---------|----------|-----|------|------|-----|----------|\n"

        for rank, metric in enumerate(sorted_metrics[:top_n], 1):
            md += f"| {rank} | **{metric.node_id}** | {metric.pagerank:.6f} | {metric.in_degree} | {metric.out_degree} | {metric.authority_score:.6f} | {metric.hub_score:.6f} | {metric.betweenness:.6f} |\n"

        md += "\n"

        # Top 3の詳細
        md += f"### Top 3 Detailed Analysis\n\n"

        for rank, metric in enumerate(sorted_metrics[:3], 1):
            node_data = nodes_data.get(metric.node_id)
            if not node_data:
                continue

            predecessors, successors = get_1hop_neighborhood(G, metric.node_id)

            md += f"#### #{rank}: {metric.node_id}\n\n"
            md += f"**{node_data.theme}** ({node_data.abstraction_level})\n\n"
            md += f"- **Subject**: {node_data.subject}\n"

            if node_data.domain:
                md += f"- **Domain**: {', '.join(node_data.domain)}\n"

            if node_data.action:
                md += f"- **Actions**: {', '.join(node_data.action[:3])}{'...' if len(node_data.action) > 3 else ''}\n"

            if node_data.target:
                targets = [str(t) for t in node_data.target[:3]]
                md += f"- **Targets**: {', '.join(targets)}{'...' if len(node_data.target) > 3 else ''}\n"

            md += f"\n**Metrics**: PR={metric.pagerank:.6f}, In={metric.in_degree}, Out={metric.out_degree}, Auth={metric.authority_score:.6f}, Hub={metric.hub_score:.6f}\n\n"

            # 1-hop近傍のサマリー
            if predecessors or successors:
                md += f"**1-Hop**: {len(predecessors)} predecessors, {len(successors)} successors\n"

                if predecessors:
                    md += f"- IN ← : "
                    pred_list = []
                    for pred in sorted(list(predecessors)[:5]):
                        pred_data = nodes_data.get(pred)
                        if pred_data:
                            pred_list.append(f"`{pred}`")
                    md += ", ".join(pred_list)
                    if len(predecessors) > 5:
                        md += f", ... (+{len(predecessors) - 5} more)"
                    md += "\n"

                if successors:
                    md += f"- OUT →: "
                    succ_list = []
                    for succ in sorted(list(successors)[:5]):
                        succ_data = nodes_data.get(succ)
                        if succ_data:
                            succ_list.append(f"`{succ}`")
                    md += ", ".join(succ_list)
                    if len(successors) > 5:
                        md += f", ... (+{len(successors) - 5} more)"
                    md += "\n"

            md += "\n"

        md += "---\n\n"

    # 全体サマリー: 各グラフで最も重要なノード
    md += "## Cross-Graph Analysis: Most Important Nodes\n\n"
    md += "各グラフで最も重要なノード（PageRank Top 1）:\n\n"
    md += "| Graph | Node ID | Theme | PageRank | In-Degree | Out-Degree |\n"
    md += "|-------|---------|-------|----------|-----------|------------|\n"

    for graph_name, result in all_results.items():
        metrics = result['metrics']
        if not metrics:
            continue
        top_metric = max(metrics.values(), key=lambda m: m.pagerank)
        node_data = nodes_data.get(top_metric.node_id)
        theme = node_data.theme if node_data else "N/A"
        md += f"| {graph_name} | **{top_metric.node_id}** | {theme} | {top_metric.pagerank:.6f} | {top_metric.in_degree} | {top_metric.out_degree} |\n"

    md += "\n---\n\n"

    # 指標の解釈ガイド
    md += """## Metrics Interpretation Guide

### PageRank
- グラフ全体でのノードの重要度を示す（0-1の範囲）
- 重要なノードから参照されるノードほど高い値になる
- 方向あり: 入ってくるエッジの重みを考慮

### In-Degree / Out-Degree
- In-Degree（入次数）: そのノードに向かうエッジの数
- Out-Degree（出次数）: そのノードから出るエッジの数
- 高いIn-Degree = 多くのノードから参照される **Authority** ノード
- 高いOut-Degree = 多くのノードを参照する **Hub** ノード

### HITS (Hub & Authority)
- **Authority Score**: 高品質な情報源としての重要度
  - 多くのhubから参照されるノードほど高い
- **Hub Score**: 情報をまとめ・発信する役割の重要度
  - 多くの高品質なauthorityを参照するノードほど高い

### Betweenness Centrality
- ノードがグラフ内の最短経路上に位置する頻度
- 高い値 = 情報の流れを媒介する「橋渡し」の役割

### Closeness Centrality
- **In-Closeness**: 他のノードから到達されやすさ（逆グラフでの計算）
- **Out-Closeness**: 他のノードへ到達しやすさ
- 高い値 = グラフ内での情報伝播が速い

### リレーションタイプ別の特徴

1. **hierarchy**: 抽象度の階層関係
   - 高いIn-Degreeのノード = 具体的な多数のタスクを抽象化したテーマ

2. **means_end**: 手段-目的関係
   - Hub的なノード = 複数の目的を達成するための手段
   - Authority的なノード = 多くの手段によって達成される目的

3. **dependency**: 依存・前提条件関係
   - 高いOut-Degreeのノード = 多くの後続タスクの前提条件
   - 高いIn-Degreeのノード = 多くの前提条件を必要とする複雑なタスク

4. **causal**: 因果関係
   - 高いOut-Degreeのノード = 多くの結果を引き起こす原因
   - 高いIn-Degreeのノード = 複数の要因によって引き起こされる結果

---

*Generated by analyze_goal_graph_importance.py*
"""

    return md


def main():
    """メイン処理"""
    print("\n" + "=" * 60)
    print("Goal Graph Importance Analysis")
    print("=" * 60)

    # 1. データ読み込み
    print("\n[1/3] データを読み込み中...")
    nodes_data = load_goal_nodes()
    relations_df = load_relations()

    # 2. グラフ構築と分析
    print("\n[2/3] グラフを分析中...")

    graph_types = [
        ("hierarchy", "hierarchy"),
        ("means_end", "means_end"),
        ("dependency", "dependency"),
        ("causal", "causal"),
        ("all_relations", None)
    ]

    output_dir = Path("output/goal_relation_extraction/importance_analysis")
    output_dir.mkdir(parents=True, exist_ok=True)

    all_results = {}

    for graph_name, relation_type in graph_types:
        print(f"\n--- {graph_name} ---")
        G = build_graph(relations_df, relation_type)

        if G.number_of_nodes() == 0:
            print(f"  ⚠ {graph_name} グラフにノードがありません。スキップします。")
            continue

        metrics = calculate_metrics(G)
        all_results[graph_name] = {
            'graph': G,
            'metrics': metrics
        }

        print(f"  ✓ {graph_name} の分析が完了しました")

    # 3. 統合Markdownレポート生成
    print("\n[3/3] 統合Markdownレポートを生成中...")

    unified_md = generate_unified_markdown_report(all_results, nodes_data, top_n=10)
    unified_path = output_dir / "importance_analysis_report.md"
    with open(unified_path, "w", encoding="utf-8") as f:
        f.write(unified_md)
    print(f"  ✓ {unified_path}")

    # CSV サマリーも出力
    print("\n[CSV] メトリクスサマリーを出力中...")
    for graph_name, result in all_results.items():
        metrics_list = sorted(result['metrics'].values(), key=lambda m: m.pagerank, reverse=True)
        df_metrics = pd.DataFrame([
            {
                'node_id': m.node_id,
                'pagerank': m.pagerank,
                'in_degree': m.in_degree,
                'out_degree': m.out_degree,
                'total_degree': m.total_degree,
                'hub_score': m.hub_score,
                'authority_score': m.authority_score,
                'betweenness': m.betweenness,
                'in_closeness': m.in_closeness,
                'out_closeness': m.out_closeness,
            }
            for m in metrics_list
        ])

        csv_path = output_dir / f"{graph_name}_metrics.csv"
        df_metrics.to_csv(csv_path, index=False)
        print(f"  ✓ {csv_path}")

    print("\n" + "=" * 60)
    print("✓ 分析が完了しました")
    print(f"出力先: {output_dir}")
    print(f"メインレポート: {unified_path}")
    print("=" * 60)


if __name__ == "__main__":
    main()

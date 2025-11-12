#!/usr/bin/env python3
"""
ゴールネットワーク可視化

クラスタごとのネットワークとハブIntentのネットワークを
networkxで画像生成し、HTMLレポートで表示する。
"""

import json
from pathlib import Path
import pandas as pd
import networkx as nx
import matplotlib.pyplot as plt
import matplotlib
from typing import Dict, List

# 日本語フォント設定
matplotlib.rcParams['font.family'] = 'Hiragino Sans'
matplotlib.rcParams['axes.unicode_minus'] = False

# 入出力ディレクトリ
INPUT_DIR = Path("output/goal_network")
OUTPUT_DIR = INPUT_DIR
CLUSTER_CSV = Path("output/intent_clustering/clustered_intents.csv")


def _hierarchical_layout(G):
    """
    手動で階層的レイアウトを計算
    目的（エッジのto側）が上、手段（エッジのfrom側）が下
    """
    from collections import defaultdict, deque

    # 各ノードの階層レベルを計算
    # レベル0: 最上位の目的（誰からも目的として参照されない）
    # レベル1以降: 手段として下がっていく

    # 出次数（このノードから出るエッジ数）でトップレベルを判定
    out_degree = {node: 0 for node in G.nodes()}
    in_degree = {node: 0 for node in G.nodes()}

    for u, v in G.edges():
        out_degree[u] += 1
        in_degree[v] += 1

    # トップレベル: 出次数が0（誰の手段でもない = 純粋な目的）
    levels = {}
    max_level = 0

    # BFS で階層を計算（エッジの方向に沿って）
    # from -> to なので、toが目的、fromが手段
    # toから逆にたどってfromに高いレベルを割り当てる

    # まず、出次数0のノード（誰の手段でもない）をレベル0に
    queue = deque()
    for node in G.nodes():
        if out_degree[node] == 0:
            levels[node] = 0
            queue.append(node)

    # 出次数0がない場合（サイクル）、入次数最小を選ぶ
    if not queue:
        node = min(G.nodes(), key=lambda n: in_degree[n])
        levels[node] = 0
        queue.append(node)

    # 逆方向に探索（predecessors = このノードを目的とする手段ノード）
    while queue:
        node = queue.popleft()
        current_level = levels[node]

        for pred in G.predecessors(node):
            # predはnodeの手段なので、より下のレベル
            new_level = current_level + 1
            if pred not in levels or levels[pred] < new_level:
                levels[pred] = new_level
                max_level = max(max_level, new_level)
                queue.append(pred)

    # 未訪問ノードを処理
    for node in G.nodes():
        if node not in levels:
            levels[node] = max_level + 1
            max_level += 1

    # レベルごとにノードをグループ化
    level_nodes = defaultdict(list)
    for node, level in levels.items():
        level_nodes[level].append(node)

    # 位置を計算
    pos = {}
    for level in sorted(level_nodes.keys()):
        nodes_at_level = level_nodes[level]
        num_nodes = len(nodes_at_level)

        for i, node in enumerate(nodes_at_level):
            # X座標: 同じレベル内で均等配置
            if num_nodes == 1:
                x = 0.5
            else:
                x = i / (num_nodes - 1)

            # Y座標: 目的（レベル0）が上、手段（レベル高）が下
            # matplotlibでは大きいY値が上なので、max_level - level で反転
            y = max_level - level

            pos[node] = (x, y)

    return pos


def load_data():
    """データ読み込み"""
    with open(INPUT_DIR / "cluster_relations.json", 'r', encoding='utf-8') as f:
        cluster_relations = json.load(f)

    with open(INPUT_DIR / "hub_intents.json", 'r', encoding='utf-8') as f:
        hub_intents = json.load(f)

    with open(INPUT_DIR / "hub_relations.json", 'r', encoding='utf-8') as f:
        hub_relations = json.load(f)

    df = pd.read_csv(CLUSTER_CSV)

    return cluster_relations, hub_intents, hub_relations, df


def create_cluster_graph(
    cluster_id: int,
    relations: List[Dict],
    df: pd.DataFrame,
    output_path: Path
):
    """クラスタのネットワークグラフを生成"""
    if len(relations) == 0:
        print(f"  ⚠️  クラスタ {cluster_id}: リレーションなし、スキップ")
        return

    # グラフ作成
    G = nx.DiGraph()

    # ノード追加（クラスタ内の全Intent）
    cluster_intents = df[df['cluster'] == cluster_id]
    for _, row in cluster_intents.iterrows():
        intent_id = row['intent_id']
        intent_text = row['intent']
        # ラベルを短縮（最初の30文字）
        label = intent_text[:30] + "..." if len(intent_text) > 30 else intent_text
        G.add_node(intent_id, label=label)

    # エッジ追加
    for rel in relations:
        G.add_edge(rel['from'], rel['to'])

    # 孤立ノードを削除
    isolated_nodes = list(nx.isolates(G))
    G.remove_nodes_from(isolated_nodes)

    if G.number_of_nodes() == 0:
        print(f"  ⚠️  クラスタ {cluster_id}: ノードなし、スキップ")
        return

    # 階層的レイアウト（目的が上、手段が下）
    try:
        # graphvizのdotレイアウトを試す（上から下への階層レイアウト）
        pos = nx.nx_agraph.graphviz_layout(G, prog='dot')
    except Exception:
        # graphvizが使えない場合は手動で階層計算
        pos = _hierarchical_layout(G)

    # 描画サイズを大きく
    fig, ax = plt.subplots(figsize=(24, 18))

    # ノード描画
    nx.draw_networkx_nodes(
        G, pos, ax=ax,
        node_size=2000,
        node_color='lightblue',
        alpha=0.9,
        edgecolors='darkblue',
        linewidths=2
    )

    # エッジ描画
    nx.draw_networkx_edges(
        G, pos, ax=ax,
        edge_color='gray',
        arrows=True,
        arrowsize=15,
        width=1.5,
        arrowstyle='->'
    )

    # ラベル描画
    labels = nx.get_node_attributes(G, 'label')
    nx.draw_networkx_labels(
        G, pos, labels, ax=ax,
        font_size=7,
        font_family='Hiragino Sans',
        bbox=dict(boxstyle='round,pad=0.3', facecolor='white', edgecolor='none', alpha=0.7)
    )

    ax.set_title(f'クラスタ {cluster_id} のゴールネットワーク', fontsize=16, fontweight='bold')
    ax.axis('off')
    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    plt.close()

    print(f"  ✓ クラスタ {cluster_id}: {output_path.name} (ノード: {G.number_of_nodes()}, エッジ: {G.number_of_edges()})")


def create_hub_graph(
    hub_intents: List[Dict],
    hub_relations: List[Dict],
    output_path: Path
):
    """ハブIntentのネットワークグラフを生成"""
    if len(hub_relations) == 0:
        print("  ⚠️  ハブネットワーク: リレーションなし、スキップ")
        return

    # グラフ作成
    G = nx.DiGraph()

    # ノード追加
    for hub in hub_intents:
        intent_id = hub['intent_id']
        intent_text = hub['intent']
        # ラベルを短縮（最初の40文字）
        label = intent_text[:40] + "..." if len(intent_text) > 40 else intent_text
        G.add_node(intent_id, label=label, cluster=hub['cluster'])

    # エッジ追加
    for rel in hub_relations:
        if G.has_node(rel['from']) and G.has_node(rel['to']):
            G.add_edge(rel['from'], rel['to'])

    # 孤立ノードを削除
    isolated_nodes = list(nx.isolates(G))
    G.remove_nodes_from(isolated_nodes)

    if G.number_of_nodes() == 0:
        print("  ⚠️  ハブネットワーク: ノードなし、スキップ")
        return

    # 階層的レイアウト（目的が上、手段が下）
    try:
        # graphvizのdotレイアウトを試す（上から下への階層レイアウト）
        pos = nx.nx_agraph.graphviz_layout(G, prog='dot')
    except Exception:
        # graphvizが使えない場合は手動で階層計算
        pos = _hierarchical_layout(G)

    # 描画サイズを大きく
    fig, ax = plt.subplots(figsize=(28, 20))

    # ノード描画
    nx.draw_networkx_nodes(
        G, pos, ax=ax,
        node_size=3000,
        node_color='lightcoral',
        alpha=0.9,
        edgecolors='darkred',
        linewidths=2
    )

    # エッジ描画
    nx.draw_networkx_edges(
        G, pos, ax=ax,
        edge_color='darkgray',
        arrows=True,
        arrowsize=20,
        width=2,
        arrowstyle='->'
    )

    # ラベル描画
    labels = nx.get_node_attributes(G, 'label')
    nx.draw_networkx_labels(
        G, pos, labels, ax=ax,
        font_size=8,
        font_family='Hiragino Sans',
        bbox=dict(boxstyle='round,pad=0.3', facecolor='white', edgecolor='none', alpha=0.7)
    )

    ax.set_title('ハブIntentのゴールネットワーク', fontsize=18, fontweight='bold')
    ax.axis('off')
    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    plt.close()

    print(f"  ✓ ハブネットワーク: {output_path.name} (ノード: {G.number_of_nodes()}, エッジ: {G.number_of_edges()})")


def generate_html_report(
    cluster_relations: Dict,
    hub_intents: List[Dict],
    hub_relations: List[Dict]
):
    """HTMLレポート生成"""
    html_lines = [
        "<!DOCTYPE html>",
        "<html lang='ja'>",
        "<head>",
        "  <meta charset='UTF-8'>",
        "  <meta name='viewport' content='width=device-width, initial-scale=1.0'>",
        "  <title>ゴールネットワーク可視化レポート</title>",
        "  <style>",
        "    body { font-family: 'Hiragino Sans', sans-serif; margin: 20px; background-color: #f5f5f5; }",
        "    h1 { color: #333; border-bottom: 3px solid #4CAF50; padding-bottom: 10px; }",
        "    h2 { color: #555; margin-top: 40px; border-bottom: 2px solid #2196F3; padding-bottom: 8px; }",
        "    .summary { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }",
        "    .graph-container { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }",
        "    .graph-container img { max-width: 100%; height: auto; border: 1px solid #ddd; border-radius: 4px; }",
        "    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0; }",
        "    .stat-box { background: #e3f2fd; padding: 15px; border-radius: 8px; text-align: center; }",
        "    .stat-box .number { font-size: 2em; font-weight: bold; color: #1976d2; }",
        "    .stat-box .label { color: #666; margin-top: 5px; }",
        "  </style>",
        "</head>",
        "<body>",
        "  <h1>🎯 ゴールネットワーク可視化レポート</h1>",
        "  <div class='summary'>",
        "    <h2>📊 サマリー</h2>",
        "    <div class='stats'>",
        f"      <div class='stat-box'><div class='number'>{len(cluster_relations)}</div><div class='label'>クラスタ数</div></div>",
        f"      <div class='stat-box'><div class='number'>{len(hub_intents)}</div><div class='label'>ハブIntent数</div></div>",
        f"      <div class='stat-box'><div class='number'>{len(hub_relations)}</div><div class='label'>ハブリレーション数</div></div>",
        f"      <div class='stat-box'><div class='number'>{sum(len(rels) for rels in cluster_relations.values())}</div><div class='label'>総リレーション数</div></div>",
        "    </div>",
        "  </div>",
    ]

    # ハブネットワーク
    html_lines.extend([
        "  <h2>🌟 ハブIntentネットワーク</h2>",
        "  <div class='graph-container'>",
        "    <img src='hub_network.png' alt='ハブIntentネットワーク'>",
        "  </div>",
    ])

    # クラスタごとのネットワーク
    html_lines.append("  <h2>📦 クラスタごとのネットワーク</h2>")

    for cluster_id in sorted([int(k) for k in cluster_relations.keys()]):
        relations = cluster_relations[str(cluster_id)]
        if len(relations) > 0:
            html_lines.extend([
                "  <div class='graph-container'>",
                f"    <h3>クラスタ {cluster_id} ({len(relations)}件のリレーション)</h3>",
                f"    <img src='cluster_{cluster_id}.png' alt='クラスタ {cluster_id}'>",
                "  </div>",
            ])

    html_lines.extend([
        "</body>",
        "</html>",
    ])

    # 保存
    output_path = OUTPUT_DIR / "network_report.html"
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write("\n".join(html_lines))

    print(f"\n💾 HTMLレポートを保存: {output_path}")


def main():
    """メイン処理"""
    print("=" * 60)
    print("ゴールネットワーク可視化")
    print("=" * 60)

    # データ読み込み
    print("\n📂 データ読み込み中...")
    cluster_relations, hub_intents, hub_relations, df = load_data()
    print("  ✓ 完了")

    # クラスタごとのグラフ生成
    print("\n📊 クラスタグラフ生成中...")
    for cluster_id_str, relations in cluster_relations.items():
        cluster_id = int(cluster_id_str)
        output_path = OUTPUT_DIR / f"cluster_{cluster_id}.png"
        create_cluster_graph(cluster_id, relations, df, output_path)

    # ハブネットワークグラフ生成
    print("\n🌟 ハブネットワークグラフ生成中...")
    output_path = OUTPUT_DIR / "hub_network.png"
    create_hub_graph(hub_intents, hub_relations, output_path)

    # HTMLレポート生成
    print("\n📄 HTMLレポート生成中...")
    generate_html_report(cluster_relations, hub_intents, hub_relations)

    print("\n" + "=" * 60)
    print("✅ 完了！")
    print("=" * 60)
    print(f"📁 出力ディレクトリ: {OUTPUT_DIR}")
    print(f"📄 レポート: {OUTPUT_DIR / 'network_report.html'}")


if __name__ == "__main__":
    main()

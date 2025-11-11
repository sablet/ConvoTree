#!/usr/bin/env python3
"""
グラフ構造評価とクラスタ分析スクリプト

複数閾値でグラフを生成し、以下の基準で最適グラフを選定：
1. コア-ペリフェリ構造の明瞭性
2. コミュニティ構造の明瞭性（モジュラリティ）
3. エッジ重みの情報量（分散）

最適グラフに対してクラスタ抽出を行い、詳細レポートを生成。
"""

import json
import numpy as np
from pathlib import Path
from sklearn.metrics.pairwise import cosine_similarity
import matplotlib.pyplot as plt
import seaborn as sns
import networkx as nx
from networkx.algorithms import community
from typing import Dict, List, Tuple, Set
import pandas as pd
from collections import defaultdict

# 日本語フォント設定
plt.rcParams['font.family'] = 'Hiragino Sans'
plt.rcParams['axes.unicode_minus'] = False

# 出力ディレクトリ
OUTPUT_DIR = Path("output/cluster_analysis")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

def load_embeddings(file_path: str) -> Tuple[List[Dict], np.ndarray, List[str], List[str]]:
    """埋め込みデータを読み込む"""
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    embeddings = np.array([item['embedding'] for item in data])
    ids = [item['id'] for item in data]
    summaries = [item['summary'] for item in data]

    return data, embeddings, ids, summaries

def compute_similarity_matrix(embeddings: np.ndarray) -> np.ndarray:
    """コサイン類似度行列を計算"""
    sim_matrix = cosine_similarity(embeddings)
    np.fill_diagonal(sim_matrix, 0)  # 自己類似度を除外
    return sim_matrix

def extract_relations(sim_matrix: np.ndarray, ids: List[str], threshold: float) -> List[Tuple[str, str, float]]:
    """閾値以上の類似度を持つペアをリレーションとして抽出"""
    relations = []
    n = len(ids)
    for i in range(n):
        for j in range(i + 1, n):
            if sim_matrix[i, j] >= threshold:
                relations.append((ids[i], ids[j], sim_matrix[i, j]))
    return relations

def build_graph(relations: List[Tuple[str, str, float]]) -> nx.Graph:
    """リレーションからグラフを構築"""
    G = nx.Graph()
    for src, dst, weight in relations:
        G.add_edge(src, dst, weight=weight)
    return G

def evaluate_core_periphery(G: nx.Graph) -> Dict:
    """コア-ペリフェリ構造の評価"""
    if G.number_of_nodes() == 0:
        return {'score': 0, 'core_size': 0, 'periphery_size': 0}

    degrees = dict(G.degree())
    degree_values = list(degrees.values())

    if not degree_values:
        return {'score': 0, 'core_size': 0, 'periphery_size': 0}

    # 次数の分散（大きいほどコア-ペリフェリ構造が明確）
    degree_variance = np.var(degree_values)
    degree_mean = np.mean(degree_values)

    # コア判定: 平均+1標準偏差以上
    threshold = degree_mean + np.std(degree_values)
    core_nodes = [node for node, deg in degrees.items() if deg >= threshold]
    periphery_nodes = [node for node, deg in degrees.items() if deg < threshold]

    # コアの密度とペリフェリの密度の比
    core_subgraph = G.subgraph(core_nodes)
    core_density = nx.density(core_subgraph) if len(core_nodes) > 1 else 0

    periphery_subgraph = G.subgraph(periphery_nodes)
    periphery_density = nx.density(periphery_subgraph) if len(periphery_nodes) > 1 else 0

    # スコア: 密度比と次数分散の積
    density_ratio = core_density / (periphery_density + 1e-6)
    score = degree_variance * density_ratio

    return {
        'score': float(score),
        'degree_variance': float(degree_variance),
        'density_ratio': float(density_ratio),
        'core_size': len(core_nodes),
        'periphery_size': len(periphery_nodes),
        'core_density': float(core_density),
        'periphery_density': float(periphery_density),
        'core_nodes': core_nodes[:10]  # サンプル
    }

def evaluate_community_structure(G: nx.Graph) -> Dict:
    """コミュニティ構造の評価（モジュラリティ）"""
    if G.number_of_nodes() == 0:
        return {'modularity': 0, 'num_communities': 0}

    # Louvain法でコミュニティ検出
    communities = community.greedy_modularity_communities(G, weight='weight')

    # モジュラリティ計算
    modularity = community.modularity(G, communities, weight='weight')

    # コミュニティサイズ分布
    community_sizes = [len(c) for c in communities]

    return {
        'modularity': float(modularity),
        'num_communities': len(communities),
        'community_sizes': sorted(community_sizes, reverse=True),
        'communities': communities
    }

def evaluate_edge_weight_information(G: nx.Graph) -> Dict:
    """エッジ重みの情報量評価"""
    if G.number_of_edges() == 0:
        return {'weight_variance': 0, 'weight_entropy': 0}

    weights = [data['weight'] for _, _, data in G.edges(data=True)]

    # 重みの分散（大きいほど情報量が多い）
    weight_variance = np.var(weights)

    # 重みのエントロピー（ビン化して計算）
    hist, _ = np.histogram(weights, bins=20)
    hist = hist / hist.sum()
    hist = hist[hist > 0]  # ゼロ除外
    weight_entropy = -np.sum(hist * np.log2(hist))

    return {
        'weight_variance': float(weight_variance),
        'weight_entropy': float(weight_entropy),
        'weight_mean': float(np.mean(weights)),
        'weight_std': float(np.std(weights)),
        'weight_min': float(np.min(weights)),
        'weight_max': float(np.max(weights))
    }

def evaluate_graph_structure(G: nx.Graph, threshold: float) -> Dict:
    """グラフ構造の総合評価"""
    print(f"  評価中: 閾値={threshold:.4f}, ノード={G.number_of_nodes()}, エッジ={G.number_of_edges()}")

    # 基本統計
    basic_stats = {
        'threshold': threshold,
        'num_nodes': G.number_of_nodes(),
        'num_edges': G.number_of_edges(),
        'density': nx.density(G) if G.number_of_nodes() > 0 else 0,
        'num_components': nx.number_connected_components(G)
    }

    # コア-ペリフェリ評価
    core_periphery = evaluate_core_periphery(G)

    # コミュニティ構造評価
    community_eval = evaluate_community_structure(G)

    # エッジ重み評価
    edge_weight_eval = evaluate_edge_weight_information(G)

    # 総合スコア（正規化して合計）
    # 各指標を0-1に正規化するため、後で全体の最大値で割る
    return {
        **basic_stats,
        'core_periphery': core_periphery,
        'community': community_eval,
        'edge_weight': edge_weight_eval
    }

def normalize_and_score(evaluations: List[Dict]) -> List[Dict]:
    """評価結果を正規化して総合スコアを計算"""
    # 各指標の最大値を取得
    max_cp_score = max([e['core_periphery']['score'] for e in evaluations if e['core_periphery']['score'] > 0], default=1)
    max_modularity = max([e['community']['modularity'] for e in evaluations], default=1)
    max_weight_var = max([e['edge_weight']['weight_variance'] for e in evaluations], default=1)

    for eval_result in evaluations:
        # 正規化スコア
        cp_norm = eval_result['core_periphery']['score'] / max_cp_score if max_cp_score > 0 else 0
        mod_norm = eval_result['community']['modularity'] / max_modularity if max_modularity > 0 else 0
        weight_norm = eval_result['edge_weight']['weight_variance'] / max_weight_var if max_weight_var > 0 else 0

        # クラスタ数に対するペナルティ/報酬
        # 理想的なクラスタ数を10-30と仮定
        num_communities = eval_result['community']['num_communities']
        if 10 <= num_communities <= 30:
            cluster_score = 1.0
        elif num_communities < 10:
            # 少なすぎる場合はペナルティ（3クラスタなら0.3）
            cluster_score = num_communities / 10.0
        else:
            # 多すぎる場合もペナルティ
            cluster_score = max(0.5, 1.0 - (num_communities - 30) / 50.0)

        # 総合スコア（重み付け平均）
        # モジュラリティとクラスタ数を重視
        total_score = 0.2 * cp_norm + 0.4 * mod_norm + 0.1 * weight_norm + 0.3 * cluster_score

        eval_result['normalized_scores'] = {
            'core_periphery': cp_norm,
            'modularity': mod_norm,
            'edge_weight': weight_norm,
            'cluster_count': cluster_score
        }
        eval_result['total_score'] = total_score

    return evaluations

def extract_cluster_center(G: nx.Graph, cluster: Set) -> str:
    """クラスタ内の中心ノードを特定（次数とPageRankの組み合わせ）"""
    subgraph = G.subgraph(cluster)

    if subgraph.number_of_nodes() == 0:
        return None

    # PageRank計算
    try:
        pagerank = nx.pagerank(subgraph, weight='weight')
    except:
        pagerank = {node: 1.0 for node in subgraph.nodes()}

    # 次数
    degrees = dict(subgraph.degree())

    # スコア = PageRank * 次数
    scores = {node: pagerank.get(node, 0) * degrees.get(node, 0) for node in subgraph.nodes()}

    # 最高スコアのノードを返す
    center = max(scores.keys(), key=lambda x: scores[x])
    return center

def analyze_clusters(G: nx.Graph, communities: List[Set], summaries_dict: Dict[str, str]) -> List[Dict]:
    """クラスタごとの詳細分析"""
    cluster_info = []

    for i, cluster in enumerate(communities):
        cluster_nodes = list(cluster)

        # 中心ノード特定
        center_node = extract_cluster_center(G, cluster)

        # クラスタ内の平均類似度
        subgraph = G.subgraph(cluster)
        if subgraph.number_of_edges() > 0:
            avg_similarity = np.mean([data['weight'] for _, _, data in subgraph.edges(data=True)])
        else:
            avg_similarity = 0

        # サマリーリスト
        intent_list = []
        for node in cluster_nodes:
            intent_list.append({
                'id': node,
                'summary': summaries_dict.get(node, ''),
                'is_center': node == center_node,
                'degree': subgraph.degree(node) if node in subgraph else 0
            })

        # 次数でソート
        intent_list.sort(key=lambda x: x['degree'], reverse=True)

        cluster_info.append({
            'cluster_id': i + 1,
            'size': len(cluster),
            'center_node': center_node,
            'center_summary': summaries_dict.get(center_node, ''),
            'avg_similarity': float(avg_similarity),
            'intents': intent_list
        })

    # クラスタサイズでソート
    cluster_info.sort(key=lambda x: x['size'], reverse=True)

    return cluster_info

def visualize_evaluation_comparison(evaluations: List[Dict], output_path: Path):
    """評価結果の比較可視化"""
    thresholds = [e['threshold'] for e in evaluations]

    fig, axes = plt.subplots(2, 2, figsize=(14, 10))

    # コア-ペリフェリスコア
    cp_scores = [e['core_periphery']['score'] for e in evaluations]
    axes[0, 0].plot(thresholds, cp_scores, marker='o', linewidth=2)
    axes[0, 0].set_xlabel('閾値')
    axes[0, 0].set_ylabel('コア-ペリフェリスコア')
    axes[0, 0].set_title('コア-ペリフェリ構造の明瞭性')
    axes[0, 0].grid(alpha=0.3)

    # モジュラリティ
    modularities = [e['community']['modularity'] for e in evaluations]
    axes[0, 1].plot(thresholds, modularities, marker='o', linewidth=2, color='green')
    axes[0, 1].set_xlabel('閾値')
    axes[0, 1].set_ylabel('モジュラリティ')
    axes[0, 1].set_title('コミュニティ構造の明瞭性')
    axes[0, 1].grid(alpha=0.3)

    # エッジ重みの分散
    weight_vars = [e['edge_weight']['weight_variance'] for e in evaluations]
    axes[1, 0].plot(thresholds, weight_vars, marker='o', linewidth=2, color='red')
    axes[1, 0].set_xlabel('閾値')
    axes[1, 0].set_ylabel('重みの分散')
    axes[1, 0].set_title('エッジ重みの情報量')
    axes[1, 0].grid(alpha=0.3)

    # 総合スコア
    total_scores = [e['total_score'] for e in evaluations]
    axes[1, 1].plot(thresholds, total_scores, marker='o', linewidth=2, color='purple')
    axes[1, 1].set_xlabel('閾値')
    axes[1, 1].set_ylabel('総合スコア')
    axes[1, 1].set_title('総合評価スコア')
    axes[1, 1].grid(alpha=0.3)

    # 最適点をマーク
    best_idx = total_scores.index(max(total_scores))
    best_threshold = thresholds[best_idx]
    axes[1, 1].axvline(best_threshold, color='orange', linestyle='--', label=f'最適: {best_threshold:.3f}')
    axes[1, 1].legend()

    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    plt.close()

def visualize_cluster_internal_graph(
    G: nx.Graph,
    cluster_nodes: Set,
    cluster_id: int,
    summaries_dict: Dict[str, str],
    center_node: str,
    output_path: Path
):
    """クラスタ内部のグラフを可視化"""
    subgraph = G.subgraph(cluster_nodes)

    if subgraph.number_of_nodes() == 0:
        return

    fig, ax = plt.subplots(figsize=(16, 14))

    # レイアウト
    pos = nx.spring_layout(subgraph, k=1.5, iterations=50, seed=42)

    # PageRankを計算
    try:
        pagerank = nx.pagerank(subgraph, weight='weight')
    except:
        pagerank = {node: 1.0 / subgraph.number_of_nodes() for node in subgraph.nodes()}

    # ノードの色をPageRankに基づいてグラデーション
    node_colors = [pagerank.get(node, 0) for node in subgraph.nodes()]

    # ノードサイズは次数に比例
    node_sizes = [300 + 100 * subgraph.degree(node) for node in subgraph.nodes()]

    # エッジの重み
    edges = subgraph.edges()
    weights = [subgraph[u][v]['weight'] for u, v in edges]

    # 描画
    if weights:
        nx.draw_networkx_edges(
            subgraph, pos,
            width=[w * 3 for w in weights],
            alpha=0.4,
            edge_color=weights,
            edge_cmap=plt.cm.YlOrRd,
            edge_vmin=min(weights),
            edge_vmax=max(weights)
        )

    nx.draw_networkx_nodes(
        subgraph, pos,
        node_size=node_sizes,
        node_color=node_colors,
        cmap=plt.cm.YlOrRd,
        vmin=min(node_colors) if node_colors else 0,
        vmax=max(node_colors) if node_colors else 1,
        alpha=0.9,
        edgecolors='black',
        linewidths=2
    )

    # ラベル（改行対応）
    labels = {}
    for node in subgraph.nodes():
        summary = summaries_dict.get(node, '')
        lines = []
        for i in range(0, len(summary), 15):
            lines.append(summary[i:i+15])
        labels[node] = '\n'.join(lines)

    nx.draw_networkx_labels(subgraph, pos, labels, font_size=8, font_family='Hiragino Sans')

    ax.set_title(
        f'クラスタ {cluster_id} の内部構造\n'
        f'（ノード数: {subgraph.number_of_nodes()}, エッジ数: {subgraph.number_of_edges()}）',
        fontsize=14,
        fontweight='bold'
    )
    ax.axis('off')

    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    plt.close()

def build_meta_graph(
    G: nx.Graph,
    communities: List[Set],
    sim_matrix: np.ndarray,
    ids: List[str],
    summaries_dict: Dict[str, str]
) -> Tuple[nx.Graph, Dict]:
    """クラスタ間のメタグラフを構築"""
    id_to_idx = {id_: i for i, id_ in enumerate(ids)}
    meta_G = nx.Graph()
    cluster_info_meta = {}

    for i, cluster in enumerate(communities):
        cluster_id = i + 1
        cluster_nodes = list(cluster)

        subgraph = G.subgraph(cluster)
        if subgraph.number_of_edges() > 0:
            avg_similarity = np.mean([data['weight'] for _, _, data in subgraph.edges(data=True)])
        else:
            avg_similarity = 0

        if subgraph.number_of_nodes() > 0:
            try:
                pagerank = nx.pagerank(subgraph, weight='weight')
                center_node = max(pagerank.keys(), key=lambda x: pagerank[x])
                center_summary = summaries_dict.get(center_node, '')
            except:
                center_node = cluster_nodes[0]
                center_summary = summaries_dict.get(center_node, '')
        else:
            center_node = None
            center_summary = ''

        cluster_info_meta[cluster_id] = {
            'nodes': cluster_nodes,
            'size': len(cluster_nodes),
            'avg_similarity': avg_similarity,
            'center_summary': center_summary
        }

        meta_G.add_node(cluster_id, size=len(cluster_nodes), label=center_summary[:30])

    # クラスタ間のエッジを計算
    for i, cluster_i in enumerate(communities):
        for j, cluster_j in enumerate(communities):
            if i >= j:
                continue

            cluster_id_i = i + 1
            cluster_id_j = j + 1

            similarities = []
            for node_i in cluster_i:
                for node_j in cluster_j:
                    idx_i = id_to_idx.get(node_i)
                    idx_j = id_to_idx.get(node_j)
                    if idx_i is not None and idx_j is not None:
                        similarities.append(sim_matrix[idx_i, idx_j])

            if similarities:
                avg_inter_similarity = np.mean(similarities)
                if avg_inter_similarity > 0.75:
                    meta_G.add_edge(
                        cluster_id_i,
                        cluster_id_j,
                        weight=avg_inter_similarity
                    )

    return meta_G, cluster_info_meta

def visualize_meta_graph(
    meta_G: nx.Graph,
    cluster_info_meta: Dict,
    output_path: Path
):
    """クラスタ間のメタグラフを可視化"""
    fig, ax = plt.subplots(figsize=(20, 18))

    pos = nx.spring_layout(meta_G, k=4, iterations=100, seed=42)

    try:
        meta_pagerank = nx.pagerank(meta_G, weight='weight')
    except:
        meta_pagerank = {node: 1.0 / meta_G.number_of_nodes() for node in meta_G.nodes()}

    node_sizes = [cluster_info_meta[node]['size'] * 150 for node in meta_G.nodes()]
    node_colors = [meta_pagerank.get(node, 0) for node in meta_G.nodes()]

    if meta_G.number_of_edges() > 0:
        edges = meta_G.edges()
        weights = [meta_G[u][v]['weight'] for u, v in edges]

        nx.draw_networkx_edges(
            meta_G, pos,
            width=[w * 5 for w in weights],
            alpha=0.4,
            edge_color='gray'
        )

    nx.draw_networkx_nodes(
        meta_G, pos,
        node_size=node_sizes,
        node_color=node_colors,
        cmap=plt.cm.YlOrRd,
        vmin=min(node_colors) if node_colors else 0,
        vmax=max(node_colors) if node_colors else 1,
        alpha=0.9,
        edgecolors='black',
        linewidths=2
    )

    labels = {}
    for node in meta_G.nodes():
        size = cluster_info_meta[node]['size']
        labels[node] = f"C{node}\n({size}件)"

    nx.draw_networkx_labels(meta_G, pos, labels, font_size=10, font_weight='bold')

    for node, (x, y) in pos.items():
        summary = cluster_info_meta[node]['center_summary']
        lines = []
        for i in range(0, len(summary), 12):
            lines.append(summary[i:i+12])
        if len(lines) > 3:
            lines = lines[:3]
            lines[-1] = lines[-1][:9] + '...'

        formatted_summary = '\n'.join(lines)

        ax.text(
            x, y - 0.12,
            formatted_summary,
            fontsize=8,
            ha='center',
            bbox=dict(boxstyle='round,pad=0.3', facecolor='yellow', alpha=0.5)
        )

    ax.set_title(
        f'クラスタ間の関係（メタグラフ）\n'
        f'クラスタ数: {meta_G.number_of_nodes()}, クラスタ間接続: {meta_G.number_of_edges()}',
        fontsize=14,
        fontweight='bold'
    )
    ax.axis('off')

    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    plt.close()

def create_cluster_report(
    best_evaluation: Dict,
    cluster_info: List[Dict],
    all_evaluations: List[Dict],
    meta_graph_stats: Dict,
    output_path: Path
):
    """クラスタ分析レポートをHTMLで作成"""
    best_threshold = best_evaluation['threshold']

    html_content = f"""
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>インテントクラスタ分析レポート</title>
    <style>
        body {{
            font-family: 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', sans-serif;
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }}
        h1 {{
            color: #333;
            border-bottom: 3px solid #4CAF50;
            padding-bottom: 10px;
        }}
        h2 {{
            color: #555;
            border-bottom: 2px solid #2196F3;
            padding-bottom: 8px;
            margin-top: 30px;
        }}
        h3 {{
            color: #666;
            margin-top: 20px;
        }}
        .section {{
            background-color: white;
            padding: 20px;
            margin: 20px 0;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }}
        table {{
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
        }}
        th, td {{
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #ddd;
        }}
        th {{
            background-color: #4CAF50;
            color: white;
            font-weight: bold;
        }}
        tr:hover {{
            background-color: #f5f5f5;
        }}
        .cluster {{
            background-color: #f9f9f9;
            padding: 20px;
            margin: 20px 0;
            border-radius: 8px;
            border-left: 5px solid #FF9800;
        }}
        .cluster-header {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
        }}
        .cluster-title {{
            font-size: 1.3em;
            font-weight: bold;
            color: #333;
        }}
        .cluster-size {{
            background-color: #FF9800;
            color: white;
            padding: 5px 15px;
            border-radius: 20px;
            font-weight: bold;
        }}
        .center-intent {{
            background-color: #E3F2FD;
            padding: 15px;
            border-radius: 5px;
            margin: 10px 0;
            border-left: 4px solid #2196F3;
        }}
        .center-label {{
            font-weight: bold;
            color: #1976D2;
            font-size: 0.9em;
            margin-bottom: 5px;
        }}
        .intent-list {{
            margin-top: 15px;
        }}
        .intent-item {{
            background-color: white;
            padding: 10px;
            margin: 5px 0;
            border-radius: 3px;
            border-left: 3px solid #4CAF50;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }}
        .intent-item:hover {{
            background-color: #f0f0f0;
        }}
        .intent-id {{
            font-size: 0.85em;
            color: #666;
            font-family: monospace;
        }}
        .intent-degree {{
            background-color: #4CAF50;
            color: white;
            padding: 3px 10px;
            border-radius: 15px;
            font-size: 0.85em;
        }}
        .stats {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin: 15px 0;
        }}
        .stat-box {{
            background-color: #e3f2fd;
            padding: 15px;
            border-radius: 5px;
            border-left: 4px solid #2196F3;
        }}
        .stat-label {{
            font-weight: bold;
            color: #555;
            font-size: 0.9em;
        }}
        .stat-value {{
            font-size: 1.5em;
            color: #1976D2;
            margin-top: 5px;
        }}
        img {{
            max-width: 100%;
            height: auto;
            border-radius: 5px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            margin: 15px 0;
        }}
        .best-indicator {{
            background-color: #FFD700;
            color: #333;
            padding: 5px 10px;
            border-radius: 3px;
            font-weight: bold;
            font-size: 0.9em;
        }}
    </style>
</head>
<body>
    <h1>🎯 インテントクラスタ分析レポート</h1>

    <div class="section">
        <h2>1. 最適グラフの選定</h2>
        <p>以下の3つの評価基準に基づいて最適な類似度閾値を選定しました：</p>
        <ul>
            <li><strong>コア-ペリフェリ構造：</strong> 中心的なノードと周辺ノードの明確な区別</li>
            <li><strong>コミュニティ構造（モジュラリティ）：</strong> 意味的にまとまったクラスタの形成</li>
            <li><strong>エッジ重みの情報量：</strong> 類似度の多様性（分散）</li>
        </ul>

        <h3>評価結果の比較</h3>
        <img src="evaluation_comparison.png" alt="評価指標の比較">

        <h3>選定された最適閾値</h3>
        <div class="stats">
            <div class="stat-box">
                <div class="stat-label">最適閾値</div>
                <div class="stat-value">{best_threshold:.4f}</div>
            </div>
            <div class="stat-box">
                <div class="stat-label">総合スコア</div>
                <div class="stat-value">{best_evaluation['total_score']:.4f}</div>
            </div>
            <div class="stat-box">
                <div class="stat-label">検出クラスタ数</div>
                <div class="stat-value">{best_evaluation['community']['num_communities']}</div>
            </div>
            <div class="stat-box">
                <div class="stat-label">モジュラリティ</div>
                <div class="stat-value">{best_evaluation['community']['modularity']:.4f}</div>
            </div>
        </div>

        <h3>詳細評価指標</h3>
        <table>
            <tr>
                <th>指標</th>
                <th>値</th>
                <th>説明</th>
            </tr>
            <tr>
                <td>ノード数</td>
                <td>{best_evaluation['num_nodes']}</td>
                <td>グラフ内の総ノード数</td>
            </tr>
            <tr>
                <td>エッジ数</td>
                <td>{best_evaluation['num_edges']}</td>
                <td>グラフ内の総エッジ数</td>
            </tr>
            <tr>
                <td>グラフ密度</td>
                <td>{best_evaluation['density']:.4f}</td>
                <td>実際のエッジ数 / 可能な最大エッジ数</td>
            </tr>
            <tr>
                <td>連結成分数</td>
                <td>{best_evaluation['num_components']}</td>
                <td>分離したサブグラフの数</td>
            </tr>
            <tr>
                <td>コアノード数</td>
                <td>{best_evaluation['core_periphery']['core_size']}</td>
                <td>高次数を持つ中心的ノード数</td>
            </tr>
            <tr>
                <td>ペリフェリノード数</td>
                <td>{best_evaluation['core_periphery']['periphery_size']}</td>
                <td>低次数を持つ周辺ノード数</td>
            </tr>
            <tr>
                <td>エッジ重み平均</td>
                <td>{best_evaluation['edge_weight']['weight_mean']:.4f}</td>
                <td>類似度の平均値</td>
            </tr>
            <tr>
                <td>エッジ重み分散</td>
                <td>{best_evaluation['edge_weight']['weight_variance']:.6f}</td>
                <td>類似度のばらつき</td>
            </tr>
        </table>
    </div>

    <div class="section">
        <h2>2. クラスタ一覧（サイズ順）</h2>
        <p>検出された全{len(cluster_info)}クラスタの概要です。各クラスタの中心インテントを基準に整理されています。</p>

        <table>
            <tr>
                <th>クラスタID</th>
                <th>サイズ</th>
                <th>中心インテント</th>
                <th>平均類似度</th>
            </tr>
"""

    for cluster in cluster_info:
        html_content += f"""
            <tr>
                <td><strong>クラスタ {cluster['cluster_id']}</strong></td>
                <td>{cluster['size']}</td>
                <td>{cluster['center_summary']}</td>
                <td>{cluster['avg_similarity']:.4f}</td>
            </tr>
"""

    html_content += """
        </table>
    </div>

    <div class="section">
        <h2>3. クラスタ詳細</h2>
        <p>各クラスタに含まれるインテントの一覧です。中心インテントは青色で強調表示されています。</p>
"""

    for cluster in cluster_info:
        html_content += f"""
        <div class="cluster">
            <div class="cluster-header">
                <div class="cluster-title">📁 クラスタ {cluster['cluster_id']}</div>
                <div class="cluster-size">{cluster['size']}件</div>
            </div>

            <div class="center-intent">
                <div class="center-label">⭐ 中心インテント</div>
                <div><strong>{cluster['center_node']}:</strong> {cluster['center_summary']}</div>
                <div style="margin-top: 5px; font-size: 0.9em; color: #666;">
                    平均類似度: {cluster['avg_similarity']:.4f}
                </div>
            </div>

            <div class="intent-list">
                <h4>含まれるインテント（次数順）</h4>
"""

        for intent in cluster['intents']:
            center_mark = " ⭐" if intent['is_center'] else ""
            html_content += f"""
                <div class="intent-item">
                    <div>
                        <div>{intent['summary']}{center_mark}</div>
                        <div class="intent-id">{intent['id']}</div>
                    </div>
                    <div class="intent-degree">次数: {intent['degree']}</div>
                </div>
"""

        html_content += """
            </div>
        </div>
"""

    html_content += f"""
    </div>

    <div class="section">
        <h2>4. 他の閾値との比較</h2>
        <p>異なる閾値での評価結果を比較します。</p>

        <table>
            <tr>
                <th>閾値</th>
                <th>総合スコア</th>
                <th>モジュラリティ</th>
                <th>クラスタ数</th>
                <th>エッジ数</th>
            </tr>
"""

    for eval_result in sorted(all_evaluations, key=lambda x: x['total_score'], reverse=True):
        is_best = eval_result['threshold'] == best_threshold
        best_mark = '<span class="best-indicator">★ 最適</span>' if is_best else ''
        html_content += f"""
            <tr style="{'background-color: #FFF9C4;' if is_best else ''}">
                <td><strong>{eval_result['threshold']:.4f}</strong> {best_mark}</td>
                <td>{eval_result['total_score']:.4f}</td>
                <td>{eval_result['community']['modularity']:.4f}</td>
                <td>{eval_result['community']['num_communities']}</td>
                <td>{eval_result['num_edges']}</td>
            </tr>
"""

    html_content += f"""
        </table>
    </div>

    <div class="section">
        <h2>5. クラスタ間の関係（メタグラフ）</h2>
        <p>各クラスタをノードとして、クラスタ間の平均類似度に基づいて接続したメタグラフです。</p>

        <img src="meta_graph.png" alt="クラスタ間メタグラフ">

        <h3>メタグラフの統計</h3>
        <div class="stats">
            <div class="stat-box">
                <div class="stat-label">クラスタ総数</div>
                <div class="stat-value">{meta_graph_stats['num_clusters']}</div>
            </div>
            <div class="stat-box">
                <div class="stat-label">クラスタ間接続数</div>
                <div class="stat-value">{meta_graph_stats['num_edges']}</div>
            </div>
            <div class="stat-box">
                <div class="stat-label">孤立クラスタ数</div>
                <div class="stat-value">{meta_graph_stats['num_isolated']}</div>
            </div>
            <div class="stat-box">
                <div class="stat-label">平均クラスタ間類似度</div>
                <div class="stat-value">{meta_graph_stats['avg_inter_similarity']:.4f}</div>
            </div>
        </div>

        <h3>解釈</h3>
        <ul>
            <li><strong>ノードの色（グラデーション）</strong>: PageRank（中心性）を表す（赤=重要、黄=周辺）</li>
            <li><strong>ノードサイズ</strong>: クラスタに含まれるインテント数に比例</li>
            <li><strong>エッジの太さ</strong>: クラスタ間の平均類似度に比例</li>
            <li><strong>最も赤いクラスタ</strong>: 多くのクラスタと関連する中心的なトピック</li>
        </ul>
    </div>

    <div class="section">
        <h2>6. 主要クラスタの内部構造</h2>
        <p>サイズの大きい上位5クラスタについて、内部のグラフ構造を可視化しました。</p>
"""

    # 上位5クラスタ
    for i, cluster in enumerate(cluster_info[:5]):
        html_content += f"""
        <h3>クラスタ {cluster['cluster_id']}（{cluster['size']}件）</h3>
        <p><strong>中心テーマ:</strong> {cluster['center_summary']}</p>
        <img src="cluster_{cluster['cluster_id']}_internal.png" alt="クラスタ{cluster['cluster_id']}内部構造">
"""

    html_content += """
        <h3>内部グラフの見方</h3>
        <ul>
            <li><strong>ノードの色（グラデーション）</strong>: PageRank（中心性）を表す（赤=中心、黄=周辺）</li>
            <li><strong>ノードサイズ</strong>: クラスタ内での接続数（次数）に比例</li>
            <li><strong>エッジの太さ・色</strong>: 類似度（赤=高、黄=低）</li>
        </ul>
    </div>

    <div class="section">
        <h2>7. 生成日時</h2>
        <p>{pd.Timestamp.now().strftime('%Y年%m月%d日 %H:%M:%S')}</p>
    </div>

</body>
</html>
"""

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html_content)

def main():
    print("=" * 60)
    print("インテントクラスタ分析")
    print("=" * 60)

    # データ読み込み
    print("\n[1/7] 埋め込みデータを読み込み中...")
    input_file = "output/intents_embedded.json"
    data, embeddings, ids, summaries = load_embeddings(input_file)
    summaries_dict = dict(zip(ids, summaries))
    print(f"  ✓ {len(ids)}個のインテントを読み込みました")

    # 類似度行列計算
    print("\n[2/7] 類似度行列を計算中...")
    sim_matrix = compute_similarity_matrix(embeddings)
    print(f"  ✓ {sim_matrix.shape[0]}x{sim_matrix.shape[1]}の類似度行列を生成")

    # 複数閾値でグラフ生成と評価
    print("\n[3/7] 複数閾値でグラフを評価中...")

    # パーセンタイル値を取得
    triu_indices = np.triu_indices_from(sim_matrix, k=1)
    similarities = sim_matrix[triu_indices]

    # 評価する閾値（85%〜99.5%に範囲を拡張し、より細かく評価）
    percentiles = [85, 87, 89, 90, 92, 94, 95, 96, 97, 98, 99, 99.5]
    thresholds = [np.percentile(similarities, p) for p in percentiles]

    print(f"  評価範囲: {thresholds[0]:.4f} - {thresholds[-1]:.4f}")

    evaluations = []
    for threshold in thresholds:
        relations = extract_relations(sim_matrix, ids, threshold)
        G = build_graph(relations)
        evaluation = evaluate_graph_structure(G, threshold)
        evaluations.append(evaluation)

    # 正規化とスコアリング
    print("\n[4/7] 総合スコアを計算中...")
    evaluations = normalize_and_score(evaluations)

    # 最適グラフを選定
    best_evaluation = max(evaluations, key=lambda x: x['total_score'])
    best_threshold = best_evaluation['threshold']
    print(f"  ✓ 最適閾値: {best_threshold:.4f}")
    print(f"  ✓ 総合スコア: {best_evaluation['total_score']:.4f}")
    print(f"  ✓ モジュラリティ: {best_evaluation['community']['modularity']:.4f}")
    print(f"  ✓ クラスタ数: {best_evaluation['community']['num_communities']}")

    # 最適グラフを再構築
    print("\n[5/7] 最適グラフでクラスタ分析中...")
    relations = extract_relations(sim_matrix, ids, best_threshold)
    G = build_graph(relations)

    # クラスタ情報を抽出
    communities = best_evaluation['community']['communities']
    cluster_info = analyze_clusters(G, communities, summaries_dict)
    print(f"  ✓ {len(cluster_info)}個のクラスタを抽出")
    print(f"  ✓ 最大クラスタサイズ: {cluster_info[0]['size']}")

    # 評価比較の可視化
    print("\n[6/7] 評価結果を可視化中...")
    visualize_evaluation_comparison(evaluations, OUTPUT_DIR / "evaluation_comparison.png")
    print("  ✓ 可視化完了")

    # メタグラフ構築と可視化
    print("\n[7/10] クラスタ間のメタグラフを構築中...")
    meta_G, cluster_info_meta = build_meta_graph(G, communities, sim_matrix, ids, summaries_dict)
    print(f"  ✓ メタグラフ: {meta_G.number_of_nodes()}ノード, {meta_G.number_of_edges()}エッジ")

    print("\n[8/10] メタグラフを可視化中...")
    visualize_meta_graph(meta_G, cluster_info_meta, OUTPUT_DIR / "meta_graph.png")
    print("  ✓ メタグラフ可視化完了")

    # 主要クラスタの内部グラフを可視化
    print("\n[9/10] 主要クラスタの内部構造を可視化中...")
    for i, cluster in enumerate(cluster_info[:5]):
        cluster_nodes = set([item['id'] for item in cluster['intents']])
        visualize_cluster_internal_graph(
            G, cluster_nodes, cluster['cluster_id'], summaries_dict,
            cluster['center_node'],
            OUTPUT_DIR / f"cluster_{cluster['cluster_id']}_internal.png"
        )
        print(f"  ✓ クラスタ {cluster['cluster_id']} 可視化完了")

    # メタグラフの統計
    meta_graph_stats = {
        'num_clusters': meta_G.number_of_nodes(),
        'num_edges': meta_G.number_of_edges(),
        'num_isolated': len(list(nx.isolates(meta_G))),
        'avg_inter_similarity': np.mean([data['weight'] for _, _, data in meta_G.edges(data=True)]) if meta_G.number_of_edges() > 0 else 0
    }

    # レポート生成
    print("\n[10/10] 統合クラスタ分析レポートを生成中...")
    create_cluster_report(
        best_evaluation,
        cluster_info,
        evaluations,
        meta_graph_stats,
        OUTPUT_DIR / "cluster_report.html"
    )
    print("  ✓ レポート生成完了")

    print("\n" + "=" * 60)
    print("✅ 分析完了！")
    print("=" * 60)
    print(f"\n📁 出力ディレクトリ: {OUTPUT_DIR}")
    print(f"📄 統合レポート: {OUTPUT_DIR / 'cluster_report.html'}")
    print(f"📊 メタグラフ: {OUTPUT_DIR / 'meta_graph.png'}")
    print(f"📊 クラスタ内部グラフ: cluster_X_internal.png (X=1-5)")
    print("\nブラウザでレポートを開いて結果を確認してください。")

if __name__ == "__main__":
    main()

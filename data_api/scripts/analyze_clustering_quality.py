#!/usr/bin/env python3
"""
クラスタリング品質の詳細分析

1. 埋め込み距離のヒストグラム
2. 階層とクラスタの関係分析
3. クラスタ内の埋め込み類似度分析
"""

import json
import numpy as np
import pandas as pd
from pathlib import Path
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.metrics.pairwise import cosine_similarity

# 日本語フォント設定
plt.rcParams['font.family'] = 'Hiragino Sans'
plt.rcParams['axes.unicode_minus'] = False

# 出力ディレクトリ
OUTPUT_DIR = Path("output/clustering_analysis")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def load_data():
    """データ読み込み"""
    # クラスタリング結果
    df = pd.read_csv("output/message_clustering/clustered_messages.csv")

    # 埋め込みデータ
    with open("output/message_clustering/messages_embedded.json", 'r', encoding='utf-8') as f:
        embedding_data = json.load(f)

    # message_idとembeddingの対応
    embedding_dict = {item['id']: item['embedding'] for item in embedding_data}

    # DataFrameの順序に合わせて埋め込みを配置
    embeddings_list = []
    for msg_id in df['message_id']:
        if msg_id in embedding_dict:
            embeddings_list.append(embedding_dict[msg_id])
        else:
            embeddings_list.append([0.0] * 1024)

    embeddings = np.array(embeddings_list)

    return df, embeddings


def analyze_embedding_distances(embeddings):
    """埋め込み距離の分析"""
    print("\n" + "="*60)
    print("埋め込み距離の分析")
    print("="*60)

    # コサイン類似度を計算
    similarity = cosine_similarity(embeddings)

    # 距離に変換（0〜2の範囲）
    distance = 1 - similarity

    # 上三角のみ取得（対角線を除く）
    triu_indices = np.triu_indices_from(distance, k=1)
    distances_flat = distance[triu_indices]

    # 統計情報
    print("\n埋め込み距離の統計:")
    print(f"  平均: {distances_flat.mean():.4f}")
    print(f"  中央値: {np.median(distances_flat):.4f}")
    print(f"  最小: {distances_flat.min():.4f}")
    print(f"  最大: {distances_flat.max():.4f}")
    print(f"  標準偏差: {distances_flat.std():.4f}")

    # パーセンタイル
    percentiles = [10, 25, 50, 75, 90, 95, 99]
    print("\nパーセンタイル:")
    for p in percentiles:
        val = np.percentile(distances_flat, p)
        print(f"  {p}%: {val:.4f}")

    # ヒストグラム作成
    fig, axes = plt.subplots(2, 2, figsize=(14, 10))

    # 全体のヒストグラム
    ax = axes[0, 0]
    ax.hist(distances_flat, bins=100, alpha=0.7, color='blue', edgecolor='black')
    ax.axvline(distances_flat.mean(), color='red', linestyle='--', linewidth=2, label=f'平均: {distances_flat.mean():.4f}')
    ax.axvline(np.median(distances_flat), color='green', linestyle='--', linewidth=2, label=f'中央値: {np.median(distances_flat):.4f}')
    ax.set_xlabel('埋め込み距離（コサイン距離）')
    ax.set_ylabel('ペア数')
    ax.set_title('埋め込み距離の分布（全体）')
    ax.legend()
    ax.grid(alpha=0.3)

    # 対数スケール
    ax = axes[0, 1]
    ax.hist(distances_flat, bins=100, alpha=0.7, color='blue', edgecolor='black')
    ax.set_xlabel('埋め込み距離（コサイン距離）')
    ax.set_ylabel('ペア数（対数スケール）')
    ax.set_yscale('log')
    ax.set_title('埋め込み距離の分布（対数スケール）')
    ax.grid(alpha=0.3)

    # 累積分布
    ax = axes[1, 0]
    sorted_distances = np.sort(distances_flat)
    cumulative = np.arange(1, len(sorted_distances) + 1) / len(sorted_distances) * 100
    ax.plot(sorted_distances, cumulative, linewidth=2)
    ax.set_xlabel('埋め込み距離（コサイン距離）')
    ax.set_ylabel('累積パーセンタイル (%)')
    ax.set_title('埋め込み距離の累積分布')
    ax.grid(alpha=0.3)

    # 近い距離のみ（距離 < 0.5）
    ax = axes[1, 1]
    close_distances = distances_flat[distances_flat < 0.5]
    if len(close_distances) > 0:
        ax.hist(close_distances, bins=50, alpha=0.7, color='green', edgecolor='black')
        ax.set_xlabel('埋め込み距離（コサイン距離）')
        ax.set_ylabel('ペア数')
        ax.set_title(f'近い距離のみ（< 0.5）: {len(close_distances)}ペア')
        ax.grid(alpha=0.3)
    else:
        ax.text(0.5, 0.5, '距離 < 0.5 のペアなし', ha='center', va='center', transform=ax.transAxes)

    plt.tight_layout()
    output_path = OUTPUT_DIR / "embedding_distance_histogram.png"
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    plt.close()

    print(f"\n✓ ヒストグラムを保存: {output_path}")

    return distance


def analyze_hierarchy_cluster_relationship(df):
    """階層とクラスタの関係を分析"""
    print("\n" + "="*60)
    print("階層とクラスタの関係分析")
    print("="*60)

    # 階層（チャネル）ごとのクラスタ散らばり
    hierarchy_cluster_mapping = {}

    for hierarchy in df['normalized_path'].unique():
        hierarchy_df = df[df['normalized_path'] == hierarchy]
        clusters = hierarchy_df['cluster'].unique()

        hierarchy_cluster_mapping[hierarchy] = {
            'n_messages': len(hierarchy_df),
            'n_clusters': len(clusters),
            'clusters': sorted(clusters.tolist())
        }

    # 3つ以上のクラスタに散らばっている階層
    scattered_hierarchies = {k: v for k, v in hierarchy_cluster_mapping.items() if v['n_clusters'] >= 3}

    print(f"\n階層の総数: {len(hierarchy_cluster_mapping)}")
    print(f"3つ以上のクラスタに散らばっている階層: {len(scattered_hierarchies)}")

    # 散らばり度合いのヒストグラム
    n_clusters_list = [v['n_clusters'] for v in hierarchy_cluster_mapping.values()]

    print("\n階層ごとのクラスタ数分布:")
    for n in range(1, max(n_clusters_list) + 1):
        count = n_clusters_list.count(n)
        print(f"  {n}個のクラスタ: {count}階層")

    # 詳細表示（3つ以上に散らばっている場合）
    if scattered_hierarchies:
        print("\n3つ以上のクラスタに散らばっている階層の詳細:")
        for hierarchy, info in sorted(scattered_hierarchies.items(), key=lambda x: x[1]['n_clusters'], reverse=True):
            print(f"\n  階層: {hierarchy}")
            print(f"    メッセージ数: {info['n_messages']}")
            print(f"    クラスタ数: {info['n_clusters']}")
            print(f"    クラスタID: {info['clusters']}")
    else:
        print("\n⚠️ 3つ以上のクラスタに散らばっている階層は0件です")

    # 可視化
    fig, axes = plt.subplots(2, 2, figsize=(14, 10))

    # クラスタ数のヒストグラム
    ax = axes[0, 0]
    ax.hist(n_clusters_list, bins=range(1, max(n_clusters_list) + 2), alpha=0.7, color='blue', edgecolor='black')
    ax.set_xlabel('1つの階層が散らばるクラスタ数')
    ax.set_ylabel('階層数')
    ax.set_title('階層ごとのクラスタ散らばり度')
    ax.grid(alpha=0.3)

    # メッセージ数 vs クラスタ数
    ax = axes[0, 1]
    n_messages_list = [v['n_messages'] for v in hierarchy_cluster_mapping.values()]
    ax.scatter(n_messages_list, n_clusters_list, alpha=0.6)
    ax.set_xlabel('階層内のメッセージ数')
    ax.set_ylabel('散らばるクラスタ数')
    ax.set_title('メッセージ数とクラスタ散らばりの関係')
    ax.grid(alpha=0.3)

    # クラスタごとの階層数
    ax = axes[1, 0]
    cluster_hierarchy_counts = df.groupby('cluster')['normalized_path'].nunique().sort_values(ascending=False)
    ax.bar(range(len(cluster_hierarchy_counts)), cluster_hierarchy_counts.values, alpha=0.7, color='green', edgecolor='black')
    ax.set_xlabel('クラスタID')
    ax.set_ylabel('含まれる階層数')
    ax.set_title('各クラスタに含まれる階層の数')
    ax.set_xticks(range(len(cluster_hierarchy_counts)))
    ax.set_xticklabels([f"C{i}" for i in cluster_hierarchy_counts.index], rotation=45)
    ax.grid(alpha=0.3)

    # クロス集計のヒートマップ（上位10階層のみ）
    ax = axes[1, 1]
    top_hierarchies = df['normalized_path'].value_counts().head(10).index
    df_top = df[df['normalized_path'].isin(top_hierarchies)]
    crosstab = pd.crosstab(df_top['normalized_path'], df_top['cluster'])

    sns.heatmap(crosstab, cmap='YlOrRd', annot=True, fmt='d', ax=ax, cbar_kws={'label': 'メッセージ数'})
    ax.set_xlabel('クラスタID')
    ax.set_ylabel('階層（上位10件）')
    ax.set_title('階層 × クラスタ分布（上位10階層）')

    plt.tight_layout()
    output_path = OUTPUT_DIR / "hierarchy_cluster_relationship.png"
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    plt.close()

    print(f"\n✓ 関係図を保存: {output_path}")

    return hierarchy_cluster_mapping


def analyze_intra_cluster_similarity(df, embeddings):
    """クラスタ内の埋め込み類似度を分析"""
    print("\n" + "="*60)
    print("クラスタ内の埋め込み類似度分析")
    print("="*60)

    cluster_similarities = {}

    for cluster_id in sorted(df['cluster'].unique()):
        cluster_mask = df['cluster'] == cluster_id
        cluster_embeddings = embeddings[cluster_mask]

        if len(cluster_embeddings) < 2:
            continue

        # クラスタ内のコサイン類似度
        similarity = cosine_similarity(cluster_embeddings)

        # 上三角のみ（対角線を除く）
        triu_indices = np.triu_indices_from(similarity, k=1)
        similarities_flat = similarity[triu_indices]

        cluster_similarities[cluster_id] = {
            'size': len(cluster_embeddings),
            'mean_similarity': similarities_flat.mean(),
            'std_similarity': similarities_flat.std(),
            'min_similarity': similarities_flat.min(),
            'max_similarity': similarities_flat.max()
        }

    # 結果表示
    print("\nクラスタ内の平均コサイン類似度:")
    for cluster_id, stats in sorted(cluster_similarities.items()):
        print(f"  クラスタ {cluster_id}: 平均={stats['mean_similarity']:.4f}, "
              f"標準偏差={stats['std_similarity']:.4f}, "
              f"範囲=[{stats['min_similarity']:.4f}, {stats['max_similarity']:.4f}], "
              f"サイズ={stats['size']}")

    # 可視化
    fig, axes = plt.subplots(1, 2, figsize=(14, 5))

    # クラスタごとの平均類似度
    ax = axes[0]
    cluster_ids = list(cluster_similarities.keys())
    mean_sims = [cluster_similarities[c]['mean_similarity'] for c in cluster_ids]
    colors = ['red' if s < 0.5 else 'orange' if s < 0.7 else 'green' for s in mean_sims]

    ax.bar(range(len(cluster_ids)), mean_sims, alpha=0.7, color=colors, edgecolor='black')
    ax.axhline(0.5, color='red', linestyle='--', linewidth=1, label='低い類似度 (< 0.5)')
    ax.axhline(0.7, color='orange', linestyle='--', linewidth=1, label='中程度 (0.5-0.7)')
    ax.set_xlabel('クラスタID')
    ax.set_ylabel('平均コサイン類似度')
    ax.set_title('クラスタ内の埋め込み類似度（平均）')
    ax.set_xticks(range(len(cluster_ids)))
    ax.set_xticklabels([f"C{c}" for c in cluster_ids], rotation=45)
    ax.legend()
    ax.grid(alpha=0.3)

    # 類似度の分布（全クラスタ）
    ax = axes[1]
    all_mean_sims = [s['mean_similarity'] for s in cluster_similarities.values()]
    ax.hist(all_mean_sims, bins=20, alpha=0.7, color='blue', edgecolor='black')
    ax.axvline(np.mean(all_mean_sims), color='red', linestyle='--', linewidth=2,
               label=f'全体平均: {np.mean(all_mean_sims):.4f}')
    ax.set_xlabel('クラスタ内平均コサイン類似度')
    ax.set_ylabel('クラスタ数')
    ax.set_title('クラスタ内類似度の分布')
    ax.legend()
    ax.grid(alpha=0.3)

    plt.tight_layout()
    output_path = OUTPUT_DIR / "intra_cluster_similarity.png"
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    plt.close()

    print(f"\n✓ 類似度分析を保存: {output_path}")

    return cluster_similarities


def generate_summary_report(distance_stats, hierarchy_mapping, cluster_similarities):
    """サマリーレポート生成"""
    report_path = OUTPUT_DIR / "clustering_quality_report.txt"

    with open(report_path, 'w', encoding='utf-8') as f:
        f.write("="*60 + "\n")
        f.write("クラスタリング品質分析レポート\n")
        f.write("="*60 + "\n\n")

        # 埋め込み距離
        f.write("【埋め込み距離の統計】\n")
        f.write("  全ペアの距離分布を分析\n")
        f.write("  詳細はグラフを参照: embedding_distance_histogram.png\n\n")

        # 階層とクラスタの関係
        f.write("【階層とクラスタの関係】\n")
        f.write(f"  総階層数: {len(hierarchy_mapping)}\n")

        scattered_count = sum(1 for v in hierarchy_mapping.values() if v['n_clusters'] >= 3)
        f.write(f"  3つ以上のクラスタに散らばる階層: {scattered_count}\n")

        if scattered_count == 0:
            f.write("\n  ⚠️ 警告: 階層がクラスタに散らばっていません\n")
            f.write("  → 埋め込みよりもメタデータ（階層・時間）の影響が強すぎる可能性\n")
            f.write("  → 重みづけの調整を推奨（埋め込みの重みを増やす）\n\n")

        # クラスタ内類似度
        f.write("【クラスタ内の埋め込み類似度】\n")
        mean_sims = [s['mean_similarity'] for s in cluster_similarities.values()]
        f.write(f"  全クラスタの平均: {np.mean(mean_sims):.4f}\n")
        f.write(f"  最小: {min(mean_sims):.4f}\n")
        f.write(f"  最大: {max(mean_sims):.4f}\n\n")

        low_sim_clusters = [c for c, s in cluster_similarities.items() if s['mean_similarity'] < 0.5]
        if low_sim_clusters:
            f.write(f"  ⚠️ 低い類似度(<0.5)のクラスタ: {low_sim_clusters}\n")
            f.write("  → これらのクラスタは意味的に多様なメッセージを含む\n\n")

        f.write("【推奨事項】\n")
        if scattered_count == 0:
            f.write("  1. 埋め込みの重みを増やす（例: 0.7以上）\n")
            f.write("  2. メタデータの重みを減らす（時間・階層の合計を0.3以下）\n")
        else:
            f.write("  1. 現在の重みづけは適切です\n")
            f.write("  2. クラスタ内類似度が低い場合は、min_cluster_sizeを調整してください\n")

    print(f"\n✓ サマリーレポートを保存: {report_path}")


def main():
    """メイン処理"""
    print("="*60)
    print("クラスタリング品質の詳細分析")
    print("="*60)

    # データ読み込み
    print("\nデータを読み込み中...")
    df, embeddings = load_data()
    print(f"✓ {len(df)}件のメッセージと埋め込み（{embeddings.shape[1]}次元）を読み込みました")

    # 埋め込み距離の分析
    distance_matrix = analyze_embedding_distances(embeddings)

    # 階層とクラスタの関係分析
    hierarchy_mapping = analyze_hierarchy_cluster_relationship(df)

    # クラスタ内類似度の分析
    cluster_similarities = analyze_intra_cluster_similarity(df, embeddings)

    # サマリーレポート生成
    generate_summary_report(distance_matrix, hierarchy_mapping, cluster_similarities)

    print("\n" + "="*60)
    print("✅ 分析完了！")
    print("="*60)
    print(f"📁 出力ディレクトリ: {OUTPUT_DIR}")
    print("\n生成されたファイル:")
    print("  - embedding_distance_histogram.png (埋め込み距離のヒストグラム)")
    print("  - hierarchy_cluster_relationship.png (階層とクラスタの関係)")
    print("  - intra_cluster_similarity.png (クラスタ内類似度)")
    print("  - clustering_quality_report.txt (サマリーレポート)")


if __name__ == "__main__":
    main()

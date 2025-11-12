#!/usr/bin/env python3
"""
メッセージクラスタの可視化とレポート生成

クラスタリング結果の詳細な分析とHTMLレポート生成
"""

import json
import numpy as np
import pandas as pd
from pathlib import Path
from typing import Dict, List
from datetime import datetime

import matplotlib.pyplot as plt
import seaborn as sns

# 日本語フォント設定
plt.rcParams['font.family'] = 'Hiragino Sans'
plt.rcParams['axes.unicode_minus'] = False

# 出力ディレクトリ
OUTPUT_DIR = Path("output/message_clustering")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def analyze_cluster_characteristics(df: pd.DataFrame) -> List[Dict]:
    """
    各クラスタの特性を分析

    Args:
        df: クラスタラベル付きDataFrame

    Returns:
        クラスタ情報のリスト
    """
    cluster_info = []

    for cluster_id in sorted(df['cluster'].unique()):
        cluster_df = df[df['cluster'] == cluster_id]

        # 全メッセージ情報を構築
        messages = []
        for _, row in cluster_df.iterrows():
            messages.append({
                'id': row['message_id'],
                'channel': row['full_path'],
                'time': row['start_time'].strftime('%Y-%m-%d %H:%M'),
                'content': row['combined_content']
            })

        # 統計情報
        info = {
            'cluster_id': int(cluster_id),
            'size': len(cluster_df),
            'channels': cluster_df['full_path'].unique().tolist(),
            'n_channels': cluster_df['full_path'].nunique(),
            'time_span': {
                'start': cluster_df['start_time'].min().strftime('%Y-%m-%d %H:%M'),
                'end': cluster_df['start_time'].max().strftime('%Y-%m-%d %H:%M'),
                'duration_hours': (cluster_df['start_time'].max() - cluster_df['start_time'].min()).total_seconds() / 3600
            },
            'avg_hierarchy_depth': float(cluster_df['hierarchy_depth'].mean()),
            'messages': messages  # 全メッセージ
        }

        cluster_info.append(info)

    # サイズでソート
    cluster_info.sort(key=lambda x: x['size'], reverse=True)

    return cluster_info


def plot_cluster_heatmap(df: pd.DataFrame, output_path: Path):
    """クラスタ × チャネル のヒートマップ"""
    # ノイズを除外
    df_filtered = df[df['cluster'] != -1].copy()

    if len(df_filtered) == 0:
        print("  ! 有効なクラスタが無いためヒートマップをスキップ")
        return

    # クラスタ × チャネル のクロス集計
    crosstab = pd.crosstab(df_filtered['cluster'], df_filtered['full_path'])

    # 上位チャネルのみ表示
    top_channels = crosstab.sum(axis=0).nlargest(20).index
    crosstab_top = crosstab[top_channels]

    # ヒートマップ
    fig, ax = plt.subplots(figsize=(14, 10))
    sns.heatmap(crosstab_top, cmap='YlOrRd', annot=True, fmt='d', cbar_kws={'label': 'メッセージ数'})
    ax.set_xlabel('チャネル')
    ax.set_ylabel('クラスタID')
    ax.set_title('クラスタ × チャネル分布（上位20チャネル）')
    plt.xticks(rotation=45, ha='right')

    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    plt.close()


def plot_cluster_timeline(df: pd.DataFrame, output_path: Path):
    """クラスタごとの時系列タイムライン"""
    df_filtered = df[df['cluster'] != -1].copy()

    if len(df_filtered) == 0:
        print("  ! 有効なクラスタが無いためタイムラインをスキップ")
        return

    # 上位10クラスタのみ
    top_clusters = df_filtered['cluster'].value_counts().head(10).index

    fig, ax = plt.subplots(figsize=(16, 8))

    for i, cluster_id in enumerate(sorted(top_clusters)):
        cluster_df = df_filtered[df_filtered['cluster'] == cluster_id]
        times = cluster_df['start_time']

        # 散布図
        y_values = [i] * len(times)
        ax.scatter(times, y_values, alpha=0.6, s=50, label=f'Cluster {cluster_id} ({len(cluster_df)}件)')

    ax.set_yticks(range(len(top_clusters)))
    ax.set_yticklabels([f'Cluster {c}' for c in sorted(top_clusters)])
    ax.set_xlabel('時刻')
    ax.set_ylabel('クラスタ')
    ax.set_title('クラスタの時系列分布（上位10クラスタ）')
    ax.legend(bbox_to_anchor=(1.05, 1), loc='upper left')
    ax.grid(alpha=0.3, axis='x')

    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    plt.close()


def plot_distance_distributions(
    embedding_dist: np.ndarray,
    time_dist: np.ndarray,
    hierarchy_dist: np.ndarray,
    output_path: Path
):
    """各距離行列の分布を可視化"""
    fig, axes = plt.subplots(1, 3, figsize=(18, 5))

    # 上三角のみ取得
    triu_indices = np.triu_indices_from(time_dist, k=1)

    # 埋め込み距離
    if embedding_dist is not None:
        embed_vals = embedding_dist[triu_indices]
        axes[0].hist(embed_vals, bins=100, edgecolor='black', alpha=0.7)
        axes[0].set_xlabel('距離')
        axes[0].set_ylabel('頻度')
        axes[0].set_title(f'埋め込み距離分布\n平均: {embed_vals.mean():.3f}')
        axes[0].grid(alpha=0.3)

    # 時間距離
    time_vals = time_dist[triu_indices]
    axes[1].hist(time_vals, bins=100, edgecolor='black', alpha=0.7, color='orange')
    axes[1].set_xlabel('距離')
    axes[1].set_ylabel('頻度')
    axes[1].set_title(f'時間距離分布\n平均: {time_vals.mean():.3f}')
    axes[1].grid(alpha=0.3)

    # 階層距離
    hier_vals = hierarchy_dist[triu_indices]
    axes[2].hist(hier_vals, bins=100, edgecolor='black', alpha=0.7, color='green')
    axes[2].set_xlabel('距離')
    axes[2].set_ylabel('頻度')
    axes[2].set_title(f'階層距離分布\n平均: {hier_vals.mean():.3f}')
    axes[2].grid(alpha=0.3)

    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    plt.close()


def create_html_report(
    df: pd.DataFrame,
    cluster_info: List[Dict],
    metrics: Dict,
    config: Dict,
    output_path: Path
):
    """HTMLレポートを生成"""
    n_clusters = len([c for c in cluster_info if c['cluster_id'] != -1])
    n_noise = len(df[df['cluster'] == -1])

    html_content = f"""
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>メッセージクラスタリングレポート</title>
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
        .message-sample {{
            background-color: white;
            padding: 10px;
            margin: 5px 0;
            border-radius: 3px;
            border-left: 3px solid #4CAF50;
            font-size: 0.9em;
        }}
        img {{
            max-width: 100%;
            height: auto;
            border-radius: 5px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            margin: 15px 0;
        }}
        .config-table td:first-child {{
            font-weight: bold;
            background-color: #f0f0f0;
        }}
    </style>
</head>
<body>
    <h1>📊 メッセージクラスタリングレポート</h1>

    <div class="section">
        <h2>1. クラスタリング概要</h2>
        <div class="stats">
            <div class="stat-box">
                <div class="stat-label">総メッセージ数</div>
                <div class="stat-value">{len(df)}</div>
            </div>
            <div class="stat-box">
                <div class="stat-label">検出クラスタ数</div>
                <div class="stat-value">{n_clusters}</div>
            </div>
            <div class="stat-box">
                <div class="stat-label">ノイズ</div>
                <div class="stat-value">{n_noise}</div>
            </div>
            <div class="stat-box">
                <div class="stat-label">シルエット係数</div>
                <div class="stat-value">{metrics.get('silhouette_score', 0):.3f}</div>
            </div>
        </div>

        <h3>評価指標</h3>
        <table>
            <tr>
                <th>指標</th>
                <th>値</th>
                <th>説明</th>
            </tr>
            <tr>
                <td>Silhouette Score</td>
                <td>{metrics.get('silhouette_score', 0):.4f}</td>
                <td>-1〜1の範囲。大きいほど良い。</td>
            </tr>
            <tr>
                <td>Calinski-Harabasz Index</td>
                <td>{metrics.get('calinski_harabasz_score', 0):.2f}</td>
                <td>クラスタ間分散/クラスタ内分散。大きいほど良い。</td>
            </tr>
            <tr>
                <td>Davies-Bouldin Index</td>
                <td>{metrics.get('davies_bouldin_score', 0):.4f}</td>
                <td>クラスタの類似度。小さいほど良い。</td>
            </tr>
        </table>
    </div>

    <div class="section">
        <h2>2. クラスタリング設定</h2>
        <table class="config-table">
            <tr>
                <td>埋め込み重み</td>
                <td>{config.get('embedding_weight', 'N/A')}</td>
            </tr>
            <tr>
                <td>時間重み</td>
                <td>{config.get('time_weight', 'N/A')}</td>
            </tr>
            <tr>
                <td>階層重み</td>
                <td>{config.get('hierarchy_weight', 'N/A')}</td>
            </tr>
            <tr>
                <td>時間カーネル帯域幅</td>
                <td>{config.get('time_bandwidth_hours', 'N/A')}時間</td>
            </tr>
            <tr>
                <td>クラスタリング手法</td>
                <td>{config.get('method', 'N/A')}</td>
            </tr>
            <tr>
                <td>最小クラスタサイズ</td>
                <td>{config.get('min_cluster_size', 'N/A')}</td>
            </tr>
        </table>
    </div>

    <div class="section">
        <h2>3. 可視化</h2>

        <h3>クラスタサイズ分布</h3>
        <img src="cluster_distribution.png" alt="クラスタサイズ分布">

        <h3>t-SNE投影</h3>
        <img src="tsne_projection.png" alt="t-SNE投影">

        <h3>時系列分布</h3>
        <img src="temporal_clusters.png" alt="時系列分布">

        <h3>クラスタ × チャネル</h3>
        <img src="cluster_heatmap.png" alt="ヒートマップ">

        <h3>クラスタタイムライン</h3>
        <img src="cluster_timeline.png" alt="タイムライン">

        <h3>距離分布</h3>
        <img src="distance_distributions.png" alt="距離分布">
    </div>

    <div class="section">
        <h2>4. クラスタ詳細</h2>
"""

    for cluster in cluster_info[:20]:  # 上位20クラスタ
        html_content += f"""
        <div class="cluster">
            <div class="cluster-header">
                <div class="cluster-title">📁 クラスタ {cluster['cluster_id']}</div>
                <div class="cluster-size">{cluster['size']}件</div>
            </div>

            <table>
                <tr>
                    <th>項目</th>
                    <th>値</th>
                </tr>
                <tr>
                    <td>チャネル数</td>
                    <td>{cluster['n_channels']}</td>
                </tr>
                <tr>
                    <td>期間</td>
                    <td>{cluster['time_span']['start']} 〜 {cluster['time_span']['end']}</td>
                </tr>
                <tr>
                    <td>継続時間</td>
                    <td>{cluster['time_span']['duration_hours']:.1f}時間</td>
                </tr>
                <tr>
                    <td>平均階層深さ</td>
                    <td>{cluster['avg_hierarchy_depth']:.2f}</td>
                </tr>
            </table>

            <h4>全チャネル</h4>
            <ul>
"""
        for channel in cluster['channels']:
            html_content += f"                <li>{channel}</li>\n"

        html_content += f"""
            </ul>

            <h4>全メッセージ（{len(cluster['messages'])}件）</h4>
            <table>
                <tr>
                    <th style="width: 10%;">メッセージID</th>
                    <th style="width: 15%;">チャネル</th>
                    <th style="width: 12%;">時刻</th>
                    <th style="width: 63%;">内容</th>
                </tr>
"""
        for msg in cluster['messages']:
            # 長いメッセージは省略
            content_display = msg['content'][:300] + '...' if len(msg['content']) > 300 else msg['content']
            # HTMLエスケープ
            content_display = content_display.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
            html_content += f"""
                <tr>
                    <td style="font-size: 0.85em; font-family: monospace;">{msg['id']}</td>
                    <td style="font-size: 0.85em;">{msg['channel']}</td>
                    <td style="font-size: 0.85em;">{msg['time']}</td>
                    <td style="font-size: 0.85em;">{content_display}</td>
                </tr>
"""

        html_content += """
            </table>
        </div>
"""

    html_content += f"""
    </div>

    <div class="section">
        <h2>5. 生成日時</h2>
        <p>{datetime.now().strftime('%Y年%m月%d日 %H:%M:%S')}</p>
    </div>

</body>
</html>
"""

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html_content)


def main():
    """メイン処理"""
    print("=" * 60)
    print("メッセージクラスタ可視化")
    print("=" * 60)

    # クラスタリング結果を読み込み
    clustered_csv = OUTPUT_DIR / "clustered_messages.csv"
    if not clustered_csv.exists():
        print(f"エラー: クラスタリング結果が見つかりません: {clustered_csv}")
        print("先に message_clustering.py を実行してください。")
        return

    df = pd.read_csv(clustered_csv)
    df['start_time'] = pd.to_datetime(df['start_time'])
    print(f"✓ {len(df)}件のメッセージを読み込みました")

    # クラスタ分析
    print("\nクラスタ特性を分析中...")
    cluster_info = analyze_cluster_characteristics(df)
    print(f"  ✓ {len(cluster_info)}個のクラスタを分析")

    # 可視化
    print("\n追加の可視化を生成中...")
    plot_cluster_heatmap(df, OUTPUT_DIR / "cluster_heatmap.png")
    plot_cluster_timeline(df, OUTPUT_DIR / "cluster_timeline.png")
    print("  ✓ 可視化完了")

    # 距離分布の可視化（距離行列を再計算）
    # ※ 簡易版として、clustering結果から推定
    # 完全版では距離行列をキャッシュする必要がある

    # HTMLレポート生成
    print("\nHTMLレポートを生成中...")

    # メタデータを読み込み
    metadata_path = OUTPUT_DIR / "clustering_metadata.json"
    if metadata_path.exists():
        with open(metadata_path, 'r', encoding='utf-8') as f:
            metadata = json.load(f)
            metrics = metadata['metrics']
            config = metadata['config']
    else:
        # フォールバック（古いバージョンとの互換性）
        print("  ! メタデータファイルが見つかりません。デフォルト値を使用します。")
        metrics = {
            'silhouette_score': 0.0,
            'calinski_harabasz_score': 0.0,
            'davies_bouldin_score': 0.0
        }
        config = {
            'embedding_weight': 'N/A',
            'time_weight': 'N/A',
            'hierarchy_weight': 'N/A',
            'time_bandwidth_hours': 'N/A',
            'method': 'N/A',
            'min_cluster_size': 'N/A'
        }

    create_html_report(
        df, cluster_info, metrics, config,
        OUTPUT_DIR / "clustering_report.html"
    )
    print("  ✓ レポート生成完了")

    print("\n" + "=" * 60)
    print("✅ 可視化完了！")
    print("=" * 60)
    print(f"📁 出力ディレクトリ: {OUTPUT_DIR}")
    print(f"📄 レポート: {OUTPUT_DIR / 'clustering_report.html'}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
インテントクラスタの可視化とレポート生成

クラスタリング結果の詳細な分析とHTMLレポート生成
"""

import json
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
OUTPUT_DIR = Path("output/intent_clustering")
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

        # 全インテント情報を構築
        intents = []
        for _, row in cluster_df.iterrows():
            intents.append({
                'id': row['intent_id'],
                'path': row['full_path'],
                'time': row['start_time'].strftime('%Y-%m-%d %H:%M'),
                'intent': row['intent'],
                'status': row['status'],
                'objective_facts': row['objective_facts'],
                'context': row['context'],
                'original_cluster': row['original_cluster_id']
            })

        # ステータス分布
        status_counts = cluster_df['status'].value_counts().to_dict()

        # 統計情報
        info = {
            'cluster_id': int(cluster_id),
            'size': len(cluster_df),
            'paths': cluster_df['full_path'].unique().tolist(),
            'n_paths': cluster_df['full_path'].nunique(),
            'time_span': {
                'start': cluster_df['start_time'].min().strftime('%Y-%m-%d %H:%M'),
                'end': cluster_df['start_time'].max().strftime('%Y-%m-%d %H:%M'),
                'duration_hours': (cluster_df['start_time'].max() - cluster_df['start_time'].min()).total_seconds() / 3600
            },
            'avg_hierarchy_depth': float(cluster_df['hierarchy_depth'].mean()),
            'status_distribution': status_counts,
            'intents': intents  # 全インテント
        }

        cluster_info.append(info)

    # サイズでソート
    cluster_info.sort(key=lambda x: x['size'], reverse=True)

    return cluster_info


def plot_cluster_heatmap(df: pd.DataFrame, output_path: Path):
    """クラスタ × パス のヒートマップ"""
    # ノイズを除外
    df_filtered = df[df['cluster'] != -1].copy()

    if len(df_filtered) == 0:
        print("  ! 有効なクラスタが無いためヒートマップをスキップ")
        return

    # クラスタ × パス のクロス集計
    crosstab = pd.crosstab(df_filtered['cluster'], df_filtered['full_path'])

    # 上位パスのみ表示
    top_paths = crosstab.sum(axis=0).nlargest(15).index
    crosstab_top = crosstab[top_paths]

    # ヒートマップ
    fig, ax = plt.subplots(figsize=(14, 10))
    sns.heatmap(crosstab_top, cmap='YlOrRd', annot=True, fmt='d', cbar_kws={'label': 'インテント数'})
    ax.set_xlabel('パス')
    ax.set_ylabel('クラスタID')
    ax.set_title('クラスタ × パス分布（上位15パス）')
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


def plot_status_distribution(df: pd.DataFrame, output_path: Path):
    """ステータス別の分布"""
    status_counts = df['status'].value_counts()

    fig, ax = plt.subplots(figsize=(10, 6))
    status_counts.plot(kind='bar', ax=ax, color='skyblue', edgecolor='black')
    ax.set_xlabel('ステータス')
    ax.set_ylabel('インテント数')
    ax.set_title('ステータス別インテント分布')
    ax.grid(alpha=0.3, axis='y')

    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    plt.close()


def create_html_report(
    df: pd.DataFrame,
    cluster_info: List[Dict],
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
    <title>インテントクラスタリングレポート</title>
    <style>
        body {{
            font-family: 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', sans-serif;
            max-width: 1600px;
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
        h4 {{
            color: #777;
            margin-top: 15px;
            margin-bottom: 10px;
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
        .intent-card {{
            background-color: white;
            padding: 15px;
            margin: 10px 0;
            border-radius: 5px;
            border-left: 4px solid #4CAF50;
        }}
        .intent-header {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }}
        .intent-id {{
            font-family: monospace;
            font-size: 0.9em;
            color: #666;
        }}
        .intent-status {{
            background-color: #2196F3;
            color: white;
            padding: 3px 10px;
            border-radius: 12px;
            font-size: 0.85em;
        }}
        .intent-text {{
            font-size: 1.05em;
            line-height: 1.6;
            color: #333;
            margin: 10px 0;
            padding: 10px;
            background-color: #f8f8f8;
            border-radius: 3px;
        }}
        .intent-metadata {{
            font-size: 0.9em;
            color: #666;
            margin-top: 10px;
        }}
        .metadata-label {{
            font-weight: bold;
            color: #555;
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
        .status-badge {{
            display: inline-block;
            padding: 3px 8px;
            border-radius: 3px;
            font-size: 0.85em;
            font-weight: bold;
        }}
        .status-idea {{ background-color: #FFE082; color: #333; }}
        .status-in_progress {{ background-color: #81C784; color: white; }}
        .status-blocked {{ background-color: #E57373; color: white; }}
        .status-done {{ background-color: #90CAF9; color: white; }}
    </style>
</head>
<body>
    <h1>💡 インテントクラスタリングレポート</h1>

    <div class="section">
        <h2>1. クラスタリング概要</h2>
        <div class="stats">
            <div class="stat-box">
                <div class="stat-label">総インテント数</div>
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
                <div class="stat-label">平均クラスタサイズ</div>
                <div class="stat-value">{len(df) / max(n_clusters, 1):.1f}</div>
            </div>
        </div>

        <h3>ステータス別集計</h3>
        <table>
            <tr>
                <th>ステータス</th>
                <th>件数</th>
                <th>割合</th>
            </tr>
"""

    status_counts = df['status'].value_counts()
    for status, count in status_counts.items():
        percentage = (count / len(df)) * 100
        html_content += f"""
            <tr>
                <td><span class="status-badge status-{status}">{status}</span></td>
                <td>{count}</td>
                <td>{percentage:.1f}%</td>
            </tr>
"""

    html_content += """
        </table>
    </div>

    <div class="section">
        <h2>2. クラスタリング設定</h2>
        <table class="config-table">
"""

    for key, value in config.items():
        html_content += f"""
            <tr>
                <td>{key}</td>
                <td>{value}</td>
            </tr>
"""

    html_content += """
        </table>
    </div>

    <div class="section">
        <h2>3. 可視化</h2>

        <h3>ステータス分布</h3>
        <img src="status_distribution.png" alt="ステータス分布">

        <h3>時系列分布</h3>
        <img src="cluster_timeline.png" alt="時系列分布">

        <h3>クラスタ × パス</h3>
        <img src="cluster_heatmap.png" alt="ヒートマップ">
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
                    <td>パス数</td>
                    <td>{cluster['n_paths']}</td>
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

            <h4>ステータス分布</h4>
            <ul>
"""
        for status, count in cluster['status_distribution'].items():
            html_content += f"                <li><span class=\"status-badge status-{status}\">{status}</span>: {count}件</li>\n"

        html_content += """
            </ul>

            <h4>全パス</h4>
            <ul>
"""
        for path in cluster['paths']:
            html_content += f"                <li>{path}</li>\n"

        html_content += f"""
            </ul>

            <h4>全インテント（{len(cluster['intents'])}件）</h4>
"""

        for intent in cluster['intents']:
            # HTMLエスケープ
            def escape_html(text):
                if pd.isna(text):
                    return ''
                return str(text).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

            html_content += f"""
            <div class="intent-card">
                <div class="intent-header">
                    <span class="intent-id">{intent['id']} (元クラスタ: {intent['original_cluster']})</span>
                    <span class="intent-status status-{intent['status']}">{intent['status']}</span>
                </div>
                <div class="intent-text">
                    {escape_html(intent['intent'])}
                </div>
                <div class="intent-metadata">
                    <p><span class="metadata-label">パス:</span> {intent['path']}</p>
                    <p><span class="metadata-label">時刻:</span> {intent['time']}</p>
                    <p><span class="metadata-label">客観的事実:</span> {escape_html(intent['objective_facts'])}</p>
                    <p><span class="metadata-label">文脈:</span> {escape_html(intent['context'])}</p>
                </div>
            </div>
"""

        html_content += """
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
    print("インテントクラスタ可視化")
    print("=" * 60)

    # クラスタリング結果を読み込み
    clustered_csv = OUTPUT_DIR / "clustered_intents.csv"
    if not clustered_csv.exists():
        print(f"エラー: クラスタリング結果が見つかりません: {clustered_csv}")
        print("先に intent_clustering.py を実行してください。")
        return

    df = pd.read_csv(clustered_csv)
    df['start_time'] = pd.to_datetime(df['start_time'])
    print(f"✓ {len(df)}件のインテントを読み込みました")

    # クラスタ分析
    print("\nクラスタ特性を分析中...")
    cluster_info = analyze_cluster_characteristics(df)
    print(f"  ✓ {len(cluster_info)}個のクラスタを分析")

    # 可視化
    print("\n可視化を生成中...")
    plot_cluster_heatmap(df, OUTPUT_DIR / "cluster_heatmap.png")
    plot_cluster_timeline(df, OUTPUT_DIR / "cluster_timeline.png")
    plot_status_distribution(df, OUTPUT_DIR / "status_distribution.png")
    print("  ✓ 可視化完了")

    # HTMLレポート生成
    print("\nHTMLレポートを生成中...")

    # 統計情報を読み込み
    stats_path = OUTPUT_DIR / "clustering_stats.json"
    if stats_path.exists():
        with open(stats_path, 'r', encoding='utf-8') as f:
            stats = json.load(f)
            config = stats.get('config', {})
    else:
        print("  ! 統計情報ファイルが見つかりません。デフォルト値を使用します。")
        config = {
            'method': 'N/A',
            'embedding_weight': 'N/A',
            'time_weight': 'N/A',
            'hierarchy_weight': 'N/A'
        }

    create_html_report(
        df, cluster_info, config,
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

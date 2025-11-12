#!/usr/bin/env python3
"""
インテントクラスタリング実行 + HTMLレポート自動表示

使用例:
  # デフォルト設定で実行
  python run_intent_clustering_with_report.py

  # k-means-constrainedで実行
  python run_intent_clustering_with_report.py --method kmeans_constrained --size-min 5 --size-max 20

  # 階層重視で実行
  python run_intent_clustering_with_report.py --embedding-weight 0.7 --time-weight 0.15 --hierarchy-weight 0.15
"""

import subprocess
import sys
from pathlib import Path
import argparse


def main():
    parser = argparse.ArgumentParser(description='インテントクラスタリング実行 + HTMLレポート自動表示')

    # 入力ディレクトリ
    parser.add_argument('--input-dir', type=str,
                       default='output/intent_extraction/processed',
                       help='インテント抽出結果のディレクトリ (default: output/intent_extraction/processed)')

    # 重み設定
    parser.add_argument('--embedding-weight', type=float, default=0.7, help='埋め込み重み (default: 0.7)')
    parser.add_argument('--time-weight', type=float, default=0.15, help='時間重み (default: 0.15)')
    parser.add_argument('--hierarchy-weight', type=float, default=0.15, help='階層重み (default: 0.15)')
    parser.add_argument('--time-bandwidth-hours', type=float, default=168.0, help='時間カーネル帯域幅（時間） (default: 168.0)')

    # クラスタリング手法
    parser.add_argument('--method', type=str, default='kmeans_constrained',
                       choices=['hdbscan', 'hierarchical', 'kmeans_constrained'],
                       help='クラスタリング手法 (default: kmeans_constrained)')

    # HDBSCANパラメータ
    parser.add_argument('--min-cluster-size', type=int, default=3, help='HDBSCANの最小クラスタサイズ (default: 3)')
    parser.add_argument('--min-samples', type=int, default=2, help='HDBSCANの最小サンプル数 (default: 2)')

    # 階層的クラスタリング/k-meansパラメータ
    parser.add_argument('--n-clusters', type=int, default=None, help='クラスタ数 (default: 自動計算)')
    parser.add_argument('--linkage', type=str, default='complete',
                       choices=['average', 'complete', 'single', 'ward'],
                       help='階層的クラスタリングの結合法 (default: complete)')

    # k-means-constrainedパラメータ
    parser.add_argument('--size-min', type=int, default=5, help='最小クラスタサイズ (default: 5)')
    parser.add_argument('--size-max', type=int, default=20, help='最大クラスタサイズ (default: 20)')
    parser.add_argument('--n-init', type=int, default=10, help='k-meansの初期化回数 (default: 10)')
    parser.add_argument('--max-iter', type=int, default=300, help='k-meansの最大反復回数 (default: 300)')

    # その他
    parser.add_argument('--no-open', action='store_true', help='HTMLレポートを自動で開かない')

    args = parser.parse_args()

    print("=" * 60)
    print("インテントクラスタリング実行 + HTMLレポート自動表示")
    print("=" * 60)
    print("\n設定:")
    print(f"  入力ディレクトリ: {args.input_dir}")
    print(f"  重み: embedding={args.embedding_weight}, time={args.time_weight}, hierarchy={args.hierarchy_weight}")
    print(f"  手法: {args.method}")
    if args.method == 'kmeans_constrained':
        print(f"  サイズ制約: min={args.size_min}, max={args.size_max}")
        if args.n_clusters:
            print(f"  クラスタ数: {args.n_clusters}")
        else:
            print("  クラスタ数: 自動計算")
    elif args.method == 'hierarchical':
        print(f"  結合法: {args.linkage}")
        print(f"  クラスタ数: {args.n_clusters if args.n_clusters else '自動計算'}")
    print()

    # intent_clustering.pyを実行
    cmd = [
        'uv', 'run', 'python', 'intent_clustering.py',
        '--input-dir', args.input_dir,
        '--embedding-weight', str(args.embedding_weight),
        '--time-weight', str(args.time_weight),
        '--hierarchy-weight', str(args.hierarchy_weight),
        '--time-bandwidth-hours', str(args.time_bandwidth_hours),
        '--method', args.method,
        '--min-cluster-size', str(args.min_cluster_size),
        '--min-samples', str(args.min_samples),
        '--linkage', args.linkage,
        '--size-min', str(args.size_min),
        '--size-max', str(args.size_max),
        '--n-init', str(args.n_init),
        '--max-iter', str(args.max_iter),
    ]

    if args.n_clusters:
        cmd.extend(['--n-clusters', str(args.n_clusters)])

    print("クラスタリング実行中...")
    result = subprocess.run(cmd, capture_output=False)

    if result.returncode != 0:
        print("\n❌ クラスタリング実行に失敗しました")
        sys.exit(1)

    # クラスタサイズ統計を表示
    print("\n" + "=" * 60)
    print("クラスタサイズ統計")
    print("=" * 60)

    cmd_stats = [
        'uv', 'run', 'python', '-c',
        "import pandas as pd; "
        "df = pd.read_csv('output/intent_clustering/clustered_intents.csv'); "
        "cluster_sizes = df['cluster'].value_counts().sort_index(); "
        "print('クラスタサイズ:', dict(cluster_sizes)); "
        "sizes = cluster_sizes.values; "
        f"in_range = sum((sizes >= {args.size_min}) & (sizes <= {args.size_max})); "
        f"print(f'{args.size_min}-{args.size_max}範囲内: {{in_range}}/{{len(sizes)}} ({{in_range/len(sizes)*100:.1f}}%)'); "
        "print(f'統計: mean={sizes.mean():.1f}, median={pd.Series(sizes).median():.1f}, min={sizes.min()}, max={sizes.max()}')"
    ]
    subprocess.run(cmd_stats)

    # HTMLレポート生成
    print("\n" + "=" * 60)
    print("HTMLレポート生成")
    print("=" * 60)

    cmd_html = [
        'uv', 'run', 'python', 'scripts/visualize_intent_clusters.py'
    ]
    subprocess.run(cmd_html, capture_output=False)

    # HTMLレポートを開く
    if not args.no_open:
        html_path = Path("output/intent_clustering/clustering_report.html")
        if html_path.exists():
            print("\n" + "=" * 60)
            print("HTMLレポートを開いています...")
            print("=" * 60)
            subprocess.run(['open', str(html_path)])
        else:
            print(f"\n⚠️  HTMLレポートが見つかりません: {html_path}")

    print("\n✅ 完了！")


if __name__ == "__main__":
    main()

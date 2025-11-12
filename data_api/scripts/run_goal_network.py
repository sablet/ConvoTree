#!/usr/bin/env python3
"""
ゴールネットワーク構築・可視化統合スクリプト

使用例:
  # デフォルト設定で実行
  python run_goal_network.py

  # クラスタリングをスキップして、既存結果からネットワーク構築
  python run_goal_network.py --skip-clustering

  # HTMLレポートを自動で開かない
  python run_goal_network.py --no-open
"""

import subprocess
import sys
from pathlib import Path
import argparse


def main():
    parser = argparse.ArgumentParser(description='ゴールネットワーク構築・可視化統合スクリプト')

    # クラスタリング設定
    parser.add_argument('--skip-clustering', action='store_true',
                       help='クラスタリングをスキップ（既存結果を使用）')
    parser.add_argument('--size-min', type=int, default=10,
                       help='最小クラスタサイズ (default: 10)')
    parser.add_argument('--size-max', type=int, default=50,
                       help='最大クラスタサイズ (default: 50)')
    parser.add_argument('--hierarchy-weight', type=float, default=0.1,
                       help='階層重み (default: 0.1)')
    parser.add_argument('--embedding-weight', type=float, default=0.9,
                       help='埋め込み重み (default: 0.9)')

    # その他
    parser.add_argument('--no-open', action='store_true',
                       help='HTMLレポートを自動で開かない')
    parser.add_argument('--cluster-id', type=int, action='append',
                       help='処理対象のクラスタID（複数指定可能、未指定の場合は全クラスタ）')

    args = parser.parse_args()

    print("=" * 60)
    print("ゴールネットワーク構築・可視化")
    print("=" * 60)

    # A: インテントクラスタリング実行
    if not args.skip_clustering:
        print("\n" + "=" * 60)
        print("Step A: インテントクラスタリング実行")
        print("=" * 60)
        print(f"  設定: size_min={args.size_min}, size_max={args.size_max}")
        print(f"        hierarchy={args.hierarchy_weight}, embedding={args.embedding_weight}")

        cmd_clustering = [
            'uv', 'run', 'python', 'scripts/run_intent_clustering_with_report.py',
            '--size-min', str(args.size_min),
            '--size-max', str(args.size_max),
            '--hierarchy-weight', str(args.hierarchy_weight),
            '--embedding-weight', str(args.embedding_weight),
            '--time-weight', '0.0',
            '--no-open'
        ]

        result = subprocess.run(cmd_clustering, capture_output=False)

        if result.returncode != 0:
            print("\n❌ クラスタリング実行に失敗しました")
            sys.exit(1)
    else:
        print("\n⏭️  クラスタリングをスキップ（既存結果を使用）")

    # B-D: ゴールネットワーク構築
    print("\n" + "=" * 60)
    print("Step B-D: ゴールネットワーク構築")
    print("=" * 60)

    cmd_build = [
        'uv', 'run', 'python', 'scripts/goal_network_builder.py'
    ]

    # クラスタIDオプションを追加
    if args.cluster_id:
        for cluster_id in args.cluster_id:
            cmd_build.extend(['--cluster-id', str(cluster_id)])

    result = subprocess.run(cmd_build, capture_output=False)

    if result.returncode != 0:
        print("\n❌ ネットワーク構築に失敗しました")
        sys.exit(1)

    # E: 可視化
    print("\n" + "=" * 60)
    print("Step E: 可視化")
    print("=" * 60)

    cmd_visualize = [
        'uv', 'run', 'python', 'scripts/visualize_goal_network.py'
    ]

    result = subprocess.run(cmd_visualize, capture_output=False)

    if result.returncode != 0:
        print("\n❌ 可視化に失敗しました")
        sys.exit(1)

    # HTMLレポートを開く
    if not args.no_open:
        html_path = Path("output/goal_network/network_report.html")
        if html_path.exists():
            print("\n" + "=" * 60)
            print("HTMLレポートを開いています...")
            print("=" * 60)
            subprocess.run(['open', str(html_path)])
        else:
            print(f"\n⚠️  HTMLレポートが見つかりません: {html_path}")

    print("\n" + "=" * 60)
    print("✅ 完了！")
    print("=" * 60)
    print("📁 出力ディレクトリ: output/goal_network")
    print("📄 レポート: output/goal_network/network_report.html")


if __name__ == "__main__":
    main()

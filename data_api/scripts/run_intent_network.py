#!/usr/bin/env python3
"""
インテントネットワーク構築 + HTML自動表示

使用例:
  # デフォルト設定で実行
  python run_intent_network.py

  # 類似度閾値を調整
  python run_intent_network.py --similarity-threshold 0.8

  # 最大エッジ数を調整
  python run_intent_network.py --max-edges-per-node 10
"""

import subprocess
import sys
from pathlib import Path
import argparse


def main():
    parser = argparse.ArgumentParser(description='インテントネットワーク構築 + HTML自動表示')

    # 入力ディレクトリ
    parser.add_argument('--input-dir', type=str,
                       default='output/intent_extraction/processed',
                       help='インテント抽出結果のディレクトリ (default: output/intent_extraction/processed)')

    # ネットワーク設定
    parser.add_argument('--similarity-threshold', type=float, default=0.7,
                       help='エッジを作成する最小類似度 (default: 0.7)')
    parser.add_argument('--max-edges-per-node', type=int, default=5,
                       help='各ノードから伸びる最大エッジ数 (default: 5)')

    # モデル設定
    parser.add_argument('--model', type=str,
                       default='sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2',
                       help='埋め込みモデル名')

    # その他
    parser.add_argument('--no-open', action='store_true', help='HTMLを自動で開かない')

    args = parser.parse_args()

    print("=" * 60)
    print("インテントネットワーク構築 + HTML自動表示")
    print("=" * 60)
    print(f"\n設定:")
    print(f"  入力ディレクトリ: {args.input_dir}")
    print(f"  類似度閾値: {args.similarity_threshold}")
    print(f"  最大エッジ数/ノード: {args.max_edges_per_node}")
    print(f"  モデル: {args.model}")
    print()

    # intent_network.pyを実行
    cmd = [
        'uv', 'run', 'python', 'intent_network.py',
        '--input-dir', args.input_dir,
        '--similarity-threshold', str(args.similarity_threshold),
        '--max-edges-per-node', str(args.max_edges_per_node),
        '--model', args.model,
    ]

    print("ネットワーク構築中...")
    result = subprocess.run(cmd, capture_output=False)

    if result.returncode != 0:
        print("\n❌ ネットワーク構築に失敗しました")
        sys.exit(1)

    # ネットワーク統計を表示
    print("\n" + "=" * 60)
    print("ネットワーク統計")
    print("=" * 60)

    cmd_stats = [
        'uv', 'run', 'python', '-c',
        "import json; "
        "stats = json.load(open('output/intent_network/network_stats.json')); "
        "print(f\"ノード数: {stats['n_nodes']}\"); "
        "print(f\"エッジ数: {stats['n_edges']}\"); "
        "print(f\"平均次数: {stats['avg_degree']:.2f}\"); "
        "print(f\"密度: {stats['density']:.4f}\"); "
        "print(f\"連結成分数: {stats['n_connected_components']}\"); "
        "print(f\"次数分布: min={stats['degree_distribution']['min']}, "
        "max={stats['degree_distribution']['max']}, "
        "mean={stats['degree_distribution']['mean']:.2f}, "
        "median={stats['degree_distribution']['median']:.2f}\"); "
        "print(f\"最大連結成分のサイズ: {stats['component_sizes']}\");"
    ]
    subprocess.run(cmd_stats)

    # HTMLを開く
    if not args.no_open:
        html_path = Path("output/intent_network/network.html")
        if html_path.exists():
            print("\n" + "=" * 60)
            print("HTMLネットワークを開いています...")
            print("=" * 60)
            subprocess.run(['open', str(html_path)])
        else:
            print(f"\n⚠️  HTMLが見つかりません: {html_path}")

    print("\n✅ 完了！")


if __name__ == "__main__":
    main()

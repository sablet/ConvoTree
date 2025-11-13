#!/usr/bin/env python3
"""
メッセージ意図分析パイプライン - メイン実行スクリプト

messages_with_hierarchy.csv から ultra_intent_goal_network.json までの
全パイプラインを順次実行します。

使用例:
  python main.py
  python main.py --save-prompts  # ゴールネットワークのプロンプト/レスポンスを保存
"""

import subprocess
import sys
from pathlib import Path
import argparse


def run_step(step_num, step_name, command, description):
    """パイプラインの1ステップを実行"""
    print("\n" + "=" * 60)
    print(f"ステップ {step_num}: {step_name}")
    print("=" * 60)
    print(f"実行: {description}")
    print(f"コマンド: {' '.join(command)}\n")

    try:
        subprocess.run(command, check=True, capture_output=False, text=True)
        print(f"\n✓ ステップ {step_num} 完了")
        return True
    except subprocess.CalledProcessError as e:
        print(f"\n❌ エラー: ステップ {step_num} が失敗しました")
        print(f"   終了コード: {e.returncode}")
        return False
    except FileNotFoundError:
        print(f"\n❌ エラー: コマンドが見つかりません: {command[0]}")
        print("   'uv' がインストールされていることを確認してください")
        return False


def verify_output(output_file, description):
    """出力ファイルの存在を確認"""
    if output_file.exists():
        print(f"✓ {description}: {output_file}")
        return True
    else:
        print(f"⚠️  警告: {description}が見つかりません: {output_file}")
        return False


def main():
    parser = argparse.ArgumentParser(description="メッセージ意図分析パイプライン全実行")
    parser.add_argument(
        "--save-prompts",
        action="store_true",
        help="ゴールネットワークのプロンプト/レスポンスを保存",
    )
    args = parser.parse_args()

    print("=" * 60)
    print("メッセージ意図分析パイプライン")
    print("=" * 60)
    print("messages_with_hierarchy.csv → ultra_intent_goal_network.json\n")

    # ステップ1: メッセージクラスタリング
    cmd1 = ["uv", "run", "python", "scripts/run_clustering_with_report.py"]

    if not run_step(
        1, "メッセージクラスタリング", cmd1, "意味的に類似したメッセージをグループ化"
    ):
        sys.exit(1)

    verify_output(
        Path("output/message_clustering/clustered_messages.csv"), "クラスタリング結果"
    )

    # ステップ2: 意図抽出と階層化
    cmd2 = [
        "uv",
        "run",
        "python",
        "scripts/generate_intent_extraction_prompts.py",
        "--gemini",
        "--aggregate",
        "--aggregate-all",
    ]

    if not run_step(
        2,
        "意図抽出と階層化",
        cmd2,
        "個別意図 → 上位意図 → 最上位意図（Ultra Intents）を抽出",
    ):
        sys.exit(1)

    verify_output(
        Path("output/intent_extraction/cross_cluster/ultra_intents_enriched.json"),
        "エンリッチ済み最上位意図",
    )

    # ステップ3: ゴールネットワーク構築
    cmd3 = ["uv", "run", "python", "scripts/goal_network_builder.py", "--mode", "ultra"]
    if args.save_prompts:
        cmd3.append("--save-prompts")

    if not run_step(
        3, "ゴールネットワーク構築", cmd3, "意図間の目的→手段リレーションを抽出"
    ):
        sys.exit(1)

    verify_output(
        Path("output/goal_network/ultra_intent_goal_network.json"), "ゴールネットワーク"
    )

    # 完了メッセージ
    print("\n" + "=" * 60)
    print("✅ 全パイプライン完了！")
    print("=" * 60)
    print("\n📁 主要な出力ファイル:")
    print("  1. output/message_clustering/clustered_messages.csv")
    print("  2. output/message_clustering/clustering_report.html")
    print("  3. output/intent_extraction/cross_cluster/ultra_intents_enriched.json")
    print("  4. output/goal_network/ultra_intent_goal_network.json")

    if args.save_prompts:
        print("  5. output/goal_network/ultra_prompts_responses/")


if __name__ == "__main__":
    main()

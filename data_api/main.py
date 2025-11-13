#!/usr/bin/env python3
"""
メッセージ意図分析パイプライン - メイン実行スクリプト

messages_with_hierarchy.csv から ultra_intent_goal_network.json までの
全パイプラインを実行します。

使用例:
  python main.py run_all --csv_path=data/messages.csv
  python main.py clustering --csv_path=data/messages.csv
  python main.py intent_extraction --gemini --aggregate --aggregate_all
  python main.py goal_network
"""

import sys
from pathlib import Path
import fire

# lib/pipelines をインポート可能にする
sys.path.insert(0, str(Path(__file__).parent))

from lib.pipelines.message_clustering import run_clustering_pipeline
from lib.pipelines.intent_extraction import run_intent_extraction_pipeline
from lib.pipelines.goal_network_builder import build_ultra_goal_network


class Pipeline:
    """メッセージ意図分析パイプライン"""

    def clustering(
        self,
        csv_path: str = "/Users/mikke/git_dir/chat-line/output/db-exports/2025-11-10T23-54-08/messages_with_hierarchy.csv",
        embedding_weight: float = 0.7,
        time_weight: float = 0.15,
        hierarchy_weight: float = 0.15,
        time_bandwidth_hours: float = 168.0,
        method: str = "kmeans_constrained",
        size_min: int = 10,
        size_max: int = 50,
    ):
        """
        ステップ1: メッセージクラスタリング

        Args:
            csv_path: 入力CSVファイルパス
            embedding_weight: 埋め込み重み
            time_weight: 時間重み
            hierarchy_weight: 階層重み
            time_bandwidth_hours: 時間カーネル帯域幅
            method: クラスタリング手法
            size_min: 最小クラスタサイズ
            size_max: 最大クラスタサイズ
        """
        run_clustering_pipeline(
            csv_path=csv_path,
            embedding_weight=embedding_weight,
            time_weight=time_weight,
            hierarchy_weight=hierarchy_weight,
            time_bandwidth_hours=time_bandwidth_hours,
            method=method,
            size_min=size_min,
            size_max=size_max,
        )

    def intent_extraction(
        self,
        gemini: bool = False,
        cluster: int = None,
        save_raw: bool = False,
        aggregate: bool = False,
        aggregate_all: bool = False,
        max_workers: int = 5,
    ):
        """
        ステップ2: 意図抽出と階層化

        Args:
            gemini: Gemini APIで意図抽出を実行
            cluster: 特定のクラスタIDのみ処理
            save_raw: 生レスポンスを保存
            aggregate: 上位意図を生成
            aggregate_all: 最上位意図を生成
            max_workers: 並列実行の最大ワーカー数
        """
        run_intent_extraction_pipeline(
            gemini=gemini,
            cluster=cluster,
            save_raw=save_raw,
            aggregate=aggregate,
            aggregate_all=aggregate_all,
            max_workers=max_workers,
        )

    def goal_network(
        self,
        input_path: str = "output/intent_extraction/cross_cluster/ultra_intents_enriched.json",
        ultra_id: int = None,
        save_prompts: bool = False,
    ):
        """
        ステップ3: ゴールネットワーク構築

        Args:
            input_path: ultra_intents_enriched.jsonのパス
            ultra_id: 処理対象のUltra Intent ID
            save_prompts: プロンプト/レスポンスを保存
        """
        build_ultra_goal_network(
            input_path=input_path,
            ultra_id=ultra_id,
            save_prompts=save_prompts,
        )

    def run_all(
        self,
        csv_path: str = "/Users/mikke/git_dir/chat-line/output/db-exports/2025-11-10T23-54-08/messages_with_hierarchy.csv",
        save_prompts: bool = False,
    ):
        """
        全パイプライン実行: clustering → intent_extraction → goal_network

        Args:
            csv_path: 入力CSVファイルパス
            save_prompts: ゴールネットワークのプロンプト/レスポンスを保存
        """
        print("=" * 60)
        print("メッセージ意図分析パイプライン")
        print("=" * 60)
        print(f"入力: {csv_path}\n")

        # ステップ1: メッセージクラスタリング
        print("\n" + "=" * 60)
        print("ステップ 1/3: メッセージクラスタリング")
        print("=" * 60)
        self.clustering(csv_path=csv_path)

        # 出力ファイルの確認
        cluster_output = Path("output/message_clustering/clustered_messages.csv")
        if not cluster_output.exists():
            print(f"\n❌ エラー: {cluster_output} が見つかりません")
            sys.exit(1)
        print(f"\n✓ クラスタリング結果: {cluster_output}")

        # ステップ2: 意図抽出と階層化
        print("\n" + "=" * 60)
        print("ステップ 2/3: 意図抽出と階層化")
        print("=" * 60)
        self.intent_extraction(
            gemini=True,
            aggregate=True,
            aggregate_all=True,
        )

        # 出力ファイルの確認
        ultra_intents_output = Path(
            "output/intent_extraction/cross_cluster/ultra_intents_enriched.json"
        )
        if not ultra_intents_output.exists():
            print(f"\n❌ エラー: {ultra_intents_output} が見つかりません")
            sys.exit(1)
        print(f"\n✓ エンリッチ済み最上位意図: {ultra_intents_output}")

        # ステップ3: ゴールネットワーク構築
        print("\n" + "=" * 60)
        print("ステップ 3/3: ゴールネットワーク構築")
        print("=" * 60)
        self.goal_network(save_prompts=save_prompts)

        # 出力ファイルの確認
        goal_network_output = Path("output/goal_network/ultra_intent_goal_network.json")
        if not goal_network_output.exists():
            print(f"\n❌ エラー: {goal_network_output} が見つかりません")
            sys.exit(1)

        # 完了メッセージ
        print("\n" + "=" * 60)
        print("✅ 全パイプライン完了！")
        print("=" * 60)
        print("\n📁 主要な出力ファイル:")
        print("  1. output/message_clustering/clustered_messages.csv")
        print("  2. output/message_clustering/clustering_report.html")
        print("  3. output/intent_extraction/cross_cluster/ultra_intents_enriched.json")
        print("  4. output/goal_network/ultra_intent_goal_network.json")

        if save_prompts:
            print("  5. output/goal_network/ultra_prompts_responses/")


if __name__ == "__main__":
    fire.Fire(Pipeline)

#!/usr/bin/env python3
"""
メッセージ意図分析パイプライン - メイン実行スクリプト

messages_with_hierarchy.csv から ultra_intent_goal_network.json までの
全パイプラインを実行します。

使用例:
  python main.py run_all --csv_path=data/messages.csv
  python main.py run_all_with_rag --csv_path=data/messages.csv
  python main.py clustering --csv_path=data/messages.csv
  python main.py intent_extraction --gemini --aggregate --aggregate_all
  python main.py goal_network
  python main.py rag_build
  python main.py rag_query --query="ここ1週間、開発ツールについて何をやっていたか"
  python main.py rag_query_debug --topic="開発ツール" --status="doing,done"
"""

import sys
from pathlib import Path
from typing import TypedDict, Unpack

import fire  # type: ignore[import-untyped]

# lib/pipelines をインポート可能にする
sys.path.insert(0, str(Path(__file__).parent))

from lib.pipelines.goal_network_builder import build_ultra_goal_network
from lib.pipelines.intent_extraction import run_intent_extraction_pipeline
from lib.pipelines.message_clustering import ClusteringConfig, run_clustering_pipeline


class ClusteringKwargs(TypedDict, total=False):
    """クラスタリングのオプション引数"""

    embedding_weight: float
    time_weight: float
    hierarchy_weight: float
    time_bandwidth_hours: float
    method: str
    min_cluster_size: int
    min_samples: int
    n_clusters: int | None
    linkage: str
    size_min: int
    size_max: int
    n_init: int
    max_iter: int


class Pipeline:
    """メッセージ意図分析パイプライン"""

    def rag_build(
        self,
        output: str = "output/rag_index/unified_intents.jsonl",
        chroma_db: str = "output/rag_index/chroma_db",
        build_chroma: bool = True,
    ):
        """
        RAGインデックス構築

        Args:
            output: 統合ドキュメント出力先
            chroma_db: Chroma DBパス
            build_chroma: Chromaインデックスを構築するか
        """
        from lib.pipelines.rag_index_builder import build_rag_index

        build_rag_index(
            output_path=output,
            chroma_db_path=chroma_db,
            build_chroma=build_chroma,
        )

    def rag_query(
        self,
        query: str,
        answer_with_llm: bool = True,
        save_output: bool = False,
    ):
        """
        RAG検索（自然言語クエリ）

        Args:
            query: 自然言語クエリ（例: 「ここ1週間、開発ツールについて何をやっていたか」）
            answer_with_llm: LLMで最終回答を生成するか
            save_output: 検索結果を保存するか
        """
        from lib.pipelines.rag_query_executor import execute_rag_query

        execute_rag_query(
            query=query,
            answer_with_llm=answer_with_llm,
            save_output=save_output,
        )

    def rag_query_debug(
        self,
        topic: str | None = None,
        start_date: str | None = None,
        end_date: str | None = None,
        status: str = "todo,idea",
        top_k: int = 15,
        subgraph_strategy: str = "balanced",
        answer_with_llm: bool = False,
        save_output: bool = False,
    ):
        """
        RAG検索（デバッグ用・パラメータ直接指定）

        Args:
            topic: トピック（semantic search）
            start_date: 開始日（YYYY-MM-DD）
            end_date: 終了日（YYYY-MM-DD）
            status: ステータスフィルタ（カンマ区切り、例: "todo,idea"）
            top_k: 取得件数
            subgraph_strategy: グラフ抽出戦略（balanced）
            answer_with_llm: LLMで最終回答を生成するか
            save_output: 検索結果を保存するか
        """
        from lib.pipelines.rag_query_executor import execute_rag_query_debug

        execute_rag_query_debug(
            topic=topic,
            start_date=start_date,
            end_date=end_date,
            status=status,
            top_k=top_k,
            subgraph_strategy=subgraph_strategy,
            answer_with_llm=answer_with_llm,
            save_output=save_output,
        )

    def clustering(
        self,
        csv_path: str = "/Users/mikke/git_dir/chat-line/output/db-exports/2025-11-10T23-54-08/messages_with_hierarchy.csv",
        **kwargs: Unpack[ClusteringKwargs],
    ):
        """
        ステップ1: メッセージクラスタリング

        Args:
            csv_path: 入力CSVファイルパス
            **kwargs: ClusteringConfigの追加パラメータ
                embedding_weight: 埋め込み重み (default: 0.7)
                time_weight: 時間重み (default: 0.15)
                hierarchy_weight: 階層重み (default: 0.15)
                time_bandwidth_hours: 時間カーネル帯域幅 (default: 168.0)
                method: クラスタリング手法 (default: "kmeans_constrained")
                size_min: 最小クラスタサイズ (default: 10)
                size_max: 最大クラスタサイズ (default: 50)
        """
        config = ClusteringConfig(csv_path=csv_path, **kwargs)
        run_clustering_pipeline(config)

    def intent_extraction(
        self,
        gemini: bool = False,
        cluster: int | None = None,
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
        ultra_id: int | None = None,
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

    def run_all_with_rag(
        self,
        csv_path: str = "/Users/mikke/git_dir/chat-line/output/db-exports/2025-11-10T23-54-08/messages_with_hierarchy.csv",
        save_prompts: bool = False,
    ):
        """
        全パイプライン + RAGインデックス構築
        clustering → intent_extraction → goal_network → rag_build

        Args:
            csv_path: 入力CSVファイルパス
            save_prompts: ゴールネットワークのプロンプト/レスポンスを保存
        """
        # 基本パイプライン実行
        self.run_all(csv_path=csv_path, save_prompts=save_prompts)

        # ステップ4: RAGインデックス構築
        print("\n" + "=" * 60)
        print("ステップ 4/4: RAGインデックス構築")
        print("=" * 60)
        self.rag_build()

        # 出力ファイルの確認
        unified_intents_output = Path("output/rag_index/unified_intents.jsonl")
        chroma_db_output = Path("output/rag_index/chroma_db")
        if not unified_intents_output.exists():
            print(f"\n❌ エラー: {unified_intents_output} が見つかりません")
            sys.exit(1)
        if not chroma_db_output.exists():
            print(f"\n❌ エラー: {chroma_db_output} が見つかりません")
            sys.exit(1)

        # 完了メッセージ
        print("\n" + "=" * 60)
        print("✅ 全パイプライン + RAG構築完了！")
        print("=" * 60)
        print("\n📁 主要な出力ファイル:")
        print("  1. output/message_clustering/clustered_messages.csv")
        print("  2. output/message_clustering/clustering_report.html")
        print("  3. output/intent_extraction/cross_cluster/ultra_intents_enriched.json")
        print("  4. output/goal_network/ultra_intent_goal_network.json")
        print("  5. output/rag_index/unified_intents.jsonl")
        print("  6. output/rag_index/chroma_db/")

        if save_prompts:
            print("  7. output/goal_network/ultra_prompts_responses/")

        print("\n💡 RAG検索を試すには:")
        print('  make rag-query QUERY="ここ1週間、何をやっていたか"')


if __name__ == "__main__":
    fire.Fire(Pipeline)

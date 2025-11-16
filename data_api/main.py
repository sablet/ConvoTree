#!/usr/bin/env python3
"""
メッセージ意図分析パイプライン - メイン実行スクリプト

個々のパイプライン処理を実行します。
パイプライン全体の実行は Makefile の all-build を使用してください。

使用例:
  # 個々のステップを実行
  python main.py clustering --csv_path=data/messages.csv
  python main.py intent_extraction --gemini --aggregate --aggregate_all
  python main.py goal_network
  python main.py goal_network_export
  python main.py rag_build
  python main.py rag_query --query="ここ1週間、開発ツールについて何をやっていたか"
  python main.py rag_query_debug --topic="開発ツール" --status="doing,done"

  # 複数ファイル（カンマ区切り）
  python main.py clustering --csv_path="data/msg1.csv,data/msg2.csv"

  # 全パイプライン実行（Makefile推奨）
  make all-build
"""

import sys
from pathlib import Path
from typing import TypedDict, Unpack

import fire  # type: ignore[import-untyped]

# lib/pipelines をインポート可能にする
sys.path.insert(0, str(Path(__file__).parent))

from lib.config import config
from lib.pipelines.goal_network_builder import build_ultra_goal_network
from lib.pipelines.goal_network_exporter import export_goal_network_to_markdown
from lib.pipelines.intent_extraction import run_intent_extraction_pipeline
from lib.pipelines.message_clustering import ClusteringConfig, run_clustering_pipeline


class ClusteringKwargs(TypedDict, total=False):
    """k-means-constrainedクラスタリングのオプション引数"""

    embedding_weight: float
    time_weight: float
    hierarchy_weight: float
    time_bandwidth_hours: float
    n_clusters: int | None
    size_min: int
    size_max: int
    n_init: int
    max_iter: int
    # 後方互換パラメータ
    min_cluster_size: int
    min_samples: int
    linkage: str


class Pipeline:
    """メッセージ意図分析パイプライン"""

    def rag_build(
        self,
        output: str | None = None,
        chroma_db: str | None = None,
        build_chroma: bool = True,
    ):
        """
        RAGインデックス構築

        Args:
            output: 統合ドキュメント出力先（Noneの場合は設定ファイルから読み込み）
            chroma_db: Chroma DBパス（Noneの場合は設定ファイルから読み込み）
            build_chroma: Chromaインデックスを構築するか
        """
        from lib.pipelines.rag_index_builder import build_rag_index

        build_rag_index(
            output_path=output or config.rag_unified_intents_path,
            chroma_db_path=chroma_db or config.rag_chroma_db_path,
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
        top_k: int | None = None,
        subgraph_strategy: str | None = None,
        **kwargs: bool,
    ):
        """
        RAG検索（デバッグ用・パラメータ直接指定）

        Args:
            topic: トピック（semantic search）
            start_date: 開始日（YYYY-MM-DD）
            end_date: 終了日（YYYY-MM-DD）
            status: ステータスフィルタ（カンマ区切り、例: "todo,idea"）
            top_k: 取得件数（Noneの場合は設定ファイルから読み込み）
            subgraph_strategy: グラフ抽出戦略（Noneの場合は設定ファイルから読み込み）
            **kwargs: answer_with_llm, save_output など
        """
        from lib.pipelines.rag_query_executor import execute_rag_query_debug
        from lib.rag_models import QueryDebugParams

        params = QueryDebugParams(
            topic=topic,
            start_date=start_date,
            end_date=end_date,
            status=status,
            top_k=top_k or config.rag_top_k,
            subgraph_strategy=subgraph_strategy or config.rag_subgraph_strategy,
            answer_with_llm=kwargs.get("answer_with_llm", False),
            save_output=kwargs.get("save_output", False),
        )
        execute_rag_query_debug(params)

    def clustering(
        self,
        csv_path: str | None = None,
        **kwargs: Unpack[ClusteringKwargs],
    ):
        """
        ステップ1: k-means-constrainedメッセージクラスタリング

        Args:
            csv_path: 入力CSVファイルパス（Noneの場合は設定ファイルから読み込み）
                     単一ファイルまたはカンマ区切りで複数ファイルを指定可能
            **kwargs: ClusteringConfigの追加パラメータ
                embedding_weight: 埋め込み重み (default: config.yaml or 0.7)
                time_weight: 時間重み (default: config.yaml or 0.15)
                hierarchy_weight: 階層重み (default: config.yaml or 0.15)
                time_bandwidth_hours: 時間カーネル帯域幅 (default: config.yaml or 168.0)
                size_min: 最小クラスタサイズ (default: config.yaml or 10)
                size_max: 最大クラスタサイズ (default: config.yaml or 50)
                n_clusters: クラスタ数 (default: 自動決定)
        """
        # CSVパスの処理
        if csv_path is not None:
            # コマンドライン引数の場合、カンマ区切りで複数ファイル対応
            csv_paths = [p.strip() for p in csv_path.split(",")]
        else:
            # 設定ファイルから読み込み（既にリスト形式）
            csv_paths = config.csv_path

        # config.yamlの値をデフォルトとして使用し、kwargsで上書き
        clustering_config = ClusteringConfig(
            csv_paths=csv_paths,
            embedding_weight=kwargs.get(
                "embedding_weight", config.clustering_embedding_weight
            ),
            time_weight=kwargs.get("time_weight", config.clustering_time_weight),
            hierarchy_weight=kwargs.get(
                "hierarchy_weight", config.clustering_hierarchy_weight
            ),
            time_bandwidth_hours=kwargs.get(
                "time_bandwidth_hours", config.clustering_time_bandwidth_hours
            ),
            size_min=kwargs.get("size_min", config.clustering_size_min),
            size_max=kwargs.get("size_max", config.clustering_size_max),
            n_clusters=kwargs.get("n_clusters", config.clustering_n_clusters),
            n_init=kwargs.get("n_init", config.clustering_n_init),
            max_iter=kwargs.get("max_iter", config.clustering_max_iter),
            # 後方互換パラメータ
            min_cluster_size=kwargs.get(
                "min_cluster_size", config.clustering_min_cluster_size
            ),
            min_samples=kwargs.get("min_samples", config.clustering_min_samples),
            linkage=kwargs.get("linkage", config.clustering_linkage),
        )
        run_clustering_pipeline(clustering_config)

    def intent_extraction(
        self,
        gemini: bool = False,
        cluster: int | None = None,
        save_raw: bool = False,
        aggregate: bool = False,
        aggregate_all: bool = False,
        max_workers: int | None = None,
    ):
        """
        ステップ2: 意図抽出と階層化

        Args:
            gemini: Gemini APIで意図抽出を実行
            cluster: 特定のクラスタIDのみ処理
            save_raw: 生レスポンスを保存
            aggregate: 上位意図を生成
            aggregate_all: 最上位意図を生成
            max_workers: 並列実行の最大ワーカー数（Noneの場合は設定ファイルから読み込み）
        """
        run_intent_extraction_pipeline(
            gemini=gemini,
            cluster=cluster,
            save_raw=save_raw,
            aggregate=aggregate,
            aggregate_all=aggregate_all,
            max_workers=max_workers or config.intent_extraction_max_workers,
        )

    def goal_network(
        self,
        input_path: str | None = None,
        ultra_id: int | None = None,
        save_prompts: bool = False,
    ):
        """
        ステップ3: ゴールネットワーク構築

        Args:
            input_path: ultra_intents_enriched.jsonのパス（Noneの場合は設定ファイルから読み込み）
            ultra_id: 処理対象のUltra Intent ID
            save_prompts: プロンプト/レスポンスを保存
        """
        build_ultra_goal_network(
            input_path=input_path or config.goal_network_input_path,
            ultra_id=ultra_id,
            save_prompts=save_prompts,
        )

    def goal_network_export(
        self,
        input_path: str | None = None,
        output_path: str | None = None,
    ):
        """
        ゴールネットワークをMarkdownリスト形式でエクスポート

        Args:
            input_path: ultra_intent_goal_network.jsonのパス
            output_path: 出力Markdownファイルパス
        """
        export_goal_network_to_markdown(
            input_path=input_path
            or "output/goal_network/ultra_intent_goal_network.json",
            output_path=output_path,
        )


if __name__ == "__main__":
    fire.Fire(Pipeline)

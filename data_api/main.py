#!/usr/bin/env python3
"""
メッセージGoal分析パイプライン - メイン実行スクリプト

個々のパイプライン処理を実行します。
パイプライン全体の実行は Makefile の all-build を使用してください。

使用例:
  # 個々のステップを実行
  python main.py clustering --csv_path=data/messages.csv
  python main.py goal_extraction --gemini
  python main.py goal_relation_extraction

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
from lib.pipelines.goal_extraction import run_goal_extraction_pipeline
from lib.pipelines.goal_relation_extraction import run_goal_relation_extraction_pipeline
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
    """メッセージGoal分析パイプライン"""

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


    def goal_extraction(
        self,
        gemini: bool = False,
        cluster: int | None = None,
        save_raw: bool = False,
        max_workers: int | None = None,
    ):
        """
        ステップ2: Goal抽出（GoalItemスキーマ）

        Args:
            gemini: Gemini APIでGoal抽出を実行
            cluster: 特定のクラスタIDのみ処理
            save_raw: 生レスポンスを保存
            max_workers: 並列実行の最大ワーカー数（Noneの場合は設定ファイルから読み込み）
        """
        run_goal_extraction_pipeline(
            gemini=gemini,
            cluster=cluster,
            save_raw=save_raw,
            max_workers=max_workers or config.intent_extraction_max_workers,
        )

    def goal_relation_extraction(self):
        """
        ステップ3: Goal間のリレーション抽出

        クラスタごとに抽出されたGoalオブジェクト間のリレーションを判定し、
        孤立ノードの分析を行う。

        リレーションタイプ:
        - hierarchy: 階層関係（Parent-Child / 抽象-具体）
        - means_end: 手段-目的関係（Means-End）
        - dependency: 依存関係（Dependency / Prerequisite）
        - causal: 因果関係（Causal）
        """
        run_goal_relation_extraction_pipeline()


if __name__ == "__main__":
    fire.Fire(Pipeline)

"""
設定ファイル読み込みモジュール

config.yaml.example をデフォルト設定として読み込み、
config.yaml が存在すればそれで上書きします。
"""

from pathlib import Path
from typing import Any

import yaml


class Config:
    """設定クラス"""

    def __init__(
        self,
        config_path: str = "config.yaml",
        example_path: str = "config.yaml.example",
    ):
        """
        設定ファイルを読み込む

        Args:
            config_path: 設定ファイルのパス（デフォルト: config.yaml）
            example_path: サンプル設定ファイルのパス（デフォルト: config.yaml.example）
        """
        self._config: dict[str, Any] = {}
        self._load_config(config_path, example_path)

    def _load_config(self, config_path: str, example_path: str) -> None:
        """
        YAMLファイルから設定を読み込む

        1. config.yaml.example をベース設定として読み込み
        2. config.yaml が存在すればそれで上書き

        Args:
            config_path: 設定ファイルのパス
            example_path: サンプル設定ファイルのパス
        """
        # 1. デフォルト設定を読み込み
        example_file = Path(example_path)
        if example_file.exists():
            with open(example_file, encoding="utf-8") as f:
                self._config = yaml.safe_load(f) or {}
            print(f"✓ デフォルト設定を読み込みました: {example_path}")
        else:
            print(f"⚠️  デフォルト設定ファイルが見つかりません: {example_path}")
            self._config = {}

        # 2. ユーザー設定で上書き
        config_file = Path(config_path)
        if config_file.exists():
            with open(config_file, encoding="utf-8") as f:
                user_config = yaml.safe_load(f) or {}
            self._merge_config(user_config)
            print(f"✓ ユーザー設定で上書きしました: {config_path}")
        else:
            print(
                f"ℹ️  ユーザー設定ファイルが見つかりません: {config_path}\n"
                f"   {example_path} のデフォルト値を使用します。"
            )

    def _merge_config(self, user_config: dict[str, Any]) -> None:
        """
        ユーザー設定をデフォルト設定にマージ（深い階層まで対応）

        Args:
            user_config: ユーザー設定の辞書
        """

        def deep_merge(base: dict[str, Any], override: dict[str, Any]) -> None:
            """再帰的に辞書をマージ"""
            for key, value in override.items():
                if (
                    key in base
                    and isinstance(base[key], dict)
                    and isinstance(value, dict)
                ):
                    deep_merge(base[key], value)
                else:
                    base[key] = value

        deep_merge(self._config, user_config)

    def get(self, key_path: str, default: Any = None) -> Any:  # noqa: ANN401
        """
        ネストされたキーを取得（ドット記法対応）

        Args:
            key_path: キーパス（例: "input.csv_path"）
            default: デフォルト値（通常は使用しない）

        Returns:
            設定値またはデフォルト値
        """
        keys = key_path.split(".")
        value = self._config

        for key in keys:
            if isinstance(value, dict) and key in value:
                value = value[key]
            else:
                return default

        return value

    # === 入力パス ===
    @property
    def csv_path(self) -> str:
        """入力CSVファイルのパス"""
        return self.get("input.csv_path")

    # === 出力パス ===
    @property
    def output_base_dir(self) -> str:
        """出力ベースディレクトリ"""
        return self.get("output.base_dir")

    @property
    def clustering_dir(self) -> str:
        """クラスタリング結果ディレクトリ"""
        return self.get("output.clustering_dir")

    @property
    def intent_extraction_dir(self) -> str:
        """意図抽出結果ディレクトリ"""
        return self.get("output.intent_extraction_dir")

    @property
    def goal_network_dir(self) -> str:
        """ゴールネットワークディレクトリ"""
        return self.get("output.goal_network_dir")

    @property
    def rag_index_dir(self) -> str:
        """RAGインデックスディレクトリ"""
        return self.get("output.rag_index_dir")

    # === クラスタリングパラメータ ===
    @property
    def clustering_embedding_weight(self) -> float:
        """埋め込みベクトルの重み"""
        return self.get("clustering.embedding_weight")

    @property
    def clustering_time_weight(self) -> float:
        """時間の重み"""
        return self.get("clustering.time_weight")

    @property
    def clustering_hierarchy_weight(self) -> float:
        """階層の重み"""
        return self.get("clustering.hierarchy_weight")

    @property
    def clustering_time_bandwidth_hours(self) -> float:
        """時間カーネル帯域幅（時間）"""
        return self.get("clustering.time_bandwidth_hours")

    @property
    def clustering_method(self) -> str:
        """クラスタリング手法"""
        return self.get("clustering.method")

    @property
    def clustering_size_min(self) -> int:
        """最小クラスタサイズ"""
        return self.get("clustering.size_min")

    @property
    def clustering_size_max(self) -> int:
        """最大クラスタサイズ"""
        return self.get("clustering.size_max")

    @property
    def clustering_n_clusters(self) -> int | None:
        """K-meansのクラスタ数"""
        return self.get("clustering.n_clusters")

    @property
    def clustering_min_cluster_size(self) -> int:
        """HDBSCANの最小クラスタサイズ"""
        return self.get("clustering.min_cluster_size")

    @property
    def clustering_min_samples(self) -> int:
        """HDBSCANの最小サンプル数"""
        return self.get("clustering.min_samples")

    @property
    def clustering_linkage(self) -> str:
        """Agglomerativeのリンケージ方法"""
        return self.get("clustering.linkage")

    @property
    def clustering_n_init(self) -> int:
        """K-meansの初期化回数"""
        return self.get("clustering.n_init")

    @property
    def clustering_max_iter(self) -> int:
        """K-meansの最大反復回数"""
        return self.get("clustering.max_iter")

    # === 意図抽出パラメータ ===
    @property
    def intent_extraction_max_workers(self) -> int:
        """並列処理の最大ワーカー数"""
        return self.get("intent_extraction.max_workers")

    # === ゴールネットワークパラメータ ===
    @property
    def goal_network_input_path(self) -> str:
        """ultra_intents_enriched.jsonのパス"""
        return self.get("goal_network.input_path")

    # === RAGパラメータ ===
    @property
    def rag_unified_intents_path(self) -> str:
        """統合ドキュメント出力先"""
        return self.get("rag.unified_intents_path")

    @property
    def rag_chroma_db_path(self) -> str:
        """Chroma DBパス"""
        return self.get("rag.chroma_db_path")

    @property
    def rag_top_k(self) -> int:
        """検索時の取得件数"""
        return self.get("rag.top_k")

    @property
    def rag_subgraph_strategy(self) -> str:
        """グラフ抽出戦略"""
        return self.get("rag.subgraph_strategy")


# グローバル設定インスタンス
config = Config()

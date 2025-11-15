"""
設定ファイル読み込みモジュール

config.yaml.example をデフォルト設定として読み込み、
config.yaml が存在すればそれで上書きします。
"""

from pathlib import Path
from typing import TypeVar, overload

import yaml

T = TypeVar("T")


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
        self._config: dict[str, str | int | float | bool | dict | list] = {}
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

    def _merge_config(
        self, user_config: dict[str, str | int | float | bool | dict | list]
    ) -> None:
        """
        ユーザー設定をデフォルト設定にマージ（深い階層まで対応）

        Args:
            user_config: ユーザー設定の辞書
        """

        def deep_merge(
            base: dict[str, str | int | float | bool | dict | list],
            override: dict[str, str | int | float | bool | dict | list],
        ) -> None:
            """再帰的に辞書をマージ"""
            for key, value in override.items():
                if (
                    key in base
                    and isinstance(base[key], dict)
                    and isinstance(value, dict)
                ):
                    assert isinstance(base[key], dict)
                    deep_merge(base[key], value)  # type: ignore[arg-type]
                else:
                    base[key] = value

        deep_merge(self._config, user_config)

    @overload
    def get(self, key_path: str) -> str | int | float | bool | dict | list | None: ...

    @overload
    def get(
        self, key_path: str, default: T
    ) -> str | int | float | bool | dict | list | T: ...

    def get(
        self, key_path: str, default: T | None = None
    ) -> str | int | float | bool | dict | list | T | None:
        """
        ネストされたキーを取得（ドット記法対応）

        Args:
            key_path: キーパス（例: "input.csv_path"）
            default: デフォルト値（通常は使用しない）

        Returns:
            設定値またはデフォルト値
        """
        keys = key_path.split(".")
        value: str | int | float | bool | dict | list = self._config

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
        value = self.get("input.csv_path")
        assert isinstance(value, str)
        return value

    # === 出力パス ===
    @property
    def output_base_dir(self) -> str:
        """出力ベースディレクトリ"""
        value = self.get("output.base_dir")
        assert isinstance(value, str)
        return value

    @property
    def clustering_dir(self) -> str:
        """クラスタリング結果ディレクトリ"""
        value = self.get("output.clustering_dir")
        assert isinstance(value, str)
        return value

    @property
    def intent_extraction_dir(self) -> str:
        """意図抽出結果ディレクトリ"""
        value = self.get("output.intent_extraction_dir")
        assert isinstance(value, str)
        return value

    @property
    def goal_network_dir(self) -> str:
        """ゴールネットワークディレクトリ"""
        value = self.get("output.goal_network_dir")
        assert isinstance(value, str)
        return value

    @property
    def rag_index_dir(self) -> str:
        """RAGインデックスディレクトリ"""
        value = self.get("output.rag_index_dir")
        assert isinstance(value, str)
        return value

    # === クラスタリングパラメータ ===
    @property
    def clustering_embedding_weight(self) -> float:
        """埋め込みベクトルの重み"""
        value = self.get("clustering.embedding_weight")
        assert isinstance(value, (int, float))
        return float(value)

    @property
    def clustering_time_weight(self) -> float:
        """時間の重み"""
        value = self.get("clustering.time_weight")
        assert isinstance(value, (int, float))
        return float(value)

    @property
    def clustering_hierarchy_weight(self) -> float:
        """階層の重み"""
        value = self.get("clustering.hierarchy_weight")
        assert isinstance(value, (int, float))
        return float(value)

    @property
    def clustering_time_bandwidth_hours(self) -> float:
        """時間カーネル帯域幅（時間）"""
        value = self.get("clustering.time_bandwidth_hours")
        assert isinstance(value, (int, float))
        return float(value)

    @property
    def clustering_size_min(self) -> int:
        """最小クラスタサイズ"""
        value = self.get("clustering.size_min")
        assert isinstance(value, int)
        return value

    @property
    def clustering_size_max(self) -> int:
        """最大クラスタサイズ"""
        value = self.get("clustering.size_max")
        assert isinstance(value, int)
        return value

    @property
    def clustering_n_clusters(self) -> int | None:
        """K-meansのクラスタ数"""
        value = self.get("clustering.n_clusters")
        if value is None:
            return None
        assert isinstance(value, int)
        return value

    @property
    def clustering_min_cluster_size(self) -> int:
        """HDBSCANの最小クラスタサイズ"""
        value = self.get("clustering.min_cluster_size")
        assert isinstance(value, int)
        return value

    @property
    def clustering_min_samples(self) -> int:
        """HDBSCANの最小サンプル数（後方互換）"""
        value = self.get("clustering.min_samples")
        assert isinstance(value, int)
        return value

    @property
    def clustering_linkage(self) -> str:
        """hierarchicalのリンケージ方法（後方互換）"""
        value = self.get("clustering.linkage", "average")
        assert isinstance(value, str)
        return value

    @property
    def clustering_n_init(self) -> int:
        """K-meansの初期化回数"""
        value = self.get("clustering.n_init")
        assert isinstance(value, int)
        return value

    @property
    def clustering_max_iter(self) -> int:
        """K-meansの最大反復回数"""
        value = self.get("clustering.max_iter")
        assert isinstance(value, int)
        return value

    # === 意図抽出パラメータ ===
    @property
    def intent_extraction_max_workers(self) -> int:
        """並列処理の最大ワーカー数"""
        value = self.get("intent_extraction.max_workers")
        assert isinstance(value, int)
        return value

    # === ゴールネットワークパラメータ ===
    @property
    def goal_network_input_path(self) -> str:
        """ultra_intents_enriched.jsonのパス"""
        value = self.get("goal_network.input_path")
        assert isinstance(value, str)
        return value

    # === RAGパラメータ ===
    @property
    def rag_unified_intents_path(self) -> str:
        """統合ドキュメント出力先"""
        value = self.get("rag.unified_intents_path")
        assert isinstance(value, str)
        return value

    @property
    def rag_chroma_db_path(self) -> str:
        """Chroma DBパス"""
        value = self.get("rag.chroma_db_path")
        assert isinstance(value, str)
        return value

    @property
    def rag_top_k(self) -> int:
        """検索時の取得件数"""
        value = self.get("rag.top_k")
        assert isinstance(value, int)
        return value

    @property
    def rag_subgraph_strategy(self) -> str:
        """グラフ抽出戦略"""
        value = self.get("rag.subgraph_strategy")
        assert isinstance(value, str)
        return value


# グローバル設定インスタンス
config = Config()

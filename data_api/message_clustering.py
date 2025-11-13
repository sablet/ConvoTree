#!/usr/bin/env python3
"""
メッセージクラスタリングシステム

埋め込みベースの意味的距離とメタデータ（チャネル階層・時間）を組み合わせた
ハイブリッドクラスタリング

主な機能:
1. 埋め込みベースの距離（意味的近さ）の計算
2. メタデータ（チャネル階層・時間）の数値化と距離化
3. 合成距離に基づくクラスタリング（階層的・HDBSCAN）
4. チューニング可能なパラメータと評価指標
"""

import json
import hashlib
import time
import numpy as np
import pandas as pd
from pathlib import Path
from typing import Dict, Tuple, Optional, List
from dataclasses import dataclass
import warnings
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer
from joblib import Memory

# クラスタリング関連
from sklearn.metrics.pairwise import cosine_similarity, euclidean_distances
from sklearn.cluster import AgglomerativeClustering
import hdbscan
from k_means_constrained import KMeansConstrained

# 可視化
import matplotlib.pyplot as plt
from sklearn.manifold import TSNE

# グラフ分析

# 日本語フォント設定
plt.rcParams['font.family'] = 'Hiragino Sans'
plt.rcParams['axes.unicode_minus'] = False

warnings.filterwarnings('ignore')

# 環境変数読み込み
load_dotenv()

# 出力ディレクトリ
OUTPUT_DIR = Path("output/message_clustering")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# キャッシュ設定（joblib.Memory使用）
CACHE_DIR = Path("output/cache/message_clustering_embeddings_ruri")
memory = Memory(location=str(CACHE_DIR), verbose=0)

# モデルインスタンス（遅延ロード）
_model_instance = None


def _get_model() -> SentenceTransformer:
    """
    SentenceTransformerモデルを取得（初回のみロード）

    Returns:
        SentenceTransformerモデルインスタンス
    """
    global _model_instance
    if _model_instance is None:
        print("  ruri-large-v2 モデルをロード中...")
        _model_instance = SentenceTransformer("cl-nagoya/ruri-large-v2")
        print("  ✓ モデルロード完了")
    return _model_instance


@memory.cache
def _compute_embeddings_cached(texts: List[str], cache_key: str) -> List[List[float]]:
    """
    埋め込みベクトルを計算（キャッシュ付き）

    Args:
        texts: テキストのリスト
        cache_key: キャッシュキー（SHA256ハッシュ）

    Returns:
        埋め込みベクトルのリスト
    """
    print("  埋め込みを生成中...")
    model = _get_model()
    batch_embeddings = model.encode(
        texts,
        convert_to_tensor=False,
        show_progress_bar=True,
        batch_size=32
    )
    return [embedding.tolist() for embedding in batch_embeddings]


@dataclass
class ClusteringConfig:
    """クラスタリング設定"""
    # 距離合成の重み（正規化後）
    embedding_weight: float = 0.75  # 埋め込み距離の重み
    time_weight: float = 0.1   # 時間距離の重み
    hierarchy_weight: float = 0.15  # 階層距離の重み

    # 時間カーネル設定
    time_bandwidth_hours: float = 168.0  # 1週間（時間単位）

    # クラスタリング手法
    method: str = "hdbscan"  # "hdbscan", "hierarchical", or "kmeans_constrained"

    # HDBSCANパラメータ
    min_cluster_size: int = 5
    min_samples: int = 3

    # 階層的クラスタリングパラメータ
    n_clusters: Optional[int] = None  # Noneの場合は自動決定
    linkage: str = "average"

    # k-means-constrainedパラメータ
    size_min: int = 10  # クラスタの最小サイズ
    size_max: int = 50  # クラスタの最大サイズ
    n_init: int = 10    # k-meansの初期化回数
    max_iter: int = 300 # k-meansの最大反復回数

    # ノイズ処理
    convert_noise_to_cluster: bool = True  # ノイズを「その他」クラスタとして扱う

    def validate(self):
        """設定の検証"""
        total_weight = self.embedding_weight + self.time_weight + self.hierarchy_weight
        if not np.isclose(total_weight, 1.0):
            raise ValueError(f"重みの合計が1.0でありません: {total_weight}")


class MessageData:
    """メッセージデータの管理"""

    def __init__(self, csv_path: str, embedding_path: Optional[str] = None, generate_embeddings: bool = True):
        """
        Args:
            csv_path: メッセージCSVのパス
            embedding_path: 埋め込みJSONのパス（Noneの場合は自動生成または埋め込み無し）
            generate_embeddings: 埋め込みを自動生成するか
        """
        self.csv_path = Path(csv_path)
        self.embedding_path = Path(embedding_path) if embedding_path else None
        self.generate_embeddings_flag = generate_embeddings

        # データ読み込み
        self.df = pd.read_csv(self.csv_path)
        self._preprocess_dataframe()

        # 埋め込み読み込みまたは生成
        self.embeddings = None
        self.embedding_dim = None
        if self.embedding_path and self.embedding_path.exists():
            self._load_embeddings()
        elif self.generate_embeddings_flag:
            self._generate_embeddings()

    def _preprocess_dataframe(self):
        """DataFrameの前処理"""
        # 時刻をdatetimeに変換
        self.df['start_time'] = pd.to_datetime(self.df['start_time'])
        self.df['end_time'] = pd.to_datetime(self.df['end_time'])

        # メッセージIDを生成（行番号ベース）
        self.df['message_id'] = [f"msg_{i:05d}" for i in range(len(self.df))]

        # パス処理: Inboxのみの場合はそのまま、Inbox->A->Bの場合はA->Bとして扱う
        def normalize_path(path: str) -> str:
            # ' -> ' で分割（実際の区切り文字）
            if ' -> ' not in path:
                # Inboxのみの場合はそのまま
                return path
            else:
                # Inbox -> A -> B の場合、Inboxを除去してA -> Bにする
                parts = path.split(' -> ')
                if len(parts) > 1 and parts[0] == 'Inbox':
                    return ' -> '.join(parts[1:])
                return path

        self.df['normalized_path'] = self.df['full_path'].apply(normalize_path)

        # 階層深さを計算（正規化パスの ' -> ' の出現回数）
        self.df['hierarchy_depth'] = self.df['normalized_path'].str.count(' -> ')

        print(f"✓ {len(self.df)}件のメッセージを読み込みました")
        print(f"  - 期間: {self.df['start_time'].min()} 〜 {self.df['start_time'].max()}")
        print(f"  - チャネル数: {self.df['full_path'].nunique()}")
        print(f"  - 正規化チャネル数: {self.df['normalized_path'].nunique()}")
        print(f"  - 最大階層深さ: {self.df['hierarchy_depth'].max()}")

    def _load_embeddings(self):
        """埋め込みデータの読み込み"""
        with open(self.embedding_path, 'r', encoding='utf-8') as f:
            embedding_data = json.load(f)

        # message_idとembeddingの対応を作成
        embedding_dict = {item['id']: item['embedding'] for item in embedding_data}

        # 埋め込み次元数を取得
        first_embedding = embedding_data[0]['embedding']
        embedding_dim = len(first_embedding)

        # DataFrameの順序に合わせて埋め込みを配置
        embeddings_list = []
        for msg_id in self.df['message_id']:
            if msg_id in embedding_dict:
                embeddings_list.append(embedding_dict[msg_id])
            else:
                # 埋め込みが無い場合はゼロベクトル
                embeddings_list.append([0.0] * embedding_dim)

        self.embeddings = np.array(embeddings_list)
        self.embedding_dim = self.embeddings.shape[1]

        print(f"✓ 埋め込みを読み込みました: {self.embeddings.shape}")

    def _generate_embeddings(self):
        """埋め込みベクトルを生成（ruri-large-v2モデル使用）"""
        print("\n埋め込みベクトルを生成中...")

        # テキストとインデックスを準備
        texts = []
        indices = []
        for idx, row in self.df.iterrows():
            text = row['combined_content']
            if not pd.isna(text) and str(text).strip() != "":
                texts.append(str(text))
                indices.append(idx)

        # 埋め込みリストを初期化（ゼロベクトルで埋める）
        embeddings_list = [[0.0] * 1024 for _ in range(len(self.df))]

        print(f"  総メッセージ数: {len(self.df)}")
        print(f"  処理対象: {len(texts)}件")

        # キャッシュキー生成（全テキストのハッシュ）
        cache_key = hashlib.sha256("\n".join(texts).encode('utf-8')).hexdigest()

        # 実行時間計測開始
        start_time = time.time()

        # キャッシュ付き埋め込み計算を実行
        batch_embeddings = _compute_embeddings_cached(texts, cache_key)

        # 実行時間計測終了
        elapsed_time = time.time() - start_time

        # 結果を対応するインデックスに格納
        for idx, embedding in zip(indices, batch_embeddings):
            embeddings_list[idx] = embedding

        self.embeddings = np.array(embeddings_list)
        self.embedding_dim = self.embeddings.shape[1]

        # キャッシュヒット/ミスの判定（高速ならキャッシュヒット）
        if elapsed_time < 1.0:
            print(f"  ✓ キャッシュから埋め込みを取得（実行時間: {elapsed_time:.3f}秒）")
        else:
            print(f"  ✓ 埋め込みを生成しました（実行時間: {elapsed_time:.2f}秒）")

        print(f"✓ 埋め込み完了: {self.embeddings.shape}")

        # オプション: JSON形式で保存
        self._save_embeddings()

    def _save_embeddings(self):
        """埋め込みをJSON形式で保存"""
        embeddings_data = []
        for i, msg_id in enumerate(self.df['message_id']):
            embeddings_data.append({
                'id': msg_id,
                'embedding': self.embeddings[i].tolist()
            })

        # 出力パス
        output_path = OUTPUT_DIR / "messages_embedded.json"
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(embeddings_data, f, ensure_ascii=False, indent=2)

        print(f"  → 埋め込みを保存: {output_path}")

    def has_embeddings(self) -> bool:
        """埋め込みデータが利用可能か"""
        return self.embeddings is not None


class DistanceCalculator:
    """距離計算"""

    @staticmethod
    def compute_embedding_distance(embeddings: np.ndarray) -> np.ndarray:
        """
        埋め込みベースの距離行列を計算

        Args:
            embeddings: 埋め込み行列 (n_samples, embedding_dim)

        Returns:
            距離行列 (n_samples, n_samples)
        """
        # コサイン類似度 → 距離に変換
        similarity = cosine_similarity(embeddings)
        # 距離 = 1 - 類似度（0〜2の範囲）
        distance = 1 - similarity
        np.fill_diagonal(distance, 0)  # 自己距離を0に
        return distance

    @staticmethod
    def compute_time_distance(df: pd.DataFrame, bandwidth_hours: float) -> np.ndarray:
        """
        時間距離行列を計算（ガウシアンカーネル）

        Args:
            df: メッセージDataFrame
            bandwidth_hours: 時間カーネルの帯域幅（時間単位）

        Returns:
            時間距離行列 (n_samples, n_samples)
        """
        # 時刻を数値化（Unix timestamp）
        timestamps = df['start_time'].astype(np.int64) / 1e9 / 3600  # 時間単位
        timestamps = timestamps.values.reshape(-1, 1)

        # ユークリッド距離を計算
        time_diff = euclidean_distances(timestamps, timestamps)

        # ガウシアンカーネルで距離化（0〜1の範囲に正規化）
        # 近い時刻ほど距離が小さくなる
        time_distance = 1 - np.exp(-(time_diff ** 2) / (2 * bandwidth_hours ** 2))
        np.fill_diagonal(time_distance, 0)

        return time_distance

    @staticmethod
    def compute_hierarchy_distance(df: pd.DataFrame) -> np.ndarray:
        """
        階層距離行列を計算（正規化パスを使用）

        Args:
            df: メッセージDataFrame

        Returns:
            階層距離行列 (n_samples, n_samples)
        """
        n = len(df)
        hierarchy_distance = np.zeros((n, n))

        # 正規化パスを使用
        paths = df['normalized_path'].values

        for i in range(n):
            for j in range(i + 1, n):
                # 共通パス長を計算（' -> ' で分割）
                path_i = paths[i].split(' -> ')
                path_j = paths[j].split(' -> ')

                common_depth = 0
                for pi, pj in zip(path_i, path_j):
                    if pi == pj:
                        common_depth += 1
                    else:
                        break

                # 距離 = 最大深さ - 共通深さ（正規化）
                max_depth = max(len(path_i), len(path_j))
                distance = (max_depth - common_depth) / max_depth if max_depth > 0 else 0

                hierarchy_distance[i, j] = distance
                hierarchy_distance[j, i] = distance

        return hierarchy_distance

    @staticmethod
    def combine_distances(
        embedding_dist: Optional[np.ndarray],
        time_dist: np.ndarray,
        hierarchy_dist: np.ndarray,
        config: ClusteringConfig
    ) -> np.ndarray:
        """
        複数の距離行列を正規化して重み付け合成

        各距離を最小値0にシフトしてから標準偏差で割ることで正規化。
        距離の性質（最小値0、非負性）を保持しつつ、標準偏差を統一。

        Args:
            embedding_dist: 埋め込み距離行列（Noneの場合は使用しない）
            time_dist: 時間距離行列
            hierarchy_dist: 階層距離行列
            config: クラスタリング設定

        Returns:
            合成距離行列
        """
        n = time_dist.shape[0]

        # 各距離行列を正規化（上三角のみ使用）
        triu_indices = np.triu_indices(n, k=1)

        # 時間距離の正規化（最小値0にシフト、標準偏差で割る）
        time_vals = time_dist[triu_indices]
        time_min = time_vals.min()
        time_shifted = time_vals - time_min
        time_std = time_shifted.std()
        if time_std > 0:
            time_normalized_vals = time_shifted / time_std
        else:
            time_normalized_vals = time_shifted
        time_normalized = np.zeros_like(time_dist)
        time_normalized[triu_indices] = time_normalized_vals
        time_normalized = time_normalized + time_normalized.T

        # 階層距離の正規化（最小値0にシフト、標準偏差で割る）
        hier_vals = hierarchy_dist[triu_indices]
        hier_min = hier_vals.min()
        hier_shifted = hier_vals - hier_min
        hier_std = hier_shifted.std()
        if hier_std > 0:
            hier_normalized_vals = hier_shifted / hier_std
        else:
            hier_normalized_vals = hier_shifted
        hier_normalized = np.zeros_like(hierarchy_dist)
        hier_normalized[triu_indices] = hier_normalized_vals
        hier_normalized = hier_normalized + hier_normalized.T

        if embedding_dist is None:
            # 埋め込みが無い場合は時間と階層のみ
            total_weight = config.time_weight + config.hierarchy_weight
            combined = (
                config.time_weight / total_weight * time_normalized +
                config.hierarchy_weight / total_weight * hier_normalized
            )
        else:
            # 埋め込み距離の正規化（最小値0にシフト、標準偏差で割る）
            embed_vals = embedding_dist[triu_indices]
            embed_min = embed_vals.min()
            embed_shifted = embed_vals - embed_min
            embed_std = embed_shifted.std()
            if embed_std > 0:
                embed_normalized_vals = embed_shifted / embed_std
            else:
                embed_normalized_vals = embed_shifted
            embed_normalized = np.zeros_like(embedding_dist)
            embed_normalized[triu_indices] = embed_normalized_vals
            embed_normalized = embed_normalized + embed_normalized.T

            # 全ての距離を合成
            combined = (
                config.embedding_weight * embed_normalized +
                config.time_weight * time_normalized +
                config.hierarchy_weight * hier_normalized
            )

        return combined


class ClusterAnalyzer:
    """クラスタリング実行と分析"""

    def __init__(self, data: MessageData, config: ClusteringConfig):
        self.data = data
        self.config = config

        # 距離行列を計算
        self._compute_distances()

    def _compute_distances(self):
        """各種距離行列を計算"""
        print("\n距離行列を計算中...")

        calculator = DistanceCalculator()

        # 埋め込み距離
        if self.data.has_embeddings():
            self.embedding_dist = calculator.compute_embedding_distance(self.data.embeddings)
            print(f"  ✓ 埋め込み距離: {self.embedding_dist.shape}")
        else:
            self.embedding_dist = None
            print("  ! 埋め込みデータが無いため、メタデータのみ使用")

        # 時間距離
        self.time_dist = calculator.compute_time_distance(
            self.data.df, self.config.time_bandwidth_hours
        )
        print(f"  ✓ 時間距離: {self.time_dist.shape}")

        # 階層距離
        self.hierarchy_dist = calculator.compute_hierarchy_distance(self.data.df)
        print(f"  ✓ 階層距離: {self.hierarchy_dist.shape}")

        # 合成距離
        self.combined_dist = calculator.combine_distances(
            self.embedding_dist, self.time_dist, self.hierarchy_dist, self.config
        )
        print(f"  ✓ 合成距離: {self.combined_dist.shape}")

    def cluster(self) -> np.ndarray:
        """
        クラスタリングを実行

        Returns:
            クラスタラベル（ノイズは「その他」クラスタとして扱う）
        """
        print(f"\nクラスタリング実行中（手法: {self.config.method}）...")

        if self.config.method == "hdbscan":
            clusterer = hdbscan.HDBSCAN(
                metric='precomputed',
                min_cluster_size=self.config.min_cluster_size,
                min_samples=self.config.min_samples,
                cluster_selection_method='eom'
            )
            labels = clusterer.fit_predict(self.combined_dist)

        elif self.config.method == "hierarchical":
            # クラスタ数の決定
            n_clusters = self.config.n_clusters
            if n_clusters is None:
                # デンドログラムから自動決定（仮実装: sqrt(n)）
                n_clusters = int(np.sqrt(len(self.data.df)))

            clusterer = AgglomerativeClustering(
                n_clusters=n_clusters,
                metric='precomputed',
                linkage=self.config.linkage
            )
            labels = clusterer.fit_predict(self.combined_dist)

        elif self.config.method == "kmeans_constrained":
            # クラスタ数の決定
            n_clusters = self.config.n_clusters
            if n_clusters is None:
                # デフォルト: データサイズ/平均クラスタサイズで自動決定
                avg_size = (self.config.size_min + self.config.size_max) / 2
                n_clusters = int(len(self.data.df) / avg_size)

            # k-means-constrainedは距離行列ではなく特徴ベクトルが必要
            # 距離行列から埋め込み空間を再構成（MDS的アプローチ）
            from sklearn.manifold import MDS
            # 次元数はクラスタ数の2倍程度（経験則）
            n_components = min(n_clusters * 2, len(self.data.df) - 1)
            mds = MDS(n_components=n_components, dissimilarity='precomputed', random_state=42)
            X_embedded = mds.fit_transform(self.combined_dist)

            clusterer = KMeansConstrained(
                n_clusters=n_clusters,
                size_min=self.config.size_min,
                size_max=self.config.size_max,
                n_init=self.config.n_init,
                max_iter=self.config.max_iter,
                random_state=42
            )
            labels = clusterer.fit_predict(X_embedded)

        else:
            raise ValueError(f"未対応のクラスタリング手法: {self.config.method}")

        # 統計情報
        n_clusters_orig = len(set(labels)) - (1 if -1 in labels else 0)
        n_noise = list(labels).count(-1)

        print(f"  ✓ クラスタ数: {n_clusters_orig}")
        print(f"  ✓ ノイズ: {n_noise}件")

        # ノイズを「その他」クラスタに変換
        if self.config.convert_noise_to_cluster and n_noise > 0:
            max_label = labels.max()
            others_label = max_label + 1
            labels = np.where(labels == -1, others_label, labels)
            print(f"  ✓ ノイズを「その他」クラスタ（ID={others_label}）に変換")

        return labels

    def evaluate_clustering(self, labels: np.ndarray) -> Dict:
        """
        クラスタリング結果の評価

        Args:
            labels: クラスタラベル

        Returns:
            評価指標の辞書
        """
        from sklearn.metrics import silhouette_score, calinski_harabasz_score, davies_bouldin_score

        # ノイズを除外
        mask = labels != -1
        if mask.sum() < 2:
            return {
                'silhouette_score': 0,
                'calinski_harabasz_score': 0,
                'davies_bouldin_score': 0,
                'n_clusters': 0,
                'n_noise': len(labels)
            }

        filtered_dist = self.combined_dist[mask][:, mask]
        filtered_labels = labels[mask]

        # 評価指標
        metrics = {}

        try:
            # シルエット係数（-1〜1、大きいほど良い）
            metrics['silhouette_score'] = silhouette_score(
                filtered_dist, filtered_labels, metric='precomputed'
            )
        except Exception:
            metrics['silhouette_score'] = 0

        # Calinski-HarabaszとDavies-Bouldinは特徴ベクトルが必要
        # 埋め込みがない場合はMDSで距離行列から座標を復元
        feature_matrix = None
        if self.data.has_embeddings():
            feature_matrix = self.data.embeddings[mask]
        else:
            try:
                from sklearn.manifold import MDS
                # 距離行列から2次元座標を復元
                mds = MDS(n_components=2, dissimilarity='precomputed', random_state=42)
                feature_matrix = mds.fit_transform(filtered_dist)
            except Exception:
                feature_matrix = None

        try:
            # Calinski-Harabasz指数（大きいほど良い）
            if feature_matrix is not None:
                metrics['calinski_harabasz_score'] = calinski_harabasz_score(
                    feature_matrix, filtered_labels
                )
            else:
                metrics['calinski_harabasz_score'] = 0
        except Exception:
            metrics['calinski_harabasz_score'] = 0

        try:
            # Davies-Bouldin指数（小さいほど良い）
            if feature_matrix is not None:
                metrics['davies_bouldin_score'] = davies_bouldin_score(
                    feature_matrix, filtered_labels
                )
            else:
                metrics['davies_bouldin_score'] = 0
        except Exception:
            metrics['davies_bouldin_score'] = 0

        # クラスタ統計
        metrics['n_clusters'] = len(set(filtered_labels))
        metrics['n_noise'] = list(labels).count(-1)

        return metrics


class ClusterVisualizer:
    """クラスタリング結果の可視化"""

    def __init__(self, data: MessageData, labels: np.ndarray):
        self.data = data
        self.labels = labels

    def plot_cluster_distribution(self, output_path: Path):
        """クラスタサイズ分布を可視化"""
        unique_labels = set(self.labels)
        cluster_sizes = [list(self.labels).count(label) for label in unique_labels if label != -1]

        fig, ax = plt.subplots(figsize=(10, 6))
        ax.bar(range(len(cluster_sizes)), sorted(cluster_sizes, reverse=True))
        ax.set_xlabel('クラスタID（サイズ順）')
        ax.set_ylabel('メッセージ数')
        ax.set_title(f'クラスタサイズ分布（合計{len(unique_labels) - (1 if -1 in unique_labels else 0)}クラスタ）')
        ax.grid(alpha=0.3)

        plt.tight_layout()
        plt.savefig(output_path, dpi=150, bbox_inches='tight')
        plt.close()

    def plot_tsne_projection(self, output_path: Path):
        """t-SNEによる2次元投影とクラスタ可視化"""
        if not self.data.has_embeddings():
            print("  ! 埋め込みが無いためt-SNE可視化をスキップ")
            return

        # t-SNE実行
        tsne = TSNE(n_components=2, random_state=42, perplexity=30)
        embeddings_2d = tsne.fit_transform(self.data.embeddings)

        # 可視化
        fig, ax = plt.subplots(figsize=(12, 10))

        unique_labels = set(self.labels)
        colors = plt.cm.tab20(np.linspace(0, 1, len(unique_labels)))

        for label, color in zip(unique_labels, colors):
            if label == -1:
                # ノイズは黒でプロット
                mask = self.labels == label
                ax.scatter(
                    embeddings_2d[mask, 0], embeddings_2d[mask, 1],
                    c='black', marker='x', s=50, alpha=0.5, label='Noise'
                )
            else:
                mask = self.labels == label
                ax.scatter(
                    embeddings_2d[mask, 0], embeddings_2d[mask, 1],
                    c=[color], s=100, alpha=0.6, label=f'Cluster {label}'
                )

        ax.set_xlabel('t-SNE Component 1')
        ax.set_ylabel('t-SNE Component 2')
        ax.set_title('メッセージクラスタの2次元投影（t-SNE）')
        ax.legend(bbox_to_anchor=(1.05, 1), loc='upper left', ncol=2)

        plt.tight_layout()
        plt.savefig(output_path, dpi=150, bbox_inches='tight')
        plt.close()

    def plot_temporal_clusters(self, output_path: Path):
        """時系列でのクラスタ分布を可視化"""
        df_with_labels = self.data.df.copy()
        df_with_labels['cluster'] = self.labels

        # ノイズを除外
        df_plot = df_with_labels[df_with_labels['cluster'] != -1].copy()

        if len(df_plot) == 0:
            print("  ! 有効なクラスタが無いため時系列可視化をスキップ")
            return

        # 日付ごとのクラスタカウント
        df_plot['date'] = df_plot['start_time'].dt.date
        cluster_counts = df_plot.groupby(['date', 'cluster']).size().unstack(fill_value=0)

        # プロット
        fig, ax = plt.subplots(figsize=(14, 6))
        cluster_counts.plot(kind='area', stacked=True, ax=ax, alpha=0.7)
        ax.set_xlabel('日付')
        ax.set_ylabel('メッセージ数')
        ax.set_title('時系列でのクラスタ分布')
        ax.legend(title='クラスタ', bbox_to_anchor=(1.05, 1), loc='upper left')
        ax.grid(alpha=0.3)

        plt.tight_layout()
        plt.savefig(output_path, dpi=150, bbox_inches='tight')
        plt.close()


def run_clustering_with_config(
    csv_path: str,
    embedding_path: Optional[str],
    config: ClusteringConfig,
    generate_embeddings: bool = True
) -> Tuple[MessageData, np.ndarray, Dict]:
    """
    設定に基づいてクラスタリングを実行

    Args:
        csv_path: メッセージCSVのパス
        embedding_path: 埋め込みJSONのパス（Noneの場合は自動生成）
        config: クラスタリング設定
        generate_embeddings: 埋め込みを自動生成するか

    Returns:
        (データ, ラベル, 評価指標)
    """
    # データ読み込み（埋め込み自動生成含む）
    data = MessageData(csv_path, embedding_path, generate_embeddings=generate_embeddings)

    # クラスタリング実行
    analyzer = ClusterAnalyzer(data, config)
    labels = analyzer.cluster()

    # 評価
    metrics = analyzer.evaluate_clustering(labels)

    return data, labels, metrics


def tune_parameters(
    csv_path: str,
    embedding_path: Optional[str],
    param_grid: Dict,
    generate_embeddings: bool = True
) -> Dict:
    """
    パラメータチューニング

    Args:
        csv_path: メッセージCSVのパス
        embedding_path: 埋め込みJSONのパス（Noneの場合は自動生成）
        param_grid: 探索するパラメータ範囲
        generate_embeddings: 埋め込みを自動生成するか

    Returns:
        最適パラメータと評価結果
    """
    results = []

    print("\n" + "=" * 60)
    print("パラメータチューニング開始")
    print("=" * 60)

    # パラメータの組み合わせを生成
    from itertools import product

    keys = param_grid.keys()
    values = param_grid.values()

    for i, combination in enumerate(product(*values)):
        params = dict(zip(keys, combination))

        print(f"\n[{i+1}] パラメータ: {params}")

        # 設定作成
        config = ClusteringConfig(**params)

        try:
            # クラスタリング実行
            data, labels, metrics = run_clustering_with_config(
                csv_path, embedding_path, config, generate_embeddings=generate_embeddings
            )

            result = {
                'params': params,
                'metrics': metrics,
                'labels': labels
            }
            results.append(result)

            print(f"  結果: {metrics}")

        except Exception as e:
            print(f"  エラー: {e}")
            continue

    # 最適パラメータを選定（シルエット係数を基準）
    best_result = max(results, key=lambda x: x['metrics']['silhouette_score'])

    print("\n" + "=" * 60)
    print("最適パラメータ")
    print("=" * 60)
    print(f"パラメータ: {best_result['params']}")
    print(f"評価指標: {best_result['metrics']}")

    return best_result


def main():
    """メイン処理"""
    import argparse

    parser = argparse.ArgumentParser(description='メッセージクラスタリングシステム')
    parser.add_argument('--embedding-weight', type=float, default=0.5, help='埋め込み重み (default: 0.5)')
    parser.add_argument('--time-weight', type=float, default=0.2, help='時間重み (default: 0.2)')
    parser.add_argument('--hierarchy-weight', type=float, default=0.3, help='階層重み (default: 0.3)')
    parser.add_argument('--time-bandwidth-hours', type=float, default=168.0, help='時間カーネル帯域幅（時間） (default: 168.0)')
    parser.add_argument('--method', type=str, default='hdbscan', choices=['hdbscan', 'hierarchical', 'kmeans_constrained'], help='クラスタリング手法 (default: hdbscan)')
    parser.add_argument('--min-cluster-size', type=int, default=5, help='HDBSCANの最小クラスタサイズ (default: 5)')
    parser.add_argument('--min-samples', type=int, default=3, help='HDBSCANの最小サンプル数 (default: 3)')
    parser.add_argument('--n-clusters', type=int, default=None, help='階層的/k-meansのクラスタ数 (default: sqrt(n))')
    parser.add_argument('--linkage', type=str, default='average', choices=['average', 'complete', 'single', 'ward'], help='階層的クラスタリングの結合法 (default: average)')
    parser.add_argument('--size-min', type=int, default=10, help='k-means-constrainedの最小クラスタサイズ (default: 10)')
    parser.add_argument('--size-max', type=int, default=50, help='k-means-constrainedの最大クラスタサイズ (default: 50)')
    parser.add_argument('--n-init', type=int, default=10, help='k-meansの初期化回数 (default: 10)')
    parser.add_argument('--max-iter', type=int, default=300, help='k-meansの最大反復回数 (default: 300)')
    args = parser.parse_args()

    print("=" * 60)
    print("メッセージクラスタリングシステム")
    print("=" * 60)

    # 入力ファイル
    csv_path = "/Users/mikke/git_dir/chat-line/output/db-exports/2025-11-10T23-54-08/messages_with_hierarchy.csv"
    embedding_path = None  # Noneの場合は自動生成

    # クラスタリング設定
    config = ClusteringConfig(
        embedding_weight=args.embedding_weight,
        time_weight=args.time_weight,
        hierarchy_weight=args.hierarchy_weight,
        time_bandwidth_hours=args.time_bandwidth_hours,
        method=args.method,
        min_cluster_size=args.min_cluster_size,
        min_samples=args.min_samples,
        n_clusters=args.n_clusters,
        linkage=args.linkage,
        size_min=args.size_min,
        size_max=args.size_max,
        n_init=args.n_init,
        max_iter=args.max_iter
    )

    # クラスタリング実行
    data, labels, metrics = run_clustering_with_config(
        csv_path, embedding_path, config, generate_embeddings=True
    )

    # 可視化
    print("\n可視化を生成中...")
    visualizer = ClusterVisualizer(data, labels)
    visualizer.plot_cluster_distribution(OUTPUT_DIR / "cluster_distribution.png")
    visualizer.plot_tsne_projection(OUTPUT_DIR / "tsne_projection.png")
    visualizer.plot_temporal_clusters(OUTPUT_DIR / "temporal_clusters.png")
    print("  ✓ 可視化完了")

    # 結果をDataFrameに保存
    df_result = data.df.copy()
    df_result['cluster'] = labels
    output_csv = OUTPUT_DIR / "clustered_messages.csv"
    df_result.to_csv(output_csv, index=False, encoding='utf-8')
    print(f"\n✓ クラスタリング結果を保存: {output_csv}")

    # メトリクスと設定を保存
    result_metadata = {
        'metrics': metrics,
        'config': {
            'embedding_weight': config.embedding_weight,
            'time_weight': config.time_weight,
            'hierarchy_weight': config.hierarchy_weight,
            'time_bandwidth_hours': config.time_bandwidth_hours,
            'method': config.method,
            'min_cluster_size': config.min_cluster_size,
            'min_samples': config.min_samples
        }
    }
    metadata_path = OUTPUT_DIR / "clustering_metadata.json"
    with open(metadata_path, 'w', encoding='utf-8') as f:
        json.dump(result_metadata, f, ensure_ascii=False, indent=2)
    print(f"✓ メトリクスと設定を保存: {metadata_path}")

    print("\n" + "=" * 60)
    print("✅ クラスタリング完了！")
    print("=" * 60)
    print(f"📁 出力ディレクトリ: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
インテントクラスタリングシステム

抽出されたインテントに対して、埋め込みベースの意味的距離とメタデータ（階層・時間）を組み合わせた
ハイブリッドクラスタリングを実行

主な機能:
1. 複数のcluster_XX_processed.jsonファイルからインテントを読み込み
2. インテントテキストの埋め込みベースの距離（意味的近さ）の計算
3. メタデータ（階層・時間）の数値化と距離化
4. 合成距離に基づくクラスタリング（階層的・HDBSCAN・k-means-constrained）
5. チューニング可能なパラメータと評価指標
"""

import json
import os
import hashlib
import numpy as np
import pandas as pd
from pathlib import Path
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass
from datetime import datetime
import warnings
from dotenv import load_dotenv
from tqdm import tqdm
from sentence_transformers import SentenceTransformer

# クラスタリング関連
from sklearn.metrics.pairwise import cosine_similarity, euclidean_distances
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import AgglomerativeClustering
import hdbscan
from k_means_constrained import KMeansConstrained

# キャッシュ
from app.cache import get_cache

# 可視化
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.manifold import TSNE
from sklearn.decomposition import PCA

# 日本語フォント設定
plt.rcParams['font.family'] = 'Hiragino Sans'
plt.rcParams['axes.unicode_minus'] = False

warnings.filterwarnings('ignore')

# 環境変数読み込み
load_dotenv()

# 出力ディレクトリ
OUTPUT_DIR = Path("output/intent_clustering")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


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
    min_cluster_size: int = 3
    min_samples: int = 2

    # 階層的クラスタリングパラメータ
    n_clusters: Optional[int] = None  # Noneの場合は自動決定
    linkage: str = "average"

    # k-means-constrainedパラメータ
    size_min: int = 5  # クラスタの最小サイズ
    size_max: int = 20  # クラスタの最大サイズ
    n_init: int = 10    # k-meansの初期化回数
    max_iter: int = 300 # k-meansの最大反復回数

    # ノイズ処理
    convert_noise_to_cluster: bool = True  # ノイズを「その他」クラスタとして扱う

    def validate(self):
        """設定の検証"""
        total_weight = self.embedding_weight + self.time_weight + self.hierarchy_weight
        if not np.isclose(total_weight, 1.0):
            raise ValueError(f"重みの合計が1.0でありません: {total_weight}")


class IntentData:
    """インテントデータの管理"""

    def __init__(
        self,
        input_dir: Path,
        config: ClusteringConfig,
        model_name: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
        generate_embeddings: bool = True
    ):
        self.input_dir = Path(input_dir)
        self.config = config
        self.model_name = model_name
        self.generate_embeddings_flag = generate_embeddings

        # データ読み込み
        self.df = self._load_all_intents()
        self._preprocess_dataframe()

        # 埋め込み生成
        self.embeddings = None
        self.embedding_dim = None
        if self.generate_embeddings_flag:
            self._generate_embeddings()

    def _load_all_intents(self) -> pd.DataFrame:
        """全てのインテントJSONファイルを読み込み"""
        all_intents = []
        json_files = sorted(self.input_dir.glob("cluster_*_processed.json"))

        print(f"📂 {len(json_files)}個のインテントファイルを読み込み中...")

        for json_file in json_files:
            with open(json_file, 'r', encoding='utf-8') as f:
                intents = json.load(f)

            for intent_data in intents:
                # 必要なフィールドを抽出（欠けているフィールドはデフォルト値を使用）
                record = {
                    'intent': intent_data.get('intent', ''),
                    'status': intent_data.get('status', 'unknown'),
                    'objective_facts': intent_data.get('objective_facts', ''),
                    'context': intent_data.get('context', ''),
                    'source_message_ids': ','.join(intent_data.get('source_message_ids', [])),
                    'original_cluster_id': intent_data.get('cluster_id', -1),
                    'source_full_paths': ','.join(intent_data.get('source_full_paths', [])),
                    'min_start_timestamp': intent_data.get('min_start_timestamp', '1970-01-01T00:00:00'),
                }
                all_intents.append(record)

        df = pd.DataFrame(all_intents)
        print(f"✓ {len(df)}件のインテントを読み込みました")
        return df

    def _preprocess_dataframe(self):
        """DataFrameの前処理"""
        # 時刻をdatetimeに変換
        self.df['start_time'] = pd.to_datetime(self.df['min_start_timestamp'])

        # インテントIDを生成（行番号ベース）
        self.df['intent_id'] = [f"intent_{i:05d}" for i in range(len(self.df))]

        # パス処理: source_full_pathsから最初のパスを抽出
        def extract_first_path(paths_str: str) -> str:
            if pd.isna(paths_str) or paths_str == '':
                return 'Unknown'
            paths = paths_str.split(',')
            return paths[0].strip() if paths else 'Unknown'

        self.df['full_path'] = self.df['source_full_paths'].apply(extract_first_path)

        # パス処理: Inboxのみの場合はそのまま、Inbox->A->Bの場合はA->Bとして扱う
        def normalize_path(path: str) -> str:
            if ' -> ' not in path:
                return path
            else:
                parts = path.split(' -> ')
                if len(parts) > 1 and parts[0] == 'Inbox':
                    return ' -> '.join(parts[1:])
                return path

        self.df['normalized_path'] = self.df['full_path'].apply(normalize_path)

        # 階層深さを計算（正規化パスの ' -> ' の出現回数）
        self.df['hierarchy_depth'] = self.df['normalized_path'].str.count(' -> ')

        # ステータス別集計
        status_counts = self.df['status'].value_counts()
        print(f"  - 期間: {self.df['start_time'].min()} 〜 {self.df['start_time'].max()}")
        print(f"  - パス数: {self.df['full_path'].nunique()}")
        print(f"  - 正規化パス数: {self.df['normalized_path'].nunique()}")
        print(f"  - 最大階層深さ: {self.df['hierarchy_depth'].max()}")
        print(f"  - ステータス別: {dict(status_counts)}")

    def _generate_embeddings(self):
        """埋め込みの生成（キャッシュ使用）"""
        print(f"🔄 埋め込み生成中（モデル: {self.model_name}）...")

        cache = get_cache("intent_clustering_embeddings")
        model = SentenceTransformer(self.model_name)

        embeddings_list = []

        # 除外するフィールド（メタデータ）
        exclude_fields = {
            'source_message_ids', 'original_cluster_id', 'source_full_paths',
            'min_start_timestamp', 'intent_id', 'start_time', 'full_path',
            'normalized_path', 'hierarchy_depth', 'cluster'
        }

        for idx, row in tqdm(self.df.iterrows(), total=len(self.df), desc="埋め込み生成"):
            # メタデータ以外の全フィールドを結合してテキストを作成
            text_parts = []
            for field, value in row.items():
                if field not in exclude_fields and pd.notna(value) and str(value).strip():
                    text_parts.append(str(value))

            text = " ".join(text_parts)
            cache_key = f"intent_embedding:{self.model_name}:{hashlib.md5(text.encode()).hexdigest()}"

            # キャッシュ確認
            cached_embedding = cache.get(cache_key)
            if cached_embedding is not None:
                embedding = np.array(cached_embedding)
            else:
                # 埋め込み生成
                embedding = model.encode(text, convert_to_numpy=True)
                # キャッシュに保存
                cache.set(cache_key, embedding.tolist())

            embeddings_list.append(embedding)

        self.embeddings = np.array(embeddings_list)
        self.embedding_dim = self.embeddings.shape[1]
        print(f"✓ 埋め込み生成完了（次元: {self.embedding_dim}）")

    def compute_combined_distance_matrix(self) -> np.ndarray:
        """埋め込み・時間・階層を合成した距離行列を計算"""
        n = len(self.df)

        # 1. 埋め込みの距離行列（コサイン距離）
        print("📊 埋め込み距離行列を計算中...")
        embedding_similarity = cosine_similarity(self.embeddings)
        embedding_distance = 1 - embedding_similarity
        embedding_distance_norm = embedding_distance / (embedding_distance.max() + 1e-10)

        # 2. 時間距離行列（RBFカーネル）
        print("📊 時間距離行列を計算中...")
        timestamps = self.df['start_time'].values
        time_diff_matrix = np.abs(
            timestamps[:, np.newaxis] - timestamps[np.newaxis, :]
        ).astype('timedelta64[h]').astype(float)  # 時間単位に変換

        bandwidth = self.config.time_bandwidth_hours
        time_kernel = np.exp(-0.5 * (time_diff_matrix / bandwidth) ** 2)
        time_distance = 1 - time_kernel
        time_distance_norm = time_distance / (time_distance.max() + 1e-10)

        # 3. 階層距離行列（同じ階層なら0、異なれば1）
        print("📊 階層距離行列を計算中...")
        paths = self.df['normalized_path'].values
        hierarchy_distance = np.zeros((n, n))
        for i in range(n):
            for j in range(i+1, n):
                # 階層パスが異なる場合は1、同じ場合は0
                if paths[i] != paths[j]:
                    hierarchy_distance[i, j] = 1.0
                    hierarchy_distance[j, i] = 1.0

        hierarchy_distance_norm = hierarchy_distance

        # 4. 合成距離行列
        print("📊 合成距離行列を計算中...")
        combined_distance = (
            self.config.embedding_weight * embedding_distance_norm +
            self.config.time_weight * time_distance_norm +
            self.config.hierarchy_weight * hierarchy_distance_norm
        )

        print(f"✓ 合成距離行列完成 (shape: {combined_distance.shape})")
        print(f"  - 埋め込み重み: {self.config.embedding_weight}")
        print(f"  - 時間重み: {self.config.time_weight}")
        print(f"  - 階層重み: {self.config.hierarchy_weight}")

        return combined_distance

    def cluster(self, distance_matrix: np.ndarray) -> np.ndarray:
        """クラスタリング実行"""
        print(f"🔍 クラスタリング実行（手法: {self.config.method}）...")

        if self.config.method == "hdbscan":
            clusterer = hdbscan.HDBSCAN(
                min_cluster_size=self.config.min_cluster_size,
                min_samples=self.config.min_samples,
                metric='precomputed',
                cluster_selection_method='eom'
            )
            labels = clusterer.fit_predict(distance_matrix)

        elif self.config.method == "hierarchical":
            n_clusters = self.config.n_clusters
            if n_clusters is None:
                # 自動決定（例: √n）
                n_clusters = max(2, int(np.sqrt(len(self.df))))

            clusterer = AgglomerativeClustering(
                n_clusters=n_clusters,
                metric='precomputed',
                linkage=self.config.linkage
            )
            labels = clusterer.fit_predict(distance_matrix)

        elif self.config.method == "kmeans_constrained":
            n_clusters = self.config.n_clusters
            if n_clusters is None:
                # 自動決定
                n = len(self.df)
                avg_size = (self.config.size_min + self.config.size_max) / 2
                n_clusters = max(2, int(n / avg_size))

            # 距離行列を特徴ベクトルに変換（MDS的アプローチ）
            from sklearn.manifold import MDS
            mds = MDS(n_components=min(10, len(self.df) - 1), dissimilarity='precomputed', random_state=42)
            X_mds = mds.fit_transform(distance_matrix)

            clusterer = KMeansConstrained(
                n_clusters=n_clusters,
                size_min=self.config.size_min,
                size_max=self.config.size_max,
                n_init=self.config.n_init,
                max_iter=self.config.max_iter,
                random_state=42
            )
            labels = clusterer.fit_predict(X_mds)

        else:
            raise ValueError(f"未対応のクラスタリング手法: {self.config.method}")

        # ノイズ（-1）を「その他」クラスタに変換
        if self.config.convert_noise_to_cluster and (labels == -1).any():
            max_label = labels.max()
            labels[labels == -1] = max_label + 1
            print(f"  ⚠️ ノイズ {(labels == max_label + 1).sum()}件を「その他」クラスタ（{max_label + 1}）に変換しました")

        unique_labels = np.unique(labels)
        print(f"✓ クラスタリング完了")
        print(f"  - クラスタ数: {len(unique_labels)}")
        print(f"  - ノイズ: {(labels == -1).sum()}件")

        return labels

    def save_results(self, labels: np.ndarray):
        """クラスタリング結果の保存"""
        self.df['cluster'] = labels

        # CSV出力
        output_csv = OUTPUT_DIR / "clustered_intents.csv"
        self.df.to_csv(output_csv, index=False, encoding='utf-8-sig')
        print(f"💾 結果を保存: {output_csv}")

        # クラスタ統計
        cluster_stats = self.df['cluster'].value_counts().sort_index()
        print(f"\n📊 クラスタサイズ統計:")
        for cluster_id, count in cluster_stats.items():
            print(f"  - クラスタ {cluster_id}: {count}件")

        stats_json = OUTPUT_DIR / "clustering_stats.json"
        with open(stats_json, 'w', encoding='utf-8') as f:
            json.dump({
                'cluster_sizes': cluster_stats.to_dict(),
                'total_intents': len(self.df),
                'n_clusters': len(cluster_stats),
                'config': {
                    'method': self.config.method,
                    'embedding_weight': self.config.embedding_weight,
                    'time_weight': self.config.time_weight,
                    'hierarchy_weight': self.config.hierarchy_weight,
                }
            }, f, indent=2, ensure_ascii=False)
        print(f"💾 統計情報を保存: {stats_json}")


def main():
    """メイン処理"""
    import argparse

    parser = argparse.ArgumentParser(description='インテントクラスタリング')

    # 入力ディレクトリ
    parser.add_argument('--input-dir', type=str,
                       default='output/intent_extraction/processed',
                       help='インテント抽出結果のディレクトリ')

    # 重み設定
    parser.add_argument('--embedding-weight', type=float, default=0.7,
                       help='埋め込み重み (default: 0.7)')
    parser.add_argument('--time-weight', type=float, default=0.15,
                       help='時間重み (default: 0.15)')
    parser.add_argument('--hierarchy-weight', type=float, default=0.15,
                       help='階層重み (default: 0.15)')
    parser.add_argument('--time-bandwidth-hours', type=float, default=168.0,
                       help='時間カーネル帯域幅（時間） (default: 168.0)')

    # クラスタリング手法
    parser.add_argument('--method', type=str, default='kmeans_constrained',
                       choices=['hdbscan', 'hierarchical', 'kmeans_constrained'],
                       help='クラスタリング手法 (default: kmeans_constrained)')

    # HDBSCANパラメータ
    parser.add_argument('--min-cluster-size', type=int, default=3,
                       help='HDBSCANの最小クラスタサイズ (default: 3)')
    parser.add_argument('--min-samples', type=int, default=2,
                       help='HDBSCANの最小サンプル数 (default: 2)')

    # 階層的クラスタリング/k-meansパラメータ
    parser.add_argument('--n-clusters', type=int, default=None,
                       help='クラスタ数 (default: 自動計算)')
    parser.add_argument('--linkage', type=str, default='complete',
                       choices=['average', 'complete', 'single', 'ward'],
                       help='階層的クラスタリングの結合法 (default: complete)')

    # k-means-constrainedパラメータ
    parser.add_argument('--size-min', type=int, default=5,
                       help='最小クラスタサイズ (default: 5)')
    parser.add_argument('--size-max', type=int, default=20,
                       help='最大クラスタサイズ (default: 20)')
    parser.add_argument('--n-init', type=int, default=10,
                       help='k-meansの初期化回数 (default: 10)')
    parser.add_argument('--max-iter', type=int, default=300,
                       help='k-meansの最大反復回数 (default: 300)')

    args = parser.parse_args()

    # 設定
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
        max_iter=args.max_iter,
    )
    config.validate()

    # データ読み込みと埋め込み生成
    intent_data = IntentData(
        input_dir=Path(args.input_dir),
        config=config,
        generate_embeddings=True
    )

    # 距離行列計算
    distance_matrix = intent_data.compute_combined_distance_matrix()

    # クラスタリング
    labels = intent_data.cluster(distance_matrix)

    # 結果保存
    intent_data.save_results(labels)

    print(f"\n✅ 完了！")
    print(f"📁 出力ディレクトリ: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
インテントネットワーク構築システム

抽出されたインテント間の類似度に基づいてネットワークグラフを構築し、
インタラクティブなHTMLで可視化する。

主な機能:
1. 複数のcluster_XX_processed.jsonファイルからインテントを読み込み
2. インテントテキストの埋め込みベクトルを生成
3. 類似度に基づいてエッジを構築
4. インタラクティブなHTMLネットワークグラフを生成
"""

import json
import hashlib
import numpy as np
import pandas as pd
from pathlib import Path
import warnings
from dotenv import load_dotenv
from tqdm import tqdm
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
from pyvis.network import Network
import networkx as nx

# キャッシュ
from app.cache import get_cache

warnings.filterwarnings('ignore')

# 環境変数読み込み
load_dotenv()

# 出力ディレクトリ
OUTPUT_DIR = Path("output/intent_network")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


class IntentNetworkBuilder:
    """インテントネットワークの構築"""

    def __init__(
        self,
        input_dir: Path,
        model_name: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
        similarity_threshold: float = 0.7,
        max_edges_per_node: int = 5,
    ):
        """
        Args:
            input_dir: インテント抽出結果のディレクトリ
            model_name: 埋め込みモデル名
            similarity_threshold: エッジを作成する最小類似度
            max_edges_per_node: 各ノードから伸びる最大エッジ数
        """
        self.input_dir = Path(input_dir)
        self.model_name = model_name
        self.similarity_threshold = similarity_threshold
        self.max_edges_per_node = max_edges_per_node

        # データ読み込み
        self.df = self._load_all_intents()
        self._preprocess_dataframe()

        # 埋め込み生成
        self.embeddings = None
        self.embedding_dim = None
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

        # ステータス別集計
        status_counts = self.df['status'].value_counts()
        print(f"  - 期間: {self.df['start_time'].min()} 〜 {self.df['start_time'].max()}")
        print(f"  - パス数: {self.df['full_path'].nunique()}")
        print(f"  - ステータス別: {dict(status_counts)}")

    def _generate_embeddings(self):
        """埋め込みの生成（キャッシュ使用）"""
        print(f"🔄 埋め込み生成中（モデル: {self.model_name}）...")

        cache = get_cache("intent_network_embeddings")
        model = SentenceTransformer(self.model_name)

        embeddings_list = []

        # 除外するフィールド（メタデータ）
        exclude_fields = {
            'source_message_ids', 'original_cluster_id', 'source_full_paths',
            'min_start_timestamp', 'intent_id', 'start_time', 'full_path'
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

    def build_network(self) -> nx.Graph:
        """類似度に基づいてネットワークを構築"""
        print(f"🔗 ネットワーク構築中（類似度閾値: {self.similarity_threshold}）...")

        # 類似度行列を計算
        similarity_matrix = cosine_similarity(self.embeddings)

        # NetworkXグラフを作成
        G = nx.Graph()

        # ノードを追加
        for idx, row in self.df.iterrows():
            node_id = row['intent_id']
            G.add_node(
                node_id,
                intent=row['intent'],
                status=row['status'],
                objective_facts=row['objective_facts'],
                context=row['context'],
                full_path=row['full_path'],
                start_time=row['start_time'].strftime('%Y-%m-%d %H:%M'),
                original_cluster=row['original_cluster_id']
            )

        # エッジを追加（類似度が閾値以上のペア）
        edge_count = 0
        for i in range(len(self.df)):
            # 各ノードについて、類似度が高い上位N個とエッジを作成
            similarities = similarity_matrix[i]
            # 自分自身を除外
            similarities[i] = -1

            # 上位N個のインデックスを取得
            top_indices = np.argsort(similarities)[::-1][:self.max_edges_per_node]

            for j in top_indices:
                similarity = similarities[j]
                if similarity >= self.similarity_threshold:
                    node_i = self.df.iloc[i]['intent_id']
                    node_j = self.df.iloc[j]['intent_id']

                    # エッジを追加（重複を避けるためにi < jの条件）
                    if i < j:
                        G.add_edge(node_i, node_j, weight=float(similarity))
                        edge_count += 1

        print("✓ ネットワーク構築完了")
        print(f"  - ノード数: {G.number_of_nodes()}")
        print(f"  - エッジ数: {G.number_of_edges()}")
        print(f"  - 平均次数: {2 * G.number_of_edges() / G.number_of_nodes():.2f}")

        return G

    def create_interactive_html(self, G: nx.Graph, output_path: Path):
        """インタラクティブなHTMLネットワークを生成"""
        print("📊 インタラクティブHTML生成中...")

        # Pyvisネットワークを作成
        net = Network(
            height="900px",
            width="100%",
            bgcolor="#ffffff",
            font_color="#333333",
            notebook=False,
            directed=False
        )

        # 物理演算の設定
        net.barnes_hut(
            gravity=-10000,
            central_gravity=0.3,
            spring_length=200,
            spring_strength=0.001,
            damping=0.09
        )

        # ステータス別の色設定
        status_colors = {
            'idea': '#FFE082',      # 黄色
            'todo': '#81C784',      # 緑
            'doing': '#64B5F6',     # 青
            'done': '#90CAF9',      # 水色
            'blocked': '#E57373',   # 赤
            'unknown': '#BDBDBD'    # グレー
        }

        # ノードを追加
        for node_id, node_data in G.nodes(data=True):
            status = node_data['status']
            color = status_colors.get(status, '#BDBDBD')

            # ツールチップ用のHTMLを作成
            intent_text = node_data['intent']
            if intent_text and len(intent_text) > 200:
                intent_text = intent_text[:200] + '...'

            facts_text = node_data['objective_facts'] or ''
            if facts_text and len(facts_text) > 200:
                facts_text = facts_text[:200] + '...'

            title = f"""
            <div style="max-width: 400px;">
                <strong>{node_id}</strong><br>
                <strong>ステータス:</strong> {status}<br>
                <strong>パス:</strong> {node_data['full_path']}<br>
                <strong>時刻:</strong> {node_data['start_time']}<br>
                <strong>元クラスタ:</strong> {node_data['original_cluster']}<br><br>
                <strong>意図:</strong><br>{intent_text}<br><br>
                <strong>事実:</strong><br>{facts_text}
            </div>
            """

            # ラベルはintent_idのみ
            label = node_id

            net.add_node(
                node_id,
                label=label,
                title=title,
                color=color,
                size=20
            )

        # エッジを追加
        for edge in G.edges(data=True):
            source, target, data = edge
            weight = data['weight']

            # エッジの太さを類似度に応じて調整
            edge_width = 1 + (weight - self.similarity_threshold) * 10

            net.add_edge(
                source,
                target,
                value=edge_width,
                title=f"類似度: {weight:.3f}"
            )

        # HTMLを生成
        net.save_graph(str(output_path))
        print(f"✓ HTMLファイル生成完了: {output_path}")

    def save_network_stats(self, G: nx.Graph):
        """ネットワーク統計を保存"""
        stats = {
            'n_nodes': G.number_of_nodes(),
            'n_edges': G.number_of_edges(),
            'avg_degree': 2 * G.number_of_edges() / G.number_of_nodes() if G.number_of_nodes() > 0 else 0,
            'density': nx.density(G),
            'n_connected_components': nx.number_connected_components(G),
            'config': {
                'similarity_threshold': self.similarity_threshold,
                'max_edges_per_node': self.max_edges_per_node,
                'model_name': self.model_name
            }
        }

        # 次数分布
        degrees = [d for n, d in G.degree()]
        stats['degree_distribution'] = {
            'mean': float(np.mean(degrees)),
            'median': float(np.median(degrees)),
            'min': int(np.min(degrees)),
            'max': int(np.max(degrees))
        }

        # 連結成分のサイズ
        components = list(nx.connected_components(G))
        component_sizes = [len(c) for c in components]
        stats['component_sizes'] = sorted(component_sizes, reverse=True)[:10]  # 上位10個

        stats_path = OUTPUT_DIR / "network_stats.json"
        with open(stats_path, 'w', encoding='utf-8') as f:
            json.dump(stats, f, indent=2, ensure_ascii=False)
        print(f"💾 統計情報を保存: {stats_path}")


def main():
    """メイン処理"""
    import argparse

    parser = argparse.ArgumentParser(description='インテントネットワーク構築')

    # 入力ディレクトリ
    parser.add_argument('--input-dir', type=str,
                       default='output/intent_extraction/processed',
                       help='インテント抽出結果のディレクトリ')

    # ネットワーク設定
    parser.add_argument('--similarity-threshold', type=float, default=0.7,
                       help='エッジを作成する最小類似度 (default: 0.7)')
    parser.add_argument('--max-edges-per-node', type=int, default=5,
                       help='各ノードから伸びる最大エッジ数 (default: 5)')

    # モデル設定
    parser.add_argument('--model', type=str,
                       default='sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2',
                       help='埋め込みモデル名')

    args = parser.parse_args()

    print("=" * 60)
    print("インテントネットワーク構築")
    print("=" * 60)
    print("\n設定:")
    print(f"  入力ディレクトリ: {args.input_dir}")
    print(f"  類似度閾値: {args.similarity_threshold}")
    print(f"  最大エッジ数/ノード: {args.max_edges_per_node}")
    print(f"  モデル: {args.model}")
    print()

    # ネットワーク構築
    builder = IntentNetworkBuilder(
        input_dir=Path(args.input_dir),
        model_name=args.model,
        similarity_threshold=args.similarity_threshold,
        max_edges_per_node=args.max_edges_per_node
    )

    # ネットワーク構築
    G = builder.build_network()

    # 統計保存
    builder.save_network_stats(G)

    # インタラクティブHTML生成
    html_path = OUTPUT_DIR / "network.html"
    builder.create_interactive_html(G, html_path)

    print("\n✅ 完了！")
    print(f"📁 出力ディレクトリ: {OUTPUT_DIR}")
    print(f"📄 ネットワークHTML: {html_path}")


if __name__ == "__main__":
    main()

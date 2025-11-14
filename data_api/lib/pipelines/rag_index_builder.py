"""
RAGインデックス構築モジュール

複数ファイルに分散する意図データを1つの検索用ドキュメントに統合し、
JSONL形式で保存。Phase 3でVector DBにインデックス化する。
"""

import json
from pathlib import Path
from typing import Any

import pandas as pd
from tqdm import tqdm  # type: ignore[import-untyped]

from lib.rag_models import IntentStatus, UnifiedIntent


def load_clustered_messages(csv_path: str) -> pd.DataFrame:
    """
    clustered_messages.csvを読み込む

    Args:
        csv_path: CSVファイルパス

    Returns:
        DataFrame: message_id, full_path, combined_content, start_time, cluster
    """
    df = pd.read_csv(csv_path)
    # start_timeをdatetimeに変換
    df["start_time"] = pd.to_datetime(df["start_time"])
    return df


def load_cluster_intents(cluster_dir: str) -> dict[int, list[dict[str, Any]]]:
    """
    cluster_XX_processed.jsonから個別意図を読み込む

    Args:
        cluster_dir: processedディレクトリパス

    Returns:
        {cluster_id: [intent_dict, ...]}
    """
    cluster_dir_path = Path(cluster_dir)
    cluster_files = sorted(cluster_dir_path.glob("cluster_*.json"))

    cluster_intents: dict[int, list[dict[str, Any]]] = {}

    for cluster_file in cluster_files:
        with open(cluster_file, encoding="utf-8") as f:
            intents = json.load(f)

        # cluster_idを取得（ファイル名から）
        cluster_id = int(
            cluster_file.stem.replace("cluster_", "").replace("_processed", "")
        )
        cluster_intents[cluster_id] = intents

    return cluster_intents


def load_hierarchy(enriched_path: str) -> dict[str, Any]:
    """
    ultra_intents_enriched.jsonから階層情報を読み込む

    Args:
        enriched_path: ultra_intents_enriched.jsonのパス

    Returns:
        階層情報のdict
    """
    with open(enriched_path, encoding="utf-8") as f:
        return json.load(f)


def build_intent_to_hierarchy_map(
    hierarchy_data: dict[str, Any],
) -> dict[str, dict[str, str]]:
    """
    intent_id -> {ultra_intent_id, ultra_intent_text, meta_intent_id, meta_intent_text}
    のマッピングを構築

    Args:
        hierarchy_data: ultra_intents_enriched.jsonの内容

    Returns:
        {intent_id: {ultra_intent_id, ultra_intent_text, ...}}
    """
    mapping: dict[str, dict[str, str]] = {}

    # ultra_intentsをループ
    for ultra_idx, ultra_intent in enumerate(hierarchy_data.get("ultra_intents", [])):
        ultra_id = f"ultra_{ultra_idx}"
        ultra_text = ultra_intent.get("context", "")

        # covered_intents_detailsから個別意図を取得
        for intent_detail in ultra_intent.get("covered_intents_details", []):
            intent_id = intent_detail.get("intent_id", "")
            if not intent_id:
                continue

            mapping[intent_id] = {
                "ultra_intent_id": ultra_id,
                "ultra_intent_text": ultra_text,
                "meta_intent_id": "",  # Phase 2ではmeta_intentは未対応
                "meta_intent_text": "",
            }

    return mapping


def build_message_content_map(
    messages_df: pd.DataFrame,
) -> dict[str, dict[str, Any]]:
    """
    message_id -> {combined_content, full_path, start_time, cluster}
    のマッピングを構築

    Args:
        messages_df: clustered_messages.csvのDataFrame

    Returns:
        {message_id: {combined_content, full_path, start_time, cluster}}
    """
    mapping: dict[str, dict[str, Any]] = {}

    for _, row in messages_df.iterrows():
        message_id = str(row["message_id"])
        mapping[message_id] = {
            "combined_content": str(row["combined_content"]),
            "full_path": str(row["full_path"]),
            "start_time": row["start_time"],
            "cluster": int(row["cluster"]),
        }

    return mapping


def generate_unified_intents(
    cluster_intents: dict[int, list[dict[str, Any]]],
    hierarchy_map: dict[str, dict[str, str]],
    message_map: dict[str, dict[str, Any]],
    generated_nodes: list[dict[str, Any]] | None = None,
) -> list[UnifiedIntent]:
    """
    統合ドキュメントを生成

    Args:
        cluster_intents: {cluster_id: [intent_dict, ...]}
        hierarchy_map: {intent_id: {ultra_intent_id, ...}}
        message_map: {message_id: {combined_content, ...}}
        generated_nodes: 生成ノード（ultra_intent, meta_intent）のリスト

    Returns:
        UnifiedIntentのリスト
    """
    unified_intents: list[UnifiedIntent] = []

    # cluster_intentsを全て処理
    for cluster_id, intents in tqdm(
        cluster_intents.items(), desc="Generating unified intents", unit="cluster"
    ):
        for intent_idx, intent_dict in enumerate(intents):
            # intent_idを構築
            intent_id = f"intent_{cluster_id}_{intent_idx}"

            # 階層情報を取得
            hierarchy_info = hierarchy_map.get(intent_id, {})
            if not hierarchy_info:
                # 階層情報がない場合はスキップ
                continue

            # メッセージ情報を収集
            source_message_ids = intent_dict.get("source_message_ids", [])
            source_full_paths = intent_dict.get("source_full_paths", [])

            # 元メッセージの全文を結合
            combined_contents = []
            for msg_id in source_message_ids:
                msg_info = message_map.get(msg_id, {})
                if msg_info:
                    combined_contents.append(msg_info["combined_content"])

            combined_content = "\n".join(combined_contents)

            # embedding_textを構築（intent + context + ultra_intent_text）
            intent_text = intent_dict.get("intent", "")
            context = intent_dict.get("context") or ""
            ultra_intent_text = hierarchy_info.get("ultra_intent_text", "")

            embedding_text = f"{intent_text}\n{context}\n{ultra_intent_text}".strip()

            # UnifiedIntentを作成
            try:
                # timestamps: 新フォーマット優先、古いフォーマットにフォールバック
                timestamps = intent_dict.get("start_timestamps") or intent_dict.get(
                    "min_start_timestamp"
                )
                if timestamps is None:
                    timestamps = []

                unified_intent = UnifiedIntent(
                    id=intent_id,
                    type="individual_intent",
                    intent=intent_text,
                    context=context,
                    combined_content=combined_content,
                    timestamps=timestamps,
                    status=IntentStatus(intent_dict.get("status", "idea").lower()),
                    cluster_id=cluster_id,
                    source_message_ids=source_message_ids,
                    source_full_paths=source_full_paths,
                    ultra_intent_id=hierarchy_info.get("ultra_intent_id", ""),
                    ultra_intent_text=ultra_intent_text,
                    meta_intent_id=hierarchy_info.get("meta_intent_id", ""),
                    meta_intent_text=hierarchy_info.get("meta_intent_text", ""),
                    embedding_text=embedding_text,
                )
                unified_intents.append(unified_intent)
            except Exception as e:
                print(f"⚠️  Error creating UnifiedIntent for {intent_id}: {e}")
                continue

    # generated_nodes（ultra_intent, meta_intent）を処理
    if generated_nodes:
        # 重複除去のためのセット
        seen_node_ids: set[str] = set()

        for node_dict in tqdm(
            generated_nodes, desc="Processing generated nodes", unit="node"
        ):
            node_id = node_dict.get("intent_id", "")
            if not node_id:
                continue

            # 重複IDをスキップ
            if node_id in seen_node_ids:
                continue
            seen_node_ids.add(node_id)

            # embedding_textを構築（intent + context + objective_facts）
            intent_text = node_dict.get("intent", "")
            context = node_dict.get("context") or ""
            objective_facts = node_dict.get("objective_facts") or ""

            embedding_text = f"{intent_text}\n{context}\n{objective_facts}".strip()

            try:
                unified_intent = UnifiedIntent(
                    id=node_id,
                    type="generated_node",
                    intent=intent_text,
                    context=context,
                    combined_content="",  # generated nodeには元メッセージがない
                    timestamps=[],  # generated nodeにはタイムスタンプがない
                    status=IntentStatus(node_dict.get("status", "idea").lower()),
                    cluster_id=-1,  # generated nodeはクラスタに属さない
                    source_message_ids=[],
                    source_full_paths=[],
                    ultra_intent_id="",  # 自分自身がultra_intentの場合がある
                    ultra_intent_text="",
                    meta_intent_id="",
                    meta_intent_text="",
                    embedding_text=embedding_text,
                )
                unified_intents.append(unified_intent)
            except Exception as e:
                print(f"⚠️  Error creating UnifiedIntent for generated node {node_id}: {e}")
                continue

    return unified_intents


def save_unified_intents(intents: list[UnifiedIntent], output_path: str) -> None:
    """
    統合ドキュメントをJSONL形式で保存

    Args:
        intents: UnifiedIntentのリスト
        output_path: 出力先パス
    """
    output_path_obj = Path(output_path)
    output_path_obj.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w", encoding="utf-8") as f:
        for intent in intents:
            # Pydanticのmodel_dump()でdictに変換
            intent_dict = intent.model_dump()
            # timestampsをISO形式の文字列リストに変換
            intent_dict["timestamps"] = [
                ts.isoformat() for ts in intent.timestamps
            ]
            # statusをstrに変換
            intent_dict["status"] = intent.status.value
            f.write(json.dumps(intent_dict, ensure_ascii=False) + "\n")

    print(f"✓ 統合ドキュメントを保存しました: {output_path}")
    print(f"  Total intents: {len(intents)}")


def build_chroma_index(
    intents: list[UnifiedIntent],
    chroma_db_path: str,
) -> None:
    """
    Chromaにインデックスを作成

    Args:
        intents: UnifiedIntentのリスト
        chroma_db_path: Chroma DBのパス
    """
    import chromadb
    from sentence_transformers import SentenceTransformer

    # ruri-large-v2モデル（既存パイプラインと同じ）
    print("  Loading embedding model (ruri-large-v2)...")
    model = SentenceTransformer("cl-nagoya/ruri-large-v2")

    # Chroma client
    chroma_db_path_obj = Path(chroma_db_path)
    chroma_db_path_obj.mkdir(parents=True, exist_ok=True)

    client = chromadb.PersistentClient(path=str(chroma_db_path))

    # 既存のコレクションを削除（再構築のため）
    try:
        client.delete_collection(name="intents")
    except Exception:
        pass  # コレクションが存在しない場合は無視

    collection = client.get_or_create_collection(
        name="intents", metadata={"hnsw:space": "cosine"}
    )

    # Embedding生成
    print("  Generating embeddings...")
    embeddings = model.encode(
        [intent.embedding_text for intent in intents],
        show_progress_bar=True,
        convert_to_numpy=True,
    )

    # インデックス登録
    print("  Adding to Chroma DB...")
    collection.add(
        ids=[intent.id for intent in intents],
        embeddings=embeddings.tolist(),
        documents=[intent.embedding_text for intent in intents],
        metadatas=[
            {
                # timestamps リストの最小値（最初の要素）を使用
                "timestamp": (
                    int(intent.timestamps[0].timestamp()) if intent.timestamps else 0
                ),  # Unix時間（整数）に変換
                "timestamp_iso": (
                    intent.timestamps[0].isoformat() if intent.timestamps else ""
                ),  # 可読性のためISO形式も保存
                "status": intent.status.value,
                "cluster_id": intent.cluster_id,
                "ultra_intent_id": intent.ultra_intent_id,
                "meta_intent_id": intent.meta_intent_id,
                "intent": intent.intent,
                "context": intent.context,
            }
            for intent in intents
        ],
    )

    print(f"  ✓ Chroma DBにインデックスを作成しました: {chroma_db_path}")
    print(f"    Total documents: {collection.count()}")


def build_rag_index(
    csv_path: str = "output/message_clustering/clustered_messages.csv",
    cluster_dir: str = "output/intent_extraction/processed",
    enriched_path: str = "output/intent_extraction/cross_cluster/ultra_intents_enriched.json",
    network_path: str = "output/goal_network/ultra_intent_goal_network.json",
    output_path: str = "output/rag_index/unified_intents.jsonl",
    chroma_db_path: str = "output/rag_index/chroma_db",
    build_chroma: bool = True,
) -> None:
    """
    RAGインデックス構築のメイン処理（Phase 3: JSONL保存 + Chromaインデックス化）

    Args:
        csv_path: clustered_messages.csvのパス
        cluster_dir: cluster_XX_processed.jsonのディレクトリ
        enriched_path: ultra_intents_enriched.jsonのパス
        network_path: ゴールネットワークJSONのパス（generated_nodes取得用）
        output_path: 統合ドキュメント出力先
        chroma_db_path: Chroma DBのパス
        build_chroma: Chromaインデックスを構築するか
    """
    print("=" * 60)
    print("RAGインデックス構築（Phase 3: JSONL + Chromaインデックス化）")
    print("=" * 60)

    # 1. データ読み込み
    print("\n[1/5] データ読み込み中...")
    messages_df = load_clustered_messages(csv_path)
    print(f"  ✓ Messages: {len(messages_df)} 件")

    cluster_intents = load_cluster_intents(cluster_dir)
    total_intents = sum(len(intents) for intents in cluster_intents.values())
    print(
        f"  ✓ Cluster intents: {len(cluster_intents)} clusters, {total_intents} intents"
    )

    hierarchy_data = load_hierarchy(enriched_path)
    print(
        f"  ✓ Hierarchy data: {len(hierarchy_data.get('ultra_intents', []))} ultra intents"
    )

    # generated_nodesを読み込む
    generated_nodes: list[dict[str, Any]] = []
    network_path_obj = Path(network_path)
    if network_path_obj.exists():
        with open(network_path, encoding="utf-8") as f:
            network_data = json.load(f)
            generated_nodes = network_data.get("generated_nodes", [])
        print(f"  ✓ Generated nodes: {len(generated_nodes)} 件")

    # 2. マッピング構築
    print("\n[2/5] マッピング構築中...")
    hierarchy_map = build_intent_to_hierarchy_map(hierarchy_data)
    print(f"  ✓ Hierarchy map: {len(hierarchy_map)} intents")

    message_map = build_message_content_map(messages_df)
    print(f"  ✓ Message map: {len(message_map)} messages")

    # 3. 統合ドキュメント生成
    print("\n[3/5] 統合ドキュメント生成中...")
    unified_intents = generate_unified_intents(
        cluster_intents, hierarchy_map, message_map, generated_nodes
    )
    print(f"  ✓ Unified intents: {len(unified_intents)} 件 (generated_nodes: {len(generated_nodes)} 件含む)")

    # 4. JSONL保存
    print("\n[4/5] JSONL保存中...")
    save_unified_intents(unified_intents, output_path)

    # 5. Chromaインデックス化
    if build_chroma:
        print("\n[5/5] Chromaインデックス化中...")
        build_chroma_index(unified_intents, chroma_db_path)
    else:
        print("\n[5/5] Chromaインデックス化をスキップしました")

    print("\n" + "=" * 60)
    print("✅ Phase 3 完了！")
    print("=" * 60)


# テスト用コード
if __name__ == "__main__":
    build_rag_index()

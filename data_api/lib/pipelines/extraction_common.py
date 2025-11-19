#!/usr/bin/env python3
"""
メッセージ抽出処理の共通ユーティリティ

Intent抽出、Goal抽出など、様々なスキーマに対する抽出処理で共有される機能を提供
"""

import json
import pandas as pd  # type: ignore[import-untyped]
from pathlib import Path
from typing import Any, Dict, List, Optional
import sys

# プロジェクトルートをパスに追加
sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from lib.parse_error_handler import extract_json_from_markdown


def load_clustered_messages() -> pd.DataFrame:
    """クラスタリング済みメッセージを読み込み"""
    csv_path = Path("output/message_clustering/clustered_messages.csv")
    if not csv_path.exists():
        raise FileNotFoundError(f"クラスタリング結果が見つかりません: {csv_path}")

    df = pd.read_csv(csv_path)
    df["start_time"] = pd.to_datetime(df["start_time"])
    return df


def build_message_metadata(df: pd.DataFrame) -> Dict[str, Dict]:
    """
    メッセージIDからメタデータへのマッピングを構築

    Args:
        df: クラスタリング済みメッセージのDataFrame

    Returns:
        msg_id -> {full_path, start_timestamps} のマッピング
    """
    metadata: Dict[str, Dict] = {}
    for row in df.itertuples():
        msg_id = str(row.message_id)
        start_time = row.start_time

        # start_timeがdatetime型であることを確認
        if hasattr(start_time, "isoformat"):
            timestamp_str = start_time.isoformat()  # type: ignore[union-attr]
        else:
            timestamp_str = str(start_time)

        if msg_id not in metadata:
            metadata[msg_id] = {
                "full_path": str(row.full_path),
                "start_timestamps": [timestamp_str],
            }
        else:
            # 同じmsg_idで複数行ある場合、全てのタイムスタンプを保持
            timestamps_list = metadata[msg_id]["start_timestamps"]
            assert isinstance(timestamps_list, list)
            timestamps_list.append(timestamp_str)
    return metadata


def preprocess_extract_json_from_response(
    raw_response_text: str,
    context: str,
    metadata: Dict[str, Any],
) -> Optional[List[Dict]]:
    """
    生レスポンスからJSONを抽出（前処理）

    Args:
        raw_response_text: LLMの生レスポンステキスト
        context: エラーログ用のコンテキスト情報
        metadata: エラーログ用のメタデータ

    Returns:
        抽出されたJSONリスト、またはNone
    """
    result = extract_json_from_markdown(
        raw_response_text,
        context=context,
        metadata=metadata,
        log_errors=True,
        save_errors=True,
    )
    return result


def enrich_items_with_metadata(
    items: List[Dict],
    cluster_id: int,
    message_metadata: Dict[str, Dict],
) -> List[Dict]:
    """
    抽出されたアイテム（intent/goalなど）にメタデータを追加

    Args:
        items: 抽出されたアイテムのリスト
        cluster_id: クラスタID
        message_metadata: msg_id -> {full_path, start_timestamps} のマッピング

    Returns:
        メタデータが補完されたアイテムのリスト
    """
    enriched_items = []
    for item in items:
        # cluster_idを追加（int64 -> int 変換）
        item["cluster_id"] = int(cluster_id)

        source_ids = item.get("source_message_ids", [])
        if not source_ids:
            enriched_items.append(item)
            continue

        # source_message_idsに対応するfull_pathとstart_timestampsを集約
        full_paths = []
        timestamps = []

        for msg_id in source_ids:
            metadata = message_metadata.get(msg_id, {})
            full_path = metadata.get("full_path")
            timestamp_list = metadata.get("start_timestamps", [])

            if full_path:
                full_paths.append(full_path)
            if timestamp_list:
                timestamps.extend(timestamp_list)

        # ユニークなfull_pathのリスト
        item["source_full_paths"] = list(set(full_paths)) if full_paths else []

        # 全てのタイムスタンプをソート済みリストで保持
        item["start_timestamps"] = sorted(list(set(timestamps))) if timestamps else []

        enriched_items.append(item)

    return enriched_items


def save_items_as_json(
    items: List[Dict],
    output_path: Path,
) -> None:
    """
    アイテムをJSON形式で保存

    Args:
        items: 保存するアイテムのリスト
        output_path: 出力先ファイルパス
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2, sort_keys=True)


def save_items_as_csv(
    items: List[Dict],
    output_path: Path,
    array_fields: Optional[List[str]] = None,
) -> None:
    """
    アイテムをCSV形式で保存

    Args:
        items: 保存するアイテムのリスト
        output_path: 出力先ファイルパス
        array_fields: JSON文字列として保存する配列フィールドのリスト
                     Noneの場合は自動検出（値が list/dict 型のフィールド）
    """
    if not items:
        print(f"警告: 保存するアイテムがありません: {output_path}")
        return

    # DataFrameに変換
    df = pd.DataFrame(items)

    # 配列/オブジェクトフィールドをJSON文字列に変換
    if array_fields is None:
        # 自動検出: 値が list または dict 型のカラムを特定
        array_fields = []
        for col in df.columns:
            sample_value = df[col].dropna().iloc[0] if not df[col].dropna().empty else None
            if isinstance(sample_value, (list, dict)):
                array_fields.append(col)

    for field in array_fields:
        if field in df.columns:
            df[field] = df[field].apply(
                lambda x: json.dumps(x, ensure_ascii=False) if x is not None else ""
            )

    # CSV保存
    output_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(output_path, index=False, encoding="utf-8")

#!/usr/bin/env python3
"""
クラスタごとの意図抽出プロンプト生成

各クラスタのメッセージから意図オブジェクトを抽出するためのプロンプトを生成

使用例:
  # プロンプトのみ生成
  python scripts/generate_intent_extraction_prompts.py

  # Gemini APIで意図抽出を実行してレビュー用HTMLを生成
  python scripts/generate_intent_extraction_prompts.py --gemini
"""

import json
import pandas as pd
from pathlib import Path
from typing import List, Dict, Optional
from datetime import datetime
import argparse
import os
import sys
from dotenv import load_dotenv
from tqdm import tqdm

# プロジェクトルートをパスに追加
sys.path.insert(0, str(Path(__file__).parent.parent))
from lib import gemini_client


OUTPUT_DIR = Path("output/intent_extraction")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

TEMPLATE_DIR = Path("templates")
TEMPLATE_FILE = TEMPLATE_DIR / "intent_extraction_prompt.md"
GROUPING_TEMPLATE_FILE = TEMPLATE_DIR / "intent_grouping_prompt.md"
REASSIGNMENT_TEMPLATE_FILE = TEMPLATE_DIR / "intent_reassignment_prompt.md"
COMMON_INTENT_OBJECT_FILE = TEMPLATE_DIR / "common" / "intent_object_common.md"

PROCESSED_DIR = OUTPUT_DIR / "processed"
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

AGGREGATED_DIR = OUTPUT_DIR / "aggregated"
AGGREGATED_DIR.mkdir(parents=True, exist_ok=True)

CROSS_CLUSTER_DIR = OUTPUT_DIR / "cross_cluster"
CROSS_CLUSTER_DIR.mkdir(parents=True, exist_ok=True)


def load_common_intent_object_definition() -> str:
    """共通intent object定義を読み込み"""
    if not COMMON_INTENT_OBJECT_FILE.exists():
        raise FileNotFoundError(
            f"共通定義ファイルが見つかりません: {COMMON_INTENT_OBJECT_FILE}"
        )

    with open(COMMON_INTENT_OBJECT_FILE, "r", encoding="utf-8") as f:
        return f.read()


def load_template() -> str:
    """プロンプトテンプレートを読み込み"""
    if not TEMPLATE_FILE.exists():
        raise FileNotFoundError(
            f"テンプレートファイルが見つかりません: {TEMPLATE_FILE}"
        )

    with open(TEMPLATE_FILE, "r", encoding="utf-8") as f:
        template = f.read()

    # 共通定義を差し込み
    common_definition = load_common_intent_object_definition()
    template = template.replace("{COMMON_INTENT_OBJECT}", common_definition)

    return template


def load_grouping_template() -> str:
    """意図グループ化テンプレートを読み込み"""
    if not GROUPING_TEMPLATE_FILE.exists():
        raise FileNotFoundError(
            f"テンプレートファイルが見つかりません: {GROUPING_TEMPLATE_FILE}"
        )

    with open(GROUPING_TEMPLATE_FILE, "r", encoding="utf-8") as f:
        template = f.read()

    # 共通定義を差し込み
    common_definition = load_common_intent_object_definition()
    template = template.replace("{COMMON_INTENT_OBJECT}", common_definition)

    return template


def load_reassignment_template() -> str:
    """意図再割り振りテンプレートを読み込み"""
    if not REASSIGNMENT_TEMPLATE_FILE.exists():
        raise FileNotFoundError(
            f"テンプレートファイルが見つかりません: {REASSIGNMENT_TEMPLATE_FILE}"
        )

    with open(REASSIGNMENT_TEMPLATE_FILE, "r", encoding="utf-8") as f:
        template = f.read()

    return template


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
        msg_id -> {full_path, min_start_timestamp} のマッピング
    """
    metadata = {}
    for row in df.itertuples():
        msg_id = row.message_id
        if msg_id not in metadata:
            metadata[msg_id] = {
                "full_path": row.full_path,
                "min_start_timestamp": row.start_time.isoformat(),
            }
        else:
            # 同じmsg_idで複数行ある場合、最小のタイムスタンプを保持
            current_ts = pd.to_datetime(metadata[msg_id]["min_start_timestamp"])
            if row.start_time < current_ts:
                metadata[msg_id]["min_start_timestamp"] = row.start_time.isoformat()
    return metadata


def generate_cluster_prompt(
    cluster_id: int, cluster_df: pd.DataFrame, template: str
) -> Dict:
    """
    1つのクラスタに対する意図抽出プロンプトを生成

    Args:
        cluster_id: クラスタID
        cluster_df: クラスタに属するメッセージのDataFrame
        template: プロンプトテンプレート

    Returns:
        プロンプト情報の辞書
    """
    # メッセージを時系列順にソート
    cluster_df = cluster_df.sort_values("start_time")

    # メッセージリストを構築
    messages = []
    message_parts = []

    for i, row in enumerate(cluster_df.itertuples(), 1):
        msg = {
            "message_id": row.message_id,
            "channel": row.full_path,
            "time": row.start_time.strftime("%Y-%m-%d %H:%M"),
            "content": row.combined_content,
        }
        messages.append(msg)

        # メッセージ部分のテキスト構築
        message_parts.extend(
            [
                f"### メッセージ {i}",
                f"- ID: `{msg['message_id']}`",
                f"- チャネル: {msg['channel']}",
                f"- 日時: {msg['time']}",
                "- 内容:",
                "```",
                msg["content"],
                "```",
                "",
            ]
        )

    # テンプレートに値を埋め込み
    prompt_text = template.format(
        cluster_id=cluster_id,
        message_count=len(messages),
        period_start=cluster_df["start_time"].min().strftime("%Y-%m-%d"),
        period_end=cluster_df["start_time"].max().strftime("%Y-%m-%d"),
        messages="\n".join(message_parts),
    )

    return {
        "cluster_id": cluster_id,
        "message_count": len(messages),
        "prompt": prompt_text,
        "messages": messages,
    }


def preprocess_extract_json_from_response(text: str) -> Optional[List[Dict]]:
    """
    【前処理】レスポンステキストからJSONを抽出してパース

    Args:
        text: Gemini APIのレスポンステキスト

    Returns:
        パースされたJSON（リスト）またはNone
    """
    text = text.strip()

    # ```json ... ``` ブロックを探す
    if "```json" in text:
        start = text.find("```json") + 7
        end = text.find("```", start)
        json_text = text[start:end].strip()
    elif "```" in text:
        start = text.find("```") + 3
        end = text.find("```", start)
        json_text = text[start:end].strip()
    else:
        json_text = text

    # JSONパース
    try:
        result = json.loads(json_text)
        if not isinstance(result, list):
            return None
        return result
    except json.JSONDecodeError:
        return None


def postprocess_enrich_and_save_intents(
    raw_response_text: str, cluster_id: int, message_metadata: Dict[str, Dict]
) -> Optional[List[Dict]]:
    """
    【後処理】生レスポンスからJSONを抽出し、メッセージメタデータを補完して保存

    Args:
        raw_response_text: Gemini APIの生レスポンス
        cluster_id: クラスタID
        message_metadata: msg_id -> {full_path, min_start_timestamp} のマッピング

    Returns:
        処理後の意図リスト、またはNone
    """
    # JSONをパース（前処理）
    intents = preprocess_extract_json_from_response(raw_response_text)
    if intents is None:
        return None

    # 各意図にメタデータを追加
    for intent in intents:
        # cluster_idを追加（int64 -> int 変換）
        intent["cluster_id"] = int(cluster_id)

        source_ids = intent.get("source_message_ids", [])
        if not source_ids:
            continue

        # source_message_idsに対応するfull_pathとmin_start_timestampを集約
        full_paths = []
        timestamps = []

        for msg_id in source_ids:
            metadata = message_metadata.get(msg_id, {})
            full_path = metadata.get("full_path")
            timestamp = metadata.get("min_start_timestamp")

            if full_path:
                full_paths.append(full_path)
            if timestamp:
                timestamps.append(timestamp)

        # ユニークなfull_pathのリスト
        intent["source_full_paths"] = list(set(full_paths)) if full_paths else []

        # 最小のタイムスタンプ
        intent["min_start_timestamp"] = min(timestamps) if timestamps else None

    # 処理後のJSONを保存
    output_file = PROCESSED_DIR / f"cluster_{cluster_id:02d}_processed.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(intents, f, ensure_ascii=False, indent=2)

    return intents


def reassign_uncovered_items(
    existing_groups: List[Dict],
    uncovered_indices: set,
    original_items: List[Dict],
    reassignment_template: str,
    cluster_id: Optional[int] = None,
    save_raw: bool = False,
    level_name: str = "intent",
    max_retries: int = 3,
) -> List[Dict]:
    """
    【再割り振り】未カバーの項目を既存グループに追加または新規グループを作成

    Args:
        existing_groups: 既存のグループ（meta_intents, super_intents, ultra_intentsなど）
        uncovered_indices: 未カバーのインデックスのセット
        original_items: 元の項目リスト（intents, meta_intents, super_intentsなど）
        reassignment_template: 再割り振り用テンプレート
        cluster_id: クラスタID（オプション、クラスタ横断の場合はNone）
        save_raw: 生レスポンス保存フラグ
        level_name: レベル名（"meta", "super", "ultra"など、デバッグ用）
        max_retries: 最大試行回数

    Returns:
        更新されたグループのリスト
    """
    if not uncovered_indices:
        return existing_groups

    retry_count = 0
    current_uncovered = uncovered_indices.copy()

    while current_uncovered and retry_count < max_retries:
        retry_count += 1
        print(
            f"\n🔄 再割り振り試行 {retry_count}/{max_retries} - {len(current_uncovered)}件の未カバー項目"
        )

        # 既存グループの要約を作成
        existing_group_texts = []
        for i, group in enumerate(existing_groups):
            group_name_key = (
                "meta_intent"
                if "meta_intent" in group
                else "super_intent"
                if "super_intent" in group
                else "ultra_intent"
            )
            group_name = group.get(group_name_key, f"グループ {i}")

            # グループの既存メンバー数を表示
            member_key = (
                "covered_intent_ids"
                if "covered_intent_ids" in group
                else "covered_meta_intent_indices"
                if "covered_meta_intent_indices" in group
                else "covered_super_intent_indices"
                if "covered_super_intent_indices" in group
                else "member_indices"
            )
            existing_members = group.get(member_key, [])
            existing_group_texts.append(
                f"{i}. {group_name} (既存メンバー: {len(existing_members)}件)"
            )

        existing_groups_summary = "\n".join(existing_group_texts)

        # 未カバー項目の詳細を作成
        uncovered_item_texts = []
        uncovered_list = sorted(current_uncovered)

        for i, original_idx in enumerate(uncovered_list):
            if original_idx >= len(original_items):
                continue

            item = original_items[original_idx]
            parts = [f"{i}."]

            # 項目の主要情報を構築
            if "meta_intent" in item:
                parts.append(f"【意図】{item.get('meta_intent', '（未定義）')}")
            elif "super_intent" in item:
                parts.append(f"【意図】{item.get('super_intent', '（未定義）')}")
            elif "ultra_intent" in item:
                parts.append(f"【意図】{item.get('ultra_intent', '（未定義）')}")
            else:
                intent_text = (
                    item.get("intent") or item.get("description") or "（未定義）"
                )
                parts.append(f"【意図】{intent_text}")

            # objective_facts
            if item.get("objective_facts"):
                parts.append(f"【客観的事実】{item['objective_facts']}")

            # context
            if item.get("context"):
                parts.append(f"【背景】{item['context']}")

            uncovered_item_texts.append(" ".join(parts))

        uncovered_items_text = "\n\n".join(uncovered_item_texts)
        max_index = len(uncovered_list) - 1

        # プロンプトを生成
        prompt_text = reassignment_template.format(
            existing_groups=existing_groups_summary,
            uncovered_items=uncovered_items_text,
            max_index=max_index,
        )

        # API呼び出し
        try:
            model = gemini_client.GenerativeModel()
            response = model.generate_content(prompt_text)
            response_text = response.text

        except Exception as e:
            print(f"\n❌ 再割り振りでエラー発生: {type(e).__name__}: {e}")
            break

        # 生のレスポンスを保存（オプション）
        if save_raw:
            raw_output_dir = OUTPUT_DIR / f"raw_reassignment_{level_name}_responses"
            raw_output_dir.mkdir(exist_ok=True)
            cluster_suffix = (
                f"_cluster_{cluster_id:02d}" if cluster_id is not None else ""
            )
            raw_file = (
                raw_output_dir / f"reassignment{cluster_suffix}_retry{retry_count}.txt"
            )
            with open(raw_file, "w", encoding="utf-8") as f:
                f.write(response_text)

        # JSONをパース
        reassignments = preprocess_extract_json_from_response(response_text)
        if reassignments is None:
            print(f"\n⚠️ 再割り振り {retry_count}回目でJSONパース失敗")
            break

        # 再割り振り結果を既存グループに統合
        newly_covered = set()

        for reassignment in reassignments:
            member_indices = reassignment.get("member_indices", [])

            # 未カバーリスト内のインデックスを元のインデックスに変換
            original_indices = [
                uncovered_list[idx]
                for idx in member_indices
                if idx < len(uncovered_list)
            ]

            if not original_indices:
                continue

            # グループ名が既存グループと一致するか確認
            group_name = reassignment.get("group_name", "")
            matched_existing_group = None
            matched_group_name_key = None

            for existing_group in existing_groups:
                current_group_name_key = (
                    "meta_intent"
                    if "meta_intent" in existing_group
                    else "super_intent"
                    if "super_intent" in existing_group
                    else "ultra_intent"
                )
                existing_name = existing_group.get(current_group_name_key, "")
                if group_name in existing_name or existing_name in group_name:
                    matched_existing_group = existing_group
                    matched_group_name_key = current_group_name_key
                    break

            # グループ名キーの決定（既存グループから推測）
            if not matched_group_name_key:
                # 既存グループから推測
                if existing_groups:
                    first_group = existing_groups[0]
                    matched_group_name_key = (
                        "meta_intent"
                        if "meta_intent" in first_group
                        else "super_intent"
                        if "super_intent" in first_group
                        else "ultra_intent"
                    )
                else:
                    matched_group_name_key = "meta_intent"  # デフォルト

            if matched_existing_group:
                # 既存グループに追加
                member_key = (
                    "covered_intent_ids"
                    if "covered_intent_ids" in matched_existing_group
                    else "covered_meta_intent_indices"
                    if "covered_meta_intent_indices" in matched_existing_group
                    else "covered_super_intent_indices"
                    if "covered_super_intent_indices" in matched_existing_group
                    else "member_indices"
                )

                # covered_intent_idsの場合は特殊処理
                if member_key == "covered_intent_ids":
                    for idx in original_indices:
                        if (
                            idx < len(original_items)
                            and "cluster_id" in original_items[idx]
                        ):
                            matched_existing_group[member_key].append(
                                {
                                    "cluster_id": int(
                                        original_items[idx]["cluster_id"]
                                    ),
                                    "intent_index": idx,
                                }
                            )
                else:
                    matched_existing_group[member_key].extend(original_indices)

                newly_covered.update(original_indices)
            else:
                # 新しいグループを作成
                # 既存グループからmember_keyを推測
                if existing_groups:
                    first_group = existing_groups[0]
                    if "covered_intent_ids" in first_group:
                        member_key = "covered_intent_ids"
                    elif "covered_meta_intent_indices" in first_group:
                        member_key = "covered_meta_intent_indices"
                    elif "covered_super_intent_indices" in first_group:
                        member_key = "covered_super_intent_indices"
                    else:
                        member_key = "member_indices"
                else:
                    # 既存グループがない場合は、group_name_keyから推測
                    member_key = (
                        "covered_intent_ids"
                        if matched_group_name_key == "meta_intent"
                        else "covered_meta_intent_indices"
                        if matched_group_name_key == "super_intent"
                        else "covered_super_intent_indices"
                        if matched_group_name_key == "ultra_intent"
                        else "member_indices"
                    )

                # covered_intent_idsの場合は特殊処理
                if member_key == "covered_intent_ids":
                    member_values = [
                        {
                            "cluster_id": int(original_items[idx]["cluster_id"]),
                            "intent_index": idx,
                        }
                        for idx in original_indices
                        if idx < len(original_items)
                        and "cluster_id" in original_items[idx]
                    ]
                else:
                    member_values = original_indices

                new_group = {
                    matched_group_name_key: group_name,
                    "objective_facts": reassignment.get("objective_facts", ""),
                    "context": reassignment.get("context", ""),
                    member_key: member_values,
                }
                existing_groups.append(new_group)
                newly_covered.update(original_indices)

        # 次の試行のために未カバーを更新
        current_uncovered -= newly_covered

        if not newly_covered:
            print(
                f"\n⚠️ 再割り振り {retry_count}回目で新たにカバーされた項目がありません"
            )
            break

        print(f"✓ {len(newly_covered)}件を再割り振りしました")

    if current_uncovered:
        print(
            f"\n⚠️ {len(current_uncovered)}件の項目が最終的にカバーされませんでした: {sorted(current_uncovered)}"
        )

    return existing_groups


def call_gemini_api_with_postprocess(
    prompt_text: str,
    cluster_id: int,
    message_metadata: Dict[str, Dict],
    save_raw: bool = False,
) -> Optional[List[Dict]]:
    """
    【API呼び出し + 後処理】Gemini APIを使って意図を抽出

    Args:
        prompt_text: 意図抽出プロンプト
        cluster_id: クラスタID
        message_metadata: msg_id -> {full_path, min_start_timestamp} のマッピング
        save_raw: 生のレスポンスをファイルに保存するか

    Returns:
        抽出された意図オブジェクトのリスト（エラー時はNone）
    """
    # API呼び出し（litellm側でキャッシュされる）
    try:
        model = gemini_client.GenerativeModel()
        response = model.generate_content(prompt_text)
        response_text = response.text

    except Exception as e:
        # 並列実行時のログ出力はtqdmのpbar.writeではなく通常のprintを使用
        print(f"\n❌ クラスタ {cluster_id} でエラー発生: {type(e).__name__}: {e}")
        raise

    # 生のレスポンスを保存（オプション）
    if save_raw:
        raw_output_dir = OUTPUT_DIR / "raw_responses"
        raw_output_dir.mkdir(exist_ok=True)
        raw_file = raw_output_dir / f"cluster_{cluster_id:02d}_raw_response.txt"
        with open(raw_file, "w", encoding="utf-8") as f:
            f.write(response_text)

    # 後処理を実行
    intents = postprocess_enrich_and_save_intents(
        response_text, cluster_id, message_metadata
    )

    return intents


def aggregate_intents_with_gemini(
    intents: List[Dict], cluster_id: int, grouping_template: str, save_raw: bool = False
) -> Optional[List[Dict]]:
    """
    【上位意図抽出】既存の意図リストから上位意図を抽出

    Args:
        intents: 既存の意図オブジェクトのリスト
        cluster_id: クラスタID
        grouping_template: 意図グループ化テンプレート
        save_raw: 生のレスポンスをファイルに保存するか

    Returns:
        上位意図オブジェクトのリスト（エラー時はNone）
    """
    if not intents:
        return None

    # LLMには意図の全プロパティ（ID系以外）を渡す
    intent_texts = []
    excluded_keys = {"source_message_ids", "cluster_id"}

    for i, intent in enumerate(intents):
        # 意図の主要情報を構築
        parts = [f"{i}."]

        # intent フィールド（必須）
        intent_text = intent.get("intent") or intent.get("description") or "（未定義）"
        parts.append(f"【意図】{intent_text}")

        # その他のプロパティを追加
        for key, value in intent.items():
            if key in excluded_keys or key in ("intent", "description"):
                continue

            if value:  # 値がある場合のみ追加
                if isinstance(value, list):
                    if value:  # 空リストでない場合
                        parts.append(f"【{key}】{', '.join(str(v) for v in value)}")
                else:
                    parts.append(f"【{key}】{value}")

        intent_texts.append(" ".join(parts))

    intent_list = "\n\n".join(intent_texts)
    max_index = len(intents) - 1

    # テンプレートに値を埋め込み
    prompt_text = grouping_template.format(intent_list=intent_list, max_index=max_index)

    # API呼び出し（litellm側でキャッシュされる）
    try:
        model = gemini_client.GenerativeModel()
        response = model.generate_content(prompt_text)
        response_text = response.text

    except Exception as e:
        print(
            f"\n❌ クラスタ {cluster_id} の上位意図抽出でエラー発生: {type(e).__name__}: {e}"
        )
        return None

    # 生のレスポンスを保存（オプション）
    if save_raw:
        raw_output_dir = OUTPUT_DIR / "raw_aggregation_responses"
        raw_output_dir.mkdir(exist_ok=True)
        raw_file = raw_output_dir / f"cluster_{cluster_id:02d}_aggregation_raw.txt"
        with open(raw_file, "w", encoding="utf-8") as f:
            f.write(response_text)

    # JSONをパース（LLMからのグループ情報）
    groups = preprocess_extract_json_from_response(response_text)
    if groups is None:
        print(f"\n⚠️ クラスタ {cluster_id} の意図グループ化でJSONパース失敗")
        return None

    # Pythonで網羅性と重複をチェック
    covered_indices = set()
    for group in groups:
        member_indices = group.get("member_indices", [])
        covered_indices.update(member_indices)

    all_indices = set(range(len(intents)))
    uncovered = all_indices - covered_indices

    if uncovered:
        print(
            f"\n⚠️ クラスタ {cluster_id} のグループ化が全ての個別意図をカバーしていません"
        )
        print(f"   カバーされていないインデックス: {sorted(uncovered)}")
        print(
            f"   Total: {len(intents)}, Covered: {len(covered_indices)}, Uncovered: {len(uncovered)}"
        )

        # 再割り振りテンプレートを読み込み
        try:
            reassignment_template = load_reassignment_template()

            # 未カバーの意図を再割り振り
            groups = reassign_uncovered_items(
                existing_groups=groups,
                uncovered_indices=uncovered,
                original_items=intents,
                reassignment_template=reassignment_template,
                cluster_id=cluster_id,
                save_raw=save_raw,
                level_name="meta",
                max_retries=3,
            )

            # 再割り振り後、covered_indicesを再計算
            covered_indices = set()
            for group in groups:
                member_indices = group.get("member_indices", [])
                covered_indices.update(member_indices)

            uncovered = all_indices - covered_indices
            if not uncovered:
                print(
                    f"✓ クラスタ {cluster_id} の全ての個別意図が再割り振りでカバーされました"
                )

        except Exception as e:
            print(f"\n⚠️ 再割り振り処理でエラー発生: {type(e).__name__}: {e}")

    # 重複チェック
    duplicate_check = []
    for group in groups:
        duplicate_check.extend(group.get("member_indices", []))

    if len(duplicate_check) != len(set(duplicate_check)):
        duplicates = [idx for idx in duplicate_check if duplicate_check.count(idx) > 1]
        duplicate_set = set(duplicates)
        print(
            f"\n⚠️ クラスタ {cluster_id} で重複するインデックスが検出されました: {duplicate_set}"
        )

        # 重複項目をすべてのグループから削除
        for group in groups:
            original_indices = group.get("member_indices", [])
            group["member_indices"] = [
                idx for idx in original_indices if idx not in duplicate_set
            ]

        # 再割り振りテンプレートを読み込んで再判定
        try:
            reassignment_template = load_reassignment_template()

            # 重複項目を再割り振り
            groups = reassign_uncovered_items(
                existing_groups=groups,
                uncovered_indices=duplicate_set,
                original_items=intents,
                reassignment_template=reassignment_template,
                cluster_id=cluster_id,
                save_raw=save_raw,
                level_name="meta_duplicate",
                max_retries=3,
            )

            print("✓ 重複項目を再割り振りしました")

        except Exception as e:
            print(f"\n⚠️ 重複項目の再割り振り処理でエラー発生: {type(e).__name__}: {e}")

    # Pythonでmeta_intentオブジェクトを構築
    meta_intents = []
    for group in groups:
        member_indices = group.get("member_indices", [])

        # statusを決定（最も進んでいないステータス）
        statuses = [
            intents[idx].get("status", "idea")
            for idx in member_indices
            if idx < len(intents)
        ]
        status_priority = {"idea": 0, "todo": 1, "doing": 2, "done": 3}
        aggregate_status = (
            min(statuses, key=lambda s: status_priority.get(s, 0))
            if statuses
            else "idea"
        )

        # グローバル一意な個別意図IDリストを構築
        covered_intent_ids = [
            {"cluster_id": int(cluster_id), "intent_index": idx}
            for idx in member_indices
            if idx < len(intents)
        ]

        # source_full_paths を集約（全個別意図から収集してユニーク化）
        aggregated_full_paths = []
        for idx in member_indices:
            if idx < len(intents):
                paths = intents[idx].get("source_full_paths", [])
                aggregated_full_paths.extend(paths)
        aggregated_full_paths = sorted(set(aggregated_full_paths))

        # min_start_timestamp を集約（全個別意図から最小値を取得）
        timestamps = []
        for idx in member_indices:
            if idx < len(intents):
                ts = intents[idx].get("min_start_timestamp")
                if ts:
                    timestamps.append(ts)
        aggregated_min_timestamp = min(timestamps) if timestamps else None

        meta_intent = {
            "meta_intent": group.get("group_name", "（未定義）"),
            "objective_facts": group.get("objective_facts", ""),
            "context": group.get("context", ""),
            "covered_intent_ids": covered_intent_ids,
            "source_full_paths": aggregated_full_paths,
            "min_start_timestamp": aggregated_min_timestamp,
            "aggregate_status": aggregate_status,
        }
        meta_intents.append(meta_intent)

    # 上位意図を保存
    output_file = AGGREGATED_DIR / f"cluster_{cluster_id:02d}_aggregated.json"
    aggregation_result = {
        "cluster_id": int(cluster_id),
        "original_intents_count": len(intents),
        "meta_intents": meta_intents,
        "original_intents": intents,
        "validation": {
            "total_intents": len(intents),
            "covered_intents": len(covered_indices),
            "uncovered_intents": len(uncovered),
            "uncovered_indices": sorted(uncovered) if uncovered else [],
            "has_duplicates": len(duplicate_check) != len(set(duplicate_check)),
        },
    }

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(aggregation_result, f, ensure_ascii=False, indent=2)

    return meta_intents


def collect_all_meta_intents(cluster_ids: List[int]) -> tuple[List[Dict], Dict]:
    """
    全クラスタの上位意図を収集

    Args:
        cluster_ids: 処理済みクラスタIDのリスト

    Returns:
        (全ての上位意図のリスト, 統計情報)
        統計情報には total_individual_intents が含まれる
    """
    all_meta_intents = []
    total_individual_intents = 0

    for cluster_id in cluster_ids:
        aggregated_file = AGGREGATED_DIR / f"cluster_{cluster_id:02d}_aggregated.json"
        if not aggregated_file.exists():
            print(
                f"⚠️ クラスタ {cluster_id} の上位意図ファイルが見つかりません: {aggregated_file}"
            )
            continue

        with open(aggregated_file, "r", encoding="utf-8") as f:
            data = json.load(f)

        meta_intents = data.get("meta_intents", [])
        for meta_intent in meta_intents:
            # クラスタIDを追加
            meta_intent_with_cluster = meta_intent.copy()
            meta_intent_with_cluster["source_cluster_id"] = int(cluster_id)

            # source_full_pathsを安定した順序にソート（キャッシュヒット率向上）
            if "source_full_paths" in meta_intent_with_cluster:
                meta_intent_with_cluster["source_full_paths"] = sorted(
                    meta_intent_with_cluster["source_full_paths"]
                )

            all_meta_intents.append(meta_intent_with_cluster)

        # 個別意図の総数を集計
        total_individual_intents += data.get("original_intents_count", 0)

    # meta_intentsを安定した順序にソート（キャッシュヒット率向上）
    # 1. source_cluster_id（クラスタID）でソート
    # 2. min_start_timestamp（時系列）でソート
    all_meta_intents.sort(
        key=lambda x: (x.get("source_cluster_id", 0), x.get("min_start_timestamp", ""))
    )

    stats = {"total_individual_intents": total_individual_intents}

    return all_meta_intents, stats


def aggregate_cross_cluster_intents(
    meta_intents: List[Dict],
    grouping_template: str,
    total_individual_intents: int,
    save_raw: bool = False,
) -> Optional[List[Dict]]:
    """
    【クラスタ横断上位意図抽出】全クラスタの上位意図からさらに上位の意図を抽出

    Args:
        meta_intents: 全クラスタの上位意図のリスト
        grouping_template: 意図グループ化テンプレート
        total_individual_intents: 全クラスタの個別意図の総数
        save_raw: 生のレスポンスをファイルに保存するか

    Returns:
        クラスタ横断上位意図オブジェクトのリスト（エラー時はNone）
    """
    if not meta_intents:
        return None

    # LLMには簡潔な情報のみ渡す
    intent_texts = []

    for i, meta in enumerate(meta_intents):
        # 意図の主要情報を構築
        parts = [f"{i}."]

        # meta_intent本文（必須）
        meta_text = meta.get("meta_intent") or "（未定義）"
        parts.append(f"【意図】{meta_text}")

        # objective_facts（客観的事実）
        if meta.get("objective_facts"):
            parts.append(f"【客観的事実】{meta['objective_facts']}")

        # context（背景）
        if meta.get("context"):
            parts.append(f"【背景】{meta['context']}")

        # source_full_paths（プロジェクト判断に必要）
        if meta.get("source_full_paths"):
            paths = ", ".join(meta["source_full_paths"])
            parts.append(f"【プロジェクト】{paths}")

        # aggregate_status
        if meta.get("aggregate_status"):
            parts.append(f"【ステータス】{meta['aggregate_status']}")

        intent_texts.append(" ".join(parts))

    intent_list = "\n\n".join(intent_texts)
    max_index = len(meta_intents) - 1

    # テンプレートに値を埋め込み
    prompt_text = grouping_template.format(intent_list=intent_list, max_index=max_index)

    # プロンプトを保存
    prompt_output_file = CROSS_CLUSTER_DIR / "cross_cluster_prompt.md"
    with open(prompt_output_file, "w", encoding="utf-8") as f:
        f.write(prompt_text)

    # API呼び出し（litellm側でキャッシュされる）
    try:
        model = gemini_client.GenerativeModel()
        response = model.generate_content(prompt_text)
        response_text = response.text

    except Exception as e:
        print(f"\n❌ クラスタ横断上位意図抽出でエラー発生: {type(e).__name__}: {e}")
        return None

    # 生のレスポンスを保存（オプション）
    if save_raw:
        raw_output_dir = OUTPUT_DIR / "raw_cross_cluster_responses"
        raw_output_dir.mkdir(exist_ok=True)
        raw_file = raw_output_dir / "cross_cluster_aggregation_raw.txt"
        with open(raw_file, "w", encoding="utf-8") as f:
            f.write(response_text)

    # JSONをパース（LLMからのグループ情報）
    groups = preprocess_extract_json_from_response(response_text)
    if groups is None:
        print("\n⚠️ クラスタ横断意図グループ化でJSONパース失敗")
        return None

    # Pythonで網羅性と重複をチェック
    covered_indices = set()
    for group in groups:
        member_indices = group.get("member_indices", [])
        covered_indices.update(member_indices)

    all_indices = set(range(len(meta_intents)))
    uncovered = all_indices - covered_indices

    if uncovered:
        print("\n⚠️ クラスタ横断グループ化が全てのmeta_intentをカバーしていません")
        print(f"   カバーされていないインデックス: {sorted(uncovered)}")
        print(
            f"   Total: {len(meta_intents)}, Covered: {len(covered_indices)}, Uncovered: {len(uncovered)}"
        )

        # 再割り振りテンプレートを読み込み
        try:
            reassignment_template = load_reassignment_template()

            # 未カバーのmeta_intentを再割り振り
            groups = reassign_uncovered_items(
                existing_groups=groups,
                uncovered_indices=uncovered,
                original_items=meta_intents,
                reassignment_template=reassignment_template,
                cluster_id=None,  # クラスタ横断なのでNone
                save_raw=save_raw,
                level_name="super",
                max_retries=3,
            )

            # 再割り振り後、covered_indicesを再計算
            covered_indices = set()
            for group in groups:
                member_indices = group.get("member_indices", [])
                covered_indices.update(member_indices)

            uncovered = all_indices - covered_indices
            if not uncovered:
                print("✓ 全てのmeta_intentが再割り振りでカバーされました")

        except Exception as e:
            print(f"\n⚠️ 再割り振り処理でエラー発生: {type(e).__name__}: {e}")

    # 重複チェック
    duplicate_check = []
    for group in groups:
        duplicate_check.extend(group.get("member_indices", []))

    if len(duplicate_check) != len(set(duplicate_check)):
        duplicates = [idx for idx in duplicate_check if duplicate_check.count(idx) > 1]
        duplicate_set = set(duplicates)
        print(
            f"\n⚠️ クラスタ横断グループ化で重複するインデックスが検出されました: {duplicate_set}"
        )

        # 重複項目をすべてのグループから削除
        for group in groups:
            original_indices = group.get("member_indices", [])
            group["member_indices"] = [
                idx for idx in original_indices if idx not in duplicate_set
            ]

        # 再割り振りテンプレートを読み込んで再判定
        try:
            reassignment_template = load_reassignment_template()

            # 重複項目を再割り振り
            groups = reassign_uncovered_items(
                existing_groups=groups,
                uncovered_indices=duplicate_set,
                original_items=meta_intents,
                reassignment_template=reassignment_template,
                cluster_id=None,  # クラスタ横断なのでNone
                save_raw=save_raw,
                level_name="super_duplicate",
                max_retries=3,
            )

            print("✓ 重複項目を再割り振りしました")

        except Exception as e:
            print(f"\n⚠️ 重複項目の再割り振り処理でエラー発生: {type(e).__name__}: {e}")

    # Pythonでsuper_intentオブジェクトを構築
    super_intents = []
    for group in groups:
        member_indices = group.get("member_indices", [])

        # statusを決定（最も進んでいないステータス）
        statuses = [
            meta_intents[idx].get("aggregate_status", "idea")
            for idx in member_indices
            if idx < len(meta_intents)
        ]
        status_priority = {"idea": 0, "todo": 1, "doing": 2, "done": 3}
        aggregate_status = (
            min(statuses, key=lambda s: status_priority.get(s, 0))
            if statuses
            else "idea"
        )

        # meta_intentを通じて個別意図のグローバルIDをflatten
        covered_intent_ids_flat = []
        for meta_idx in member_indices:
            if meta_idx < len(meta_intents):
                meta_intent = meta_intents[meta_idx]
                covered_intent_ids_flat.extend(
                    meta_intent.get("covered_intent_ids", [])
                )

        # 重複を除去（dict は hashable でないので tuple で一意化）
        unique_ids = []
        seen = set()
        for intent_id in covered_intent_ids_flat:
            key = (intent_id["cluster_id"], intent_id["intent_index"])
            if key not in seen:
                seen.add(key)
                unique_ids.append(intent_id)

        # cluster_id, intent_index でソート
        covered_intent_ids_flat = sorted(
            unique_ids, key=lambda x: (x["cluster_id"], x["intent_index"])
        )

        # source_full_paths を集約（全meta_intentから収集してユニーク化）
        aggregated_full_paths = []
        for meta_idx in member_indices:
            if meta_idx < len(meta_intents):
                paths = meta_intents[meta_idx].get("source_full_paths", [])
                aggregated_full_paths.extend(paths)
        aggregated_full_paths = sorted(set(aggregated_full_paths))

        # min_start_timestamp を集約（全meta_intentから最小値を取得）
        timestamps = []
        for meta_idx in member_indices:
            if meta_idx < len(meta_intents):
                ts = meta_intents[meta_idx].get("min_start_timestamp")
                if ts:
                    timestamps.append(ts)
        aggregated_min_timestamp = min(timestamps) if timestamps else None

        super_intent = {
            "super_intent": group.get("group_name", "（未定義）"),
            "objective_facts": group.get("objective_facts", ""),
            "context": group.get("context", ""),
            "covered_meta_intent_indices": member_indices,
            "covered_intent_ids_flat": covered_intent_ids_flat,
            "source_full_paths": aggregated_full_paths,
            "min_start_timestamp": aggregated_min_timestamp,
            "aggregate_status": aggregate_status,
        }
        super_intents.append(super_intent)

    # flatten された個別意図IDの網羅性チェック（グローバルIDベース）
    covered_flat_ids = set()
    for super_intent in super_intents:
        for intent_id in super_intent["covered_intent_ids_flat"]:
            covered_flat_ids.add((intent_id["cluster_id"], intent_id["intent_index"]))

    # 全meta_intentsに含まれる個別意図IDを収集
    all_individual_intent_ids = set()
    for meta_intent in meta_intents:
        for intent_id in meta_intent.get("covered_intent_ids", []):
            all_individual_intent_ids.add(
                (intent_id["cluster_id"], intent_id["intent_index"])
            )

    uncovered_flat = all_individual_intent_ids - covered_flat_ids

    if uncovered_flat:
        print(
            "\n⚠️ クラスタ横断グループ化（flatten）が全ての個別意図をカバーしていません"
        )
        print(f"   カバーされていない個別意図ID: {sorted(uncovered_flat)}")
        print(
            f"   Total: {len(all_individual_intent_ids)}, Covered: {len(covered_flat_ids)}, Uncovered: {len(uncovered_flat)}"
        )

    # 重複チェック
    duplicate_flat_ids = []
    for super_intent in super_intents:
        for intent_id in super_intent["covered_intent_ids_flat"]:
            duplicate_flat_ids.append(
                (intent_id["cluster_id"], intent_id["intent_index"])
            )

    if len(duplicate_flat_ids) != len(set(duplicate_flat_ids)):
        dup_set = [x for x in duplicate_flat_ids if duplicate_flat_ids.count(x) > 1]
        print(
            f"\n⚠️ クラスタ横断グループ化（flatten）で重複する個別意図IDが検出されました: {set(dup_set)}"
        )

    # クラスタ横断上位意図を保存
    output_file = CROSS_CLUSTER_DIR / "super_intents.json"
    cross_cluster_result = {
        "generated_at": datetime.now().isoformat(),
        "total_meta_intents": len(meta_intents),
        "total_individual_intents": total_individual_intents,
        "super_intents": super_intents,
        "meta_intents": meta_intents,
        "validation": {
            "meta_level": {
                "total_meta_intents": len(meta_intents),
                "covered_meta_intents": len(covered_indices),
                "uncovered_meta_intents": len(uncovered),
                "uncovered_meta_indices": sorted(uncovered) if uncovered else [],
                "has_duplicates": len(duplicate_check) != len(set(duplicate_check)),
            },
            "individual_level": {
                "total_individual_intents": len(all_individual_intent_ids),
                "covered_individual_intents": len(covered_flat_ids),
                "uncovered_individual_intents": len(uncovered_flat),
                "uncovered_individual_ids": [
                    {"cluster_id": cid, "intent_index": idx}
                    for cid, idx in sorted(uncovered_flat)
                ],
                "has_duplicates": len(duplicate_flat_ids)
                != len(set(duplicate_flat_ids)),
            },
        },
    }

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(cross_cluster_result, f, ensure_ascii=False, indent=2)

    # 詳細展開版も生成（元データは変更しない）
    enrich_and_save_super_intents(cross_cluster_result, output_file.parent)

    return super_intents, meta_intents, total_individual_intents


def load_all_intents_for_enrichment() -> Dict[tuple, Dict]:
    """
    全クラスタの個別 intent を読み込み、グローバルIDでインデックス化

    Returns:
        (cluster_id, intent_index) -> intent詳細 のマッピング
    """
    all_intents = {}

    # 全ての processed ファイルを読み込み
    for processed_file in sorted(PROCESSED_DIR.glob("cluster_*_processed.json")):
        with open(processed_file, "r", encoding="utf-8") as f:
            intents = json.load(f)

        for idx, intent in enumerate(intents):
            cluster_id = intent.get("cluster_id")
            if cluster_id is not None:
                key = (cluster_id, idx)
                all_intents[key] = intent

    return all_intents


def enrich_intents_with_details(
    intents_list: List[Dict],
    all_intents: Dict[tuple, Dict],
    intent_id_key: str = "covered_intent_ids_flat",
) -> List[Dict]:
    """
    意図リストに個別 intent の詳細を展開（コピーを作成して変更）

    Args:
        intents_list: super_intents または ultra_intents のリスト
        all_intents: (cluster_id, intent_index) -> intent詳細 のマッピング
        intent_id_key: 個別意図IDのキー名

    Returns:
        詳細展開された意図リスト（新規コピー）
    """
    enriched_list = []

    for intent in intents_list:
        # コピーを作成（元データを変更しない）
        enriched_intent = intent.copy()
        covered_ids = intent.get(intent_id_key, [])

        # 個別 intent の詳細を収集
        covered_intents_details = []
        missing_ids = []

        for intent_id in covered_ids:
            cluster_id = intent_id["cluster_id"]
            intent_index = intent_id["intent_index"]
            key = (cluster_id, intent_index)

            intent_detail = all_intents.get(key)
            if intent_detail:
                covered_intents_details.append(intent_detail)
            else:
                missing_ids.append(intent_id)

        # 詳細情報を追加（コピーに対して）
        enriched_intent["covered_intents_details"] = covered_intents_details

        # 統計情報を追加
        enriched_intent["_stats"] = {
            "total_covered": len(covered_ids),
            "resolved": len(covered_intents_details),
            "missing": len(missing_ids),
        }

        if missing_ids:
            enriched_intent["_missing_ids"] = missing_ids

        enriched_list.append(enriched_intent)

    return enriched_list


def save_enriched_intents(
    original_result: Dict,
    enriched_key: str,
    enriched_intents: List[Dict],
    output_file: Path,
    level_name: str = "ultra",
):
    """
    詳細展開版の意図ファイルを保存

    Args:
        original_result: 元の結果データ
        enriched_key: 意図リストのキー名（"ultra_intents" or "super_intents"）
        enriched_intents: 詳細展開された意図リスト
        output_file: 出力ファイルパス
        level_name: レベル名（ログ表示用）
    """
    # 元データをコピーして詳細展開版を作成
    enriched_result = original_result.copy()
    enriched_result[enriched_key] = enriched_intents

    # ファイル保存
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(enriched_result, f, ensure_ascii=False, indent=2)

    print(f"✓ 詳細展開版を保存: {output_file}")

    # 統計表示
    for i, intent in enumerate(enriched_intents, 1):
        stats = intent["_stats"]
        intent_name = intent.get(f"{level_name}_intent", "（未定義）")
        print(f"  {i}. {intent_name}: {stats['total_covered']}件の個別意図")
        if stats["missing"] > 0:
            print(f"     ⚠️ 未解決: {stats['missing']}件")


def enrich_and_save_ultra_intents(ultra_result: Dict, output_dir: Path):
    """
    ultra_intents に個別 intent の詳細を展開して別ファイルに保存

    Args:
        ultra_result: ultra_intents.json の内容（変更されない）
        output_dir: 出力ディレクトリ
    """
    # 全個別 intent を読み込み
    print("\n個別 intent の詳細を展開中...")
    all_intents = load_all_intents_for_enrichment()
    print(f"✓ {len(all_intents)}件の個別 intent を読み込みました")

    # ultra_intents を詳細展開（コピーを作成）
    ultra_intents = ultra_result.get("ultra_intents", [])
    enriched_ultra_intents = enrich_intents_with_details(
        ultra_intents, all_intents, "covered_intent_ids_flat"
    )

    # 詳細展開版を別ファイルに保存
    enriched_file = output_dir / "ultra_intents_enriched.json"
    save_enriched_intents(
        ultra_result, "ultra_intents", enriched_ultra_intents, enriched_file, "ultra"
    )


def enrich_and_save_super_intents(super_result: Dict, output_dir: Path):
    """
    super_intents に個別 intent の詳細を展開して別ファイルに保存

    Args:
        super_result: super_intents.json の内容（変更されない）
        output_dir: 出力ディレクトリ
    """
    # 全個別 intent を読み込み
    print("\n個別 intent の詳細を展開中...")
    all_intents = load_all_intents_for_enrichment()
    print(f"✓ {len(all_intents)}件の個別 intent を読み込みました")

    # super_intents を詳細展開（コピーを作成）
    super_intents = super_result.get("super_intents", [])
    enriched_super_intents = enrich_intents_with_details(
        super_intents, all_intents, "covered_intent_ids_flat"
    )

    # 詳細展開版を別ファイルに保存
    enriched_file = output_dir / "super_intents_enriched.json"
    save_enriched_intents(
        super_result, "super_intents", enriched_super_intents, enriched_file, "super"
    )


def aggregate_super_intents_recursively(
    super_intents: List[Dict],
    meta_intents: List[Dict],
    total_individual_intents: int,
    grouping_template: str,
    save_raw: bool = False,
) -> Optional[List[Dict]]:
    """
    【2段階目の抽象化】super_intentsが50件以上の場合、さらに抽象化

    Args:
        super_intents: 1段階目のsuper_intentsリスト
        meta_intents: 元のmeta_intentsリスト（参照用）
        total_individual_intents: 個別意図の総数
        grouping_template: 意図グループ化テンプレート
        save_raw: 生のレスポンスをファイルに保存するか

    Returns:
        最終的な上位意図オブジェクトのリスト（エラー時はNone）
    """
    if not super_intents or len(super_intents) < 10:
        return None

    print(
        f"\n📊 super_intentsが{len(super_intents)}件あるため、さらに抽象化を実行します"
    )

    # LLMには簡潔な情報のみ渡す（meta_intentsと同じ形式）
    intent_texts = []

    for i, super_intent in enumerate(super_intents):
        # 意図の主要情報を構築
        parts = [f"{i}."]

        # super_intent本文（必須）
        super_text = super_intent.get("super_intent") or "（未定義）"
        parts.append(f"【意図】{super_text}")

        # objective_facts（客観的事実）
        if super_intent.get("objective_facts"):
            parts.append(f"【客観的事実】{super_intent['objective_facts']}")

        # context（背景）
        if super_intent.get("context"):
            parts.append(f"【背景】{super_intent['context']}")

        # source_full_paths（プロジェクト判断に必要）
        if super_intent.get("source_full_paths"):
            paths = ", ".join(super_intent["source_full_paths"])
            parts.append(f"【プロジェクト】{paths}")

        # aggregate_status
        if super_intent.get("aggregate_status"):
            parts.append(f"【ステータス】{super_intent['aggregate_status']}")

        intent_texts.append(" ".join(parts))

    intent_list = "\n\n".join(intent_texts)
    max_index = len(super_intents) - 1

    # テンプレートに値を埋め込み
    prompt_text = grouping_template.format(intent_list=intent_list, max_index=max_index)

    # プロンプトを保存
    prompt_output_file = CROSS_CLUSTER_DIR / "ultra_intent_prompt.md"
    with open(prompt_output_file, "w", encoding="utf-8") as f:
        f.write(prompt_text)

    # API呼び出し（litellm側でキャッシュされる）
    try:
        model = gemini_client.GenerativeModel()
        response = model.generate_content(prompt_text)
        response_text = response.text

    except Exception as e:
        print(f"\n❌ 2段階目の抽象化でエラー発生: {type(e).__name__}: {e}")
        return None

    # 生のレスポンスを保存（オプション）
    if save_raw:
        raw_output_dir = OUTPUT_DIR / "raw_ultra_intent_responses"
        raw_output_dir.mkdir(exist_ok=True)
        raw_file = raw_output_dir / "ultra_intent_raw.txt"
        with open(raw_file, "w", encoding="utf-8") as f:
            f.write(response_text)

    # JSONをパース（LLMからのグループ情報）
    groups = preprocess_extract_json_from_response(response_text)
    if groups is None:
        print("\n⚠️ 2段階目の抽象化でJSONパース失敗")
        return None

    # Pythonで網羅性と重複をチェック
    covered_indices = set()
    for group in groups:
        member_indices = group.get("member_indices", [])
        covered_indices.update(member_indices)

    all_indices = set(range(len(super_intents)))
    uncovered = all_indices - covered_indices

    if uncovered:
        print("\n⚠️ 2段階目の抽象化が全てのsuper_intentをカバーしていません")
        print(f"   カバーされていないインデックス: {sorted(uncovered)}")
        print(
            f"   Total: {len(super_intents)}, Covered: {len(covered_indices)}, Uncovered: {len(uncovered)}"
        )

        # 再割り振りテンプレートを読み込み
        try:
            reassignment_template = load_reassignment_template()

            # 未カバーのsuper_intentを再割り振り
            groups = reassign_uncovered_items(
                existing_groups=groups,
                uncovered_indices=uncovered,
                original_items=super_intents,
                reassignment_template=reassignment_template,
                cluster_id=None,  # クラスタ横断なのでNone
                save_raw=save_raw,
                level_name="ultra",
                max_retries=3,
            )

            # 再割り振り後、covered_indicesを再計算
            covered_indices = set()
            for group in groups:
                member_indices = group.get("member_indices", [])
                covered_indices.update(member_indices)

            uncovered = all_indices - covered_indices
            if not uncovered:
                print("✓ 全てのsuper_intentが再割り振りでカバーされました")

        except Exception as e:
            print(f"\n⚠️ 再割り振り処理でエラー発生: {type(e).__name__}: {e}")

    # 重複チェック
    duplicate_check = []
    for group in groups:
        duplicate_check.extend(group.get("member_indices", []))

    if len(duplicate_check) != len(set(duplicate_check)):
        duplicates = [idx for idx in duplicate_check if duplicate_check.count(idx) > 1]
        duplicate_set = set(duplicates)
        print(
            f"\n⚠️ 2段階目の抽象化で重複するインデックスが検出されました: {duplicate_set}"
        )

        # 重複項目をすべてのグループから削除
        for group in groups:
            original_indices = group.get("member_indices", [])
            group["member_indices"] = [
                idx for idx in original_indices if idx not in duplicate_set
            ]

        # 再割り振りテンプレートを読み込んで再判定
        try:
            reassignment_template = load_reassignment_template()

            # 重複項目を再割り振り
            groups = reassign_uncovered_items(
                existing_groups=groups,
                uncovered_indices=duplicate_set,
                original_items=super_intents,
                reassignment_template=reassignment_template,
                cluster_id=None,  # クラスタ横断なのでNone
                save_raw=save_raw,
                level_name="ultra_duplicate",
                max_retries=3,
            )

            print("✓ 重複項目を再割り振りしました")

        except Exception as e:
            print(f"\n⚠️ 重複項目の再割り振り処理でエラー発生: {type(e).__name__}: {e}")

    # Pythonでultra_intentオブジェクトを構築
    ultra_intents = []
    for group in groups:
        member_indices = group.get("member_indices", [])

        # statusを決定（最も進んでいないステータス）
        statuses = [
            super_intents[idx].get("aggregate_status", "idea")
            for idx in member_indices
            if idx < len(super_intents)
        ]
        status_priority = {"idea": 0, "todo": 1, "doing": 2, "done": 3}
        aggregate_status = (
            min(statuses, key=lambda s: status_priority.get(s, 0))
            if statuses
            else "idea"
        )

        # super_intentを通じて個別意図のグローバルIDをflatten
        covered_intent_ids_flat = []
        for super_idx in member_indices:
            if super_idx < len(super_intents):
                super_intent = super_intents[super_idx]
                covered_intent_ids_flat.extend(
                    super_intent.get("covered_intent_ids_flat", [])
                )

        # 重複を除去（dict は hashable でないので tuple で一意化）
        unique_ids = []
        seen = set()
        for intent_id in covered_intent_ids_flat:
            key = (intent_id["cluster_id"], intent_id["intent_index"])
            if key not in seen:
                seen.add(key)
                unique_ids.append(intent_id)

        # cluster_id, intent_index でソート
        covered_intent_ids_flat = sorted(
            unique_ids, key=lambda x: (x["cluster_id"], x["intent_index"])
        )

        # source_full_paths を集約（全super_intentから収集してユニーク化）
        aggregated_full_paths = []
        for super_idx in member_indices:
            if super_idx < len(super_intents):
                paths = super_intents[super_idx].get("source_full_paths", [])
                aggregated_full_paths.extend(paths)
        aggregated_full_paths = sorted(set(aggregated_full_paths))

        # min_start_timestamp を集約（全super_intentから最小値を取得）
        timestamps = []
        for super_idx in member_indices:
            if super_idx < len(super_intents):
                ts = super_intents[super_idx].get("min_start_timestamp")
                if ts:
                    timestamps.append(ts)
        aggregated_min_timestamp = min(timestamps) if timestamps else None

        ultra_intent = {
            "ultra_intent": group.get("group_name", "（未定義）"),
            "objective_facts": group.get("objective_facts", ""),
            "context": group.get("context", ""),
            "covered_super_intent_indices": member_indices,
            "covered_intent_ids_flat": covered_intent_ids_flat,
            "source_full_paths": aggregated_full_paths,
            "min_start_timestamp": aggregated_min_timestamp,
            "aggregate_status": aggregate_status,
        }
        ultra_intents.append(ultra_intent)

    # flatten された個別意図IDの網羅性チェック（グローバルIDベース）
    covered_flat_ids = set()
    for ultra_intent in ultra_intents:
        for intent_id in ultra_intent["covered_intent_ids_flat"]:
            covered_flat_ids.add((intent_id["cluster_id"], intent_id["intent_index"]))

    # 全super_intentsに含まれる個別意図IDを収集
    all_individual_intent_ids = set()
    for super_intent in super_intents:
        for intent_id in super_intent.get("covered_intent_ids_flat", []):
            all_individual_intent_ids.add(
                (intent_id["cluster_id"], intent_id["intent_index"])
            )

    uncovered_flat = all_individual_intent_ids - covered_flat_ids

    if uncovered_flat:
        print("\n⚠️ 2段階目の抽象化（flatten）が全ての個別意図をカバーしていません")
        print(f"   カバーされていない個別意図ID: {sorted(uncovered_flat)}")
        print(
            f"   Total: {len(all_individual_intent_ids)}, Covered: {len(covered_flat_ids)}, Uncovered: {len(uncovered_flat)}"
        )

    # 重複チェック
    duplicate_flat_ids = []
    for ultra_intent in ultra_intents:
        for intent_id in ultra_intent["covered_intent_ids_flat"]:
            duplicate_flat_ids.append(
                (intent_id["cluster_id"], intent_id["intent_index"])
            )

    if len(duplicate_flat_ids) != len(set(duplicate_flat_ids)):
        dup_set = [x for x in duplicate_flat_ids if duplicate_flat_ids.count(x) > 1]
        print(
            f"\n⚠️ 2段階目の抽象化（flatten）で重複する個別意図IDが検出されました: {set(dup_set)}"
        )

    # 最終結果を保存
    output_file = CROSS_CLUSTER_DIR / "ultra_intents.json"
    ultra_result = {
        "generated_at": datetime.now().isoformat(),
        "total_super_intents": len(super_intents),
        "total_meta_intents": len(meta_intents),
        "total_individual_intents": total_individual_intents,
        "ultra_intents": ultra_intents,
        "super_intents": super_intents,
        "validation": {
            "super_level": {
                "total_super_intents": len(super_intents),
                "covered_super_intents": len(covered_indices),
                "uncovered_super_intents": len(uncovered),
                "uncovered_super_indices": sorted(uncovered) if uncovered else [],
                "has_duplicates": len(duplicate_check) != len(set(duplicate_check)),
            },
            "individual_level": {
                "total_individual_intents": len(all_individual_intent_ids),
                "covered_individual_intents": len(covered_flat_ids),
                "uncovered_individual_intents": len(uncovered_flat),
                "uncovered_individual_ids": [
                    {"cluster_id": cid, "intent_index": idx}
                    for cid, idx in sorted(uncovered_flat)
                ],
                "has_duplicates": len(duplicate_flat_ids)
                != len(set(duplicate_flat_ids)),
            },
        },
    }

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(ultra_result, f, ensure_ascii=False, indent=2)

    # 詳細展開版も生成（元データは変更しない）
    enrich_and_save_ultra_intents(ultra_result, output_file.parent)

    return ultra_intents


def main():
    """メイン処理"""
    # コマンドライン引数をパース
    parser = argparse.ArgumentParser(
        description="クラスタごとの意図抽出プロンプトを生成し、オプションでGemini APIによる意図抽出を実行"
    )
    parser.add_argument(
        "--gemini",
        action="store_true",
        help="Gemini APIで意図抽出を実行してレビュー用HTMLを生成",
    )
    parser.add_argument(
        "--cluster",
        type=int,
        help="特定のクラスタIDのみ処理（指定しない場合は全クラスタ）",
    )
    parser.add_argument(
        "--save-raw",
        action="store_true",
        help="Gemini APIの生レスポンスをファイルに保存（デバッグ用）",
    )
    parser.add_argument(
        "--aggregate",
        action="store_true",
        help="抽出した意図から上位意図を生成（--gemini オプションと併用）",
    )
    parser.add_argument(
        "--aggregate-all",
        action="store_true",
        help="全クラスタの上位意図からさらに上位の意図を生成（--gemini --aggregate と併用、--cluster指定時は無効）",
    )
    parser.add_argument(
        "--max-workers",
        type=int,
        default=5,
        help="並列実行の最大ワーカー数（デフォルト: 5）",
    )
    args = parser.parse_args()

    print("=" * 60)
    print("意図抽出プロンプト生成")
    if args.gemini:
        print(f"+ Gemini API で意図抽出を実行（並列数: {args.max_workers}）")
    if args.aggregate:
        if not args.gemini:
            print(
                "❌ エラー: --aggregate オプションは --gemini オプションと併用してください"
            )
            return
        print("+ 上位意図を抽出")
    if args.aggregate_all:
        if not args.gemini or not args.aggregate:
            print(
                "❌ エラー: --aggregate-all オプションは --gemini --aggregate オプションと併用してください"
            )
            return
        if args.cluster is not None:
            print(
                "❌ エラー: --aggregate-all オプションは --cluster オプションと併用できません（全クラスタ処理が必要）"
            )
            return
        print("+ クラスタ横断上位意図を抽出")
    if args.cluster is not None:
        print(f"+ クラスタ {args.cluster} のみ処理")
    if args.save_raw:
        print("+ 生レスポンスを保存")
    print("=" * 60)

    # Gemini API の初期化（--gemini オプション指定時）
    if args.gemini:
        load_dotenv()
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            print("❌ エラー: GEMINI_API_KEY が .env ファイルに設定されていません")
            return
        gemini_client.configure(api_key=api_key)
        print("✓ Gemini API を初期化しました（litellm + diskcacheでキャッシュ有効）")

    # テンプレート読み込み
    print("\nプロンプトテンプレートを読み込み中...")
    try:
        template = load_template()
        print(f"✓ テンプレート読み込み完了: {TEMPLATE_FILE}")
    except FileNotFoundError as e:
        print(f"❌ エラー: {e}")
        return

    # 意図グループ化テンプレート読み込み（--aggregate または --aggregate-all オプション指定時）
    grouping_template = None
    if args.aggregate or args.aggregate_all:
        print("\n意図グループ化テンプレートを読み込み中...")
        try:
            grouping_template = load_grouping_template()
            print(f"✓ テンプレート読み込み完了: {GROUPING_TEMPLATE_FILE}")
        except FileNotFoundError as e:
            print(f"❌ エラー: {e}")
            return

    # データ読み込み
    print("\nクラスタリング結果を読み込み中...")
    df = load_clustered_messages()
    print(f"✓ {len(df)}件のメッセージを読み込みました")

    # メッセージメタデータを構築
    print("\nメッセージメタデータを構築中...")
    message_metadata = build_message_metadata(df)
    print(f"✓ {len(message_metadata)}件のメッセージメタデータを構築しました")

    # クラスタごとにプロンプト生成
    cluster_ids = sorted(df["cluster"].unique())

    # 特定のクラスタのみ処理する場合はフィルタリング
    if args.cluster is not None:
        if args.cluster not in cluster_ids:
            print(f"❌ エラー: クラスタ {args.cluster} は存在しません")
            print(f"利用可能なクラスタID: {cluster_ids}")
            return
        cluster_ids = [args.cluster]

    print(f"\n{len(cluster_ids)}個のクラスタに対してプロンプトを生成します")

    # 既存の結果を読み込み（部分更新の場合）
    all_prompts = []
    # if args.cluster is not None and (OUTPUT_DIR / "generation_summary.json").exists():
    #     # 既存のサマリーから他のクラスタの情報を読み込む
    #     with open(OUTPUT_DIR / "generation_summary.json", 'r', encoding='utf-8') as f:
    #         existing_summary = json.load(f)
    #     # 既存の抽出結果も読み込み（HTML再生成のため）
    #     # ここでは簡略化のため、指定クラスタのみ再生成

    # 並列化する場合の処理関数を定義
    def process_cluster(cluster_id: int) -> Dict:
        """1つのクラスタを処理する関数（並列実行用）"""
        cluster_df = df[df["cluster"] == cluster_id]
        prompt_info = generate_cluster_prompt(cluster_id, cluster_df, template)

        # Gemini APIで意図抽出（オプション指定時）
        if args.gemini:
            intents = call_gemini_api_with_postprocess(
                prompt_info["prompt"],
                cluster_id,
                message_metadata,
                save_raw=args.save_raw,
            )
            prompt_info["extracted_intents"] = intents

            # 上位意図抽出（--aggregate オプション指定時）
            if args.aggregate and intents and grouping_template:
                meta_intents = aggregate_intents_with_gemini(
                    intents, cluster_id, grouping_template, save_raw=args.save_raw
                )
                prompt_info["meta_intents"] = meta_intents

        # 個別ファイルとして保存
        output_file = OUTPUT_DIR / f"cluster_{cluster_id:02d}_prompt.md"
        with open(output_file, "w", encoding="utf-8") as f:
            f.write(prompt_info["prompt"])

        return prompt_info

    # Gemini API使用時は並列実行、それ以外は逐次実行
    if args.gemini:
        progress_desc = "Gemini API で意図抽出中"
        all_prompts = gemini_client.parallel_execute(
            cluster_ids,
            process_cluster,
            max_workers=args.max_workers,
            desc=progress_desc,
            unit="cluster",
        )
    else:
        # プロンプト生成のみの場合は逐次実行（高速なので並列化不要）
        progress_desc = "プロンプト生成中"
        all_prompts = []
        for cluster_id in tqdm(cluster_ids, desc=progress_desc, unit="cluster"):
            prompt_info = process_cluster(cluster_id)
            all_prompts.append(prompt_info)

    # サマリー情報を保存
    summary = {
        "generated_at": datetime.now().isoformat(),
        "total_clusters": int(len(cluster_ids)),
        "total_messages": int(len(df)),
        "clusters": [
            {
                "cluster_id": int(p["cluster_id"]),
                "message_count": int(p["message_count"]),
                "prompt_file": f"cluster_{p['cluster_id']:02d}_prompt.md",
            }
            for p in all_prompts
        ],
    }

    summary_file = OUTPUT_DIR / "generation_summary.json"
    with open(summary_file, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    print(f"\n✓ サマリー情報を保存: {summary_file}")

    # クラスタ横断上位意図抽出（--aggregate-all オプション指定時）
    if args.aggregate_all and grouping_template:
        print("\n" + "=" * 60)
        print("クラスタ横断上位意図抽出")
        print("=" * 60)

        # 全クラスタの上位意図を収集
        print("\n全クラスタの上位意図を収集中...")
        all_meta_intents, stats = collect_all_meta_intents(cluster_ids)
        print(f"✓ {len(all_meta_intents)}件の上位意図を収集しました")
        print(f"✓ {stats['total_individual_intents']}件の個別意図（全クラスタ合計）")

        # クラスタ横断上位意図抽出
        print("\nクラスタ横断上位意図を抽出中...")
        super_intents, meta_intents, total_individual_intents = (
            aggregate_cross_cluster_intents(
                all_meta_intents,
                grouping_template,
                stats["total_individual_intents"],
                save_raw=args.save_raw,
            )
        )

        if super_intents:
            print(f"✓ {len(super_intents)}件のクラスタ横断上位意図を抽出しました")
            for i, super_intent in enumerate(super_intents, 1):
                covered_count = len(super_intent.get("covered_meta_intent_indices", []))
                print(
                    f"  {i}. {super_intent.get('super_intent', '（未定義）')} ({covered_count}件のmeta_intentをカバー)"
                )

            # 2段階目の抽象化（super_intentsが50件以上の場合）
            ultra_intents = aggregate_super_intents_recursively(
                super_intents,
                meta_intents,
                total_individual_intents,
                grouping_template,
                save_raw=args.save_raw,
            )

            if ultra_intents:
                print("\n" + "=" * 60)
                print("最終上位意図抽出結果（ultra_intents）")
                print("=" * 60)
                print(
                    f"\n✓ {len(ultra_intents)}件の最終上位意図（ultra_intents）を抽出しました\n"
                )
                for i, ultra_intent in enumerate(ultra_intents, 1):
                    covered_super_count = len(
                        ultra_intent.get("covered_super_intent_indices", [])
                    )
                    covered_intent_count = len(
                        ultra_intent.get("covered_intent_ids_flat", [])
                    )
                    print(f"【Ultra Intent {i}】")
                    print(f"  意図: {ultra_intent.get('ultra_intent', '（未定義）')}")
                    if ultra_intent.get("objective_facts"):
                        print(f"  客観的事実: {ultra_intent['objective_facts']}")
                    if ultra_intent.get("context"):
                        print(f"  背景: {ultra_intent['context']}")
                    print(
                        f"  カバー範囲: {covered_super_count}件のsuper_intent / {covered_intent_count}件の個別意図"
                    )
                    if ultra_intent.get("source_full_paths"):
                        paths = ", ".join(ultra_intent["source_full_paths"][:3])
                        if len(ultra_intent["source_full_paths"]) > 3:
                            paths += (
                                f" 他{len(ultra_intent['source_full_paths']) - 3}件"
                            )
                        print(f"  プロジェクト: {paths}")
                    print(
                        f"  ステータス: {ultra_intent.get('aggregate_status', 'unknown')}"
                    )
                    print()
        else:
            print("❌ クラスタ横断上位意図の抽出に失敗しました")

    # レビュー用のHTMLを生成
    if args.gemini:
        # Gemini抽出結果のレビューHTML
        generate_intent_review_html(all_prompts, include_meta_intents=args.aggregate)
        print("\n" + "=" * 60)
        print("✅ 意図抽出完了！")
        print("=" * 60)
        print(f"📁 出力ディレクトリ: {OUTPUT_DIR}")
        print(f"📄 レビュー用HTML: {OUTPUT_DIR / 'intent_review.html'}")
        print(f"📄 後処理済みJSON: {PROCESSED_DIR}/")
        if args.aggregate:
            print(f"📄 上位意図JSON: {AGGREGATED_DIR}/")
        if args.aggregate_all:
            print(
                f"📄 クラスタ横断上位意図JSON: {CROSS_CLUSTER_DIR}/super_intents.json"
            )
            # super_intents_enriched.json の存在をチェック
            super_enriched = CROSS_CLUSTER_DIR / "super_intents_enriched.json"
            if super_enriched.exists():
                print(f"📄 クラスタ横断上位意図JSON（詳細展開版）: {super_enriched}")

            # ultra_intents.json の存在をチェック
            ultra_file = CROSS_CLUSTER_DIR / "ultra_intents.json"
            if ultra_file.exists():
                print(f"📄 最終上位意図JSON（2段階抽象化）: {ultra_file}")
                enriched_file = CROSS_CLUSTER_DIR / "ultra_intents_enriched.json"
                if enriched_file.exists():
                    print(f"📄 最終上位意図JSON（詳細展開版）: {enriched_file}")
        print("\n次のステップ:")
        print(f"  1. {OUTPUT_DIR}/intent_review.html をブラウザで開く")
        print("  2. 抽出された意図を確認・レビュー")
        if args.aggregate_all:
            print("  3. クラスタ横断上位意図の階層構造を確認")
            print(f"  4. {CROSS_CLUSTER_DIR}/super_intents.json のJSONファイルを確認")
            super_enriched = CROSS_CLUSTER_DIR / "super_intents_enriched.json"
            if super_enriched.exists():
                print(f"  5. {super_enriched} の詳細展開版（個別意図詳細含む）を確認")
            ultra_file = CROSS_CLUSTER_DIR / "ultra_intents.json"
            enriched_file = CROSS_CLUSTER_DIR / "ultra_intents_enriched.json"
            if ultra_file.exists():
                print(f"  6. {ultra_file} の最終上位意図（2段階抽象化）を確認")
            if enriched_file.exists():
                print(f"  7. {enriched_file} の詳細展開版（個別意図詳細含む）を確認")
        elif args.aggregate:
            print("  3. 上位意図と個別意図のマッピングを確認")
            print(f"  4. {AGGREGATED_DIR}/ のJSONファイルを確認")
        else:
            print(f"  3. {PROCESSED_DIR}/ のJSONファイルを確認")
    else:
        # プロンプト一覧のインデックスHTML
        generate_review_index(all_prompts)
        print("\n" + "=" * 60)
        print("✅ プロンプト生成完了！")
        print("=" * 60)
        print(f"📁 出力ディレクトリ: {OUTPUT_DIR}")
        print(f"📄 レビュー用インデックス: {OUTPUT_DIR / 'index.html'}")
        print("\n次のステップ:")
        print(f"  1. {OUTPUT_DIR}/index.html をブラウザで開く")
        print("  2. 各クラスタのプロンプトをレビュー")
        print("  3. --gemini オプションで意図抽出を実行")


def generate_intent_review_html(
    all_prompts: List[Dict], include_meta_intents: bool = False
):
    """Gemini抽出結果のレビュー用HTMLを生成"""
    html_parts = [
        "<!DOCTYPE html>",
        "<html lang='ja'>",
        "<head>",
        "  <meta charset='UTF-8'>",
        "  <meta name='viewport' content='width=device-width, initial-scale=1.0'>",
        "  <title>意図抽出結果 - レビュー</title>",
        "  <style>",
        "    body { font-family: 'Hiragino Sans', sans-serif; margin: 20px; background: #f5f5f5; }",
        "    .container { max-width: 1400px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }",
        "    h1 { color: #333; border-bottom: 3px solid #4CAF50; padding-bottom: 10px; }",
        "    h2 { color: #333; border-bottom: 2px solid #FF9800; padding-bottom: 8px; margin-top: 20px; }",
        "    .summary { background: #e8f5e9; padding: 15px; border-radius: 5px; margin: 20px 0; }",
        "    .cluster-section { margin: 30px 0; padding: 20px; background: #fafafa; border-radius: 8px; }",
        "    .cluster-header { background: #4CAF50; color: white; padding: 15px; border-radius: 5px; margin-bottom: 15px; }",
        "    .cluster-title { font-size: 1.3em; font-weight: bold; }",
        "    .cluster-meta { margin-top: 5px; font-size: 0.9em; opacity: 0.9; }",
        "    .meta-intents-container { margin-top: 20px; }",
        "    .meta-intent-card { background: #FFF8E1; border: 2px solid #FF9800; padding: 18px; margin: 15px 0; border-radius: 8px; }",
        "    .meta-intent-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }",
        "    .meta-intent-title { font-size: 1.2em; font-weight: bold; color: #E65100; }",
        "    .meta-intent-field { margin: 10px 0; }",
        "    .covered-intents { background: #FFF3E0; padding: 10px; margin-top: 10px; border-radius: 5px; }",
        "    .covered-intent-link { display: inline-block; background: #FFE0B2; padding: 4px 10px; margin: 3px; border-radius: 4px; font-size: 0.9em; }",
        "    .intents-container { margin-top: 15px; }",
        "    .intent-card { background: white; border: 1px solid #ddd; padding: 15px; margin: 10px 0; border-radius: 5px; border-left: 4px solid #2196F3; }",
        "    .intent-card.covered { opacity: 0.7; }",
        "    .intent-index { display: inline-block; background: #9E9E9E; color: white; padding: 2px 8px; border-radius: 10px; font-size: 0.8em; margin-right: 8px; }",
        "    .intent-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }",
        "    .intent-description { font-size: 1.1em; font-weight: bold; color: #333; }",
        "    .intent-status { padding: 4px 12px; border-radius: 12px; font-size: 0.85em; font-weight: bold; }",
        "    .status-idea { background: #E3F2FD; color: #1976D2; }",
        "    .status-todo { background: #FFF3E0; color: #F57C00; }",
        "    .status-doing { background: #F3E5F5; color: #7B1FA2; }",
        "    .status-done { background: #E8F5E9; color: #388E3C; }",
        "    .intent-field { margin: 8px 0; }",
        "    .field-label { font-weight: bold; color: #666; font-size: 0.9em; }",
        "    .field-value { margin-top: 3px; color: #333; }",
        "    .message-ids { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 5px; }",
        "    .message-id-tag { background: #E0E0E0; padding: 3px 8px; border-radius: 3px; font-size: 0.85em; font-family: monospace; }",
        "    .error-message { background: #FFEBEE; color: #C62828; padding: 15px; border-radius: 5px; border-left: 4px solid #C62828; }",
        "    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0; }",
        "    .stat-card { background: white; border: 1px solid #ddd; padding: 15px; border-radius: 5px; text-align: center; }",
        "    .stat-value { font-size: 2em; font-weight: bold; color: #4CAF50; }",
        "    .stat-label { color: #666; font-size: 0.9em; margin-top: 5px; }",
        "  </style>",
        "</head>",
        "<body>",
        "  <div class='container'>",
        "    <h1>🎯 意図抽出結果 - レビュー</h1>",
    ]

    # 統計情報を計算
    total_clusters = len(all_prompts)
    total_intents = sum(
        len(p.get("extracted_intents", []))
        for p in all_prompts
        if p.get("extracted_intents")
    )
    failed_clusters = sum(1 for p in all_prompts if not p.get("extracted_intents"))
    success_clusters = total_clusters - failed_clusters

    html_parts.extend(
        [
            "    <div class='summary'>",
            f"      <strong>生成日時:</strong> {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}<br>",
            "      <strong>モデル:</strong> Gemini 2.5 Flash",
            "    </div>",
            "    <div class='stats'>",
            f"      <div class='stat-card'><div class='stat-value'>{total_clusters}</div><div class='stat-label'>クラスタ数</div></div>",
            f"      <div class='stat-card'><div class='stat-value'>{total_intents}</div><div class='stat-label'>抽出された意図</div></div>",
            f"      <div class='stat-card'><div class='stat-value'>{success_clusters}</div><div class='stat-label'>成功</div></div>",
            f"      <div class='stat-card'><div class='stat-value'>{failed_clusters}</div><div class='stat-label'>失敗</div></div>",
            "    </div>",
        ]
    )

    # 各クラスタの結果を表示
    for prompt_info in all_prompts:
        cluster_id = prompt_info["cluster_id"]
        message_count = prompt_info["message_count"]
        intents = prompt_info.get("extracted_intents")
        meta_intents = prompt_info.get("meta_intents")

        html_parts.extend(
            [
                "    <div class='cluster-section'>",
                "      <div class='cluster-header'>",
                f"        <div class='cluster-title'>クラスタ {cluster_id}</div>",
                f"        <div class='cluster-meta'>{message_count}件のメッセージ</div>",
                "      </div>",
            ]
        )

        # 上位意図を表示（--aggregate 指定時）
        if include_meta_intents and meta_intents:
            html_parts.append("      <h2>🎯 上位意図（Meta Intents）</h2>")
            html_parts.append("      <div class='meta-intents-container'>")

            # どの意図が上位意図でカバーされているか追跡
            covered_indices = set()
            for meta_intent in meta_intents:
                covered_indices.update(meta_intent.get("covered_intent_indices", []))

            for idx, meta_intent in enumerate(meta_intents, 1):
                meta_status = meta_intent.get("aggregate_status", "unknown")
                status_class = f"status-{meta_status}"

                html_parts.extend(
                    [
                        "        <div class='meta-intent-card'>",
                        "          <div class='meta-intent-header'>",
                        f"            <div class='meta-intent-title'>{idx}. {meta_intent.get('meta_intent', '（未定義）')}</div>",
                        f"            <div class='intent-status {status_class}'>{meta_status}</div>",
                        "          </div>",
                    ]
                )

                # objective_facts
                if meta_intent.get("objective_facts"):
                    html_parts.extend(
                        [
                            "          <div class='meta-intent-field'>",
                            "            <div class='field-label'>客観的事実:</div>",
                            f"            <div class='field-value'>{meta_intent['objective_facts']}</div>",
                            "          </div>",
                        ]
                    )

                # context
                if meta_intent.get("context"):
                    html_parts.extend(
                        [
                            "          <div class='meta-intent-field'>",
                            "            <div class='field-label'>背景:</div>",
                            f"            <div class='field-value'>{meta_intent['context']}</div>",
                            "          </div>",
                        ]
                    )

                # covered intents
                if meta_intent.get("covered_intent_indices"):
                    html_parts.extend(
                        [
                            "          <div class='meta-intent-field'>",
                            "            <div class='field-label'>含まれる個別意図:</div>",
                            "            <div class='covered-intents'>",
                        ]
                    )
                    for intent_idx in meta_intent["covered_intent_indices"]:
                        html_parts.append(
                            f"              <span class='covered-intent-link'>Intent #{intent_idx}</span>"
                        )
                    html_parts.extend(
                        [
                            "            </div>",
                            "          </div>",
                        ]
                    )

                html_parts.append("        </div>")

            html_parts.append("      </div>")
        else:
            covered_indices = set()

        # 個別意図を表示
        if intents:
            html_parts.append(
                "      <h2>📝 個別意図（Individual Intents）</h2>"
                if include_meta_intents and meta_intents
                else ""
            )
            html_parts.append("      <div class='intents-container'>")
            for i, intent in enumerate(intents):
                status = intent.get("status", "unknown")
                status_class = f"status-{status}"

                # カバーされている意図は薄く表示
                covered_class = " covered" if i in covered_indices else ""

                # 意図の説明文を柔軟に取得（description, intent, その他の順で探す）
                description = (
                    intent.get("description") or intent.get("intent") or "（説明なし）"
                )

                html_parts.extend(
                    [
                        f"        <div class='intent-card{covered_class}'>",
                        "          <div class='intent-header'>",
                        f"            <div class='intent-description'><span class='intent-index'>#{i}</span>{description}</div>",
                        f"            <div class='intent-status {status_class}'>{status}</div>",
                        "          </div>",
                    ]
                )

                # 特別なキーを除外して、残りのフィールドを動的に表示
                special_keys = {"description", "intent", "status", "source_message_ids"}

                # 日本語ラベルマッピング
                label_map = {
                    "target": "対象",
                    "motivation": "動機",
                    "why": "理由",
                    "objective_facts": "客観的事実",
                }

                for key, value in intent.items():
                    if key in special_keys:
                        continue
                    if key == "source_message_ids":
                        continue
                    if value is None or value == "":
                        continue

                    label = label_map.get(key, key)
                    html_parts.extend(
                        [
                            "          <div class='intent-field'>",
                            f"            <div class='field-label'>{label}:</div>",
                            f"            <div class='field-value'>{value}</div>",
                            "          </div>",
                        ]
                    )

                # source_message_ids（常に表示）
                if intent.get("source_message_ids"):
                    html_parts.extend(
                        [
                            "          <div class='intent-field'>",
                            "            <div class='field-label'>メッセージID:</div>",
                            "            <div class='message-ids'>",
                        ]
                    )
                    for msg_id in intent["source_message_ids"]:
                        html_parts.append(
                            f"              <span class='message-id-tag'>{msg_id}</span>"
                        )
                    html_parts.extend(
                        [
                            "            </div>",
                            "          </div>",
                        ]
                    )

                html_parts.append("        </div>")

            html_parts.append("      </div>")
        else:
            html_parts.append(
                "      <div class='error-message'>⚠️ 意図抽出に失敗しました</div>"
            )

        html_parts.append("    </div>")

    html_parts.extend(
        [
            "  </div>",
            "</body>",
            "</html>",
        ]
    )

    output_file = OUTPUT_DIR / "intent_review.html"
    with open(output_file, "w", encoding="utf-8") as f:
        f.write("\n".join(html_parts))

    print(f"\n✓ 意図抽出レビューHTMLを生成: {output_file}")


def generate_review_index(all_prompts: List[Dict]):
    """レビュー用のHTMLインデックスを生成"""
    html_parts = [
        "<!DOCTYPE html>",
        "<html lang='ja'>",
        "<head>",
        "  <meta charset='UTF-8'>",
        "  <meta name='viewport' content='width=device-width, initial-scale=1.0'>",
        "  <title>意図抽出プロンプト - レビュー</title>",
        "  <style>",
        "    body { font-family: 'Hiragino Sans', sans-serif; margin: 20px; background: #f5f5f5; }",
        "    .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }",
        "    h1 { color: #333; border-bottom: 3px solid #4CAF50; padding-bottom: 10px; }",
        "    .summary { background: #e8f5e9; padding: 15px; border-radius: 5px; margin: 20px 0; }",
        "    .cluster-list { margin-top: 30px; }",
        "    .cluster-item { background: #fff; border: 1px solid #ddd; padding: 15px; margin: 10px 0; border-radius: 5px; }",
        "    .cluster-item:hover { background: #f9f9f9; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }",
        "    .cluster-header { display: flex; justify-content: space-between; align-items: center; }",
        "    .cluster-id { font-size: 1.2em; font-weight: bold; color: #4CAF50; }",
        "    .message-count { color: #666; font-size: 0.9em; }",
        "    .preview { margin-top: 10px; padding: 10px; background: #f5f5f5; border-left: 3px solid #4CAF50; font-size: 0.85em; max-height: 100px; overflow: hidden; }",
        "    .actions { margin-top: 10px; }",
        "    .btn { display: inline-block; padding: 8px 16px; background: #4CAF50; color: white; text-decoration: none; border-radius: 4px; margin-right: 10px; }",
        "    .btn:hover { background: #45a049; }",
        "    .btn-secondary { background: #2196F3; }",
        "    .btn-secondary:hover { background: #0b7dda; }",
        "  </style>",
        "</head>",
        "<body>",
        "  <div class='container'>",
        "    <h1>🎯 意図抽出プロンプト - レビュー</h1>",
        "    <div class='summary'>",
        f"      <strong>生成日時:</strong> {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}<br>",
        f"      <strong>クラスタ数:</strong> {len(all_prompts)}<br>",
        f"      <strong>総メッセージ数:</strong> {sum(p['message_count'] for p in all_prompts)}",
        "    </div>",
        "    <div class='cluster-list'>",
    ]

    for prompt_info in all_prompts:
        cluster_id = prompt_info["cluster_id"]
        message_count = prompt_info["message_count"]
        filename = f"cluster_{cluster_id:02d}_prompt.md"

        # プレビュー用に最初のメッセージを取得
        first_msg = prompt_info["messages"][0] if prompt_info["messages"] else None
        preview = first_msg["content"][:200] + "..." if first_msg else ""

        html_parts.extend(
            [
                "      <div class='cluster-item'>",
                "        <div class='cluster-header'>",
                f"          <div class='cluster-id'>クラスタ {cluster_id}</div>",
                f"          <div class='message-count'>{message_count}件のメッセージ</div>",
                "        </div>",
                f"        <div class='preview'>{preview}</div>",
                "        <div class='actions'>",
                f"          <a href='{filename}' class='btn' target='_blank'>プロンプトを開く</a>",
                f"          <button class='btn btn-secondary' onclick='copyToClipboard(\"{filename}\")'>クリップボードにコピー</button>",
                "        </div>",
                "      </div>",
            ]
        )

    html_parts.extend(
        [
            "    </div>",
            "  </div>",
            "  <script>",
            "    async function copyToClipboard(filename) {",
            "      try {",
            "        const response = await fetch(filename);",
            "        const text = await response.text();",
            "        await navigator.clipboard.writeText(text);",
            "        alert('クリップボードにコピーしました！');",
            "      } catch (err) {",
            "        alert('コピーに失敗しました: ' + err);",
            "      }",
            "    }",
            "  </script>",
            "</body>",
            "</html>",
        ]
    )

    index_file = OUTPUT_DIR / "index.html"
    with open(index_file, "w", encoding="utf-8") as f:
        f.write("\n".join(html_parts))

    print(f"\n✓ レビュー用インデックスを生成: {index_file}")


if __name__ == "__main__":
    main()

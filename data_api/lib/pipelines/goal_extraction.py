#!/usr/bin/env python3
"""
クラスタごとのGoal抽出パイプライン

各クラスタのメッセージからGoalItemオブジェクトを抽出するためのパイプライン

使用例:
  # プロンプトのみ生成
  python main.py goal_extraction

  # Gemini APIでGoal抽出を実行
  python main.py goal_extraction --gemini

  # 特定クラスタのみ処理
  python main.py goal_extraction --gemini --cluster=0

  # 生レスポンスも保存
  python main.py goal_extraction --gemini --cluster=0 --save_raw
"""

import json
import pandas as pd  # type: ignore[import-untyped]
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional
import sys
from tqdm import tqdm  # type: ignore[import-untyped]

# プロジェクトルートをパスに追加
sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from lib import gemini_client
from lib.pipelines import extraction_common


OUTPUT_DIR = Path("output/goal_extraction")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

TEMPLATE_DIR = Path("templates")
TEMPLATE_FILE = TEMPLATE_DIR / "goal_extraction_prompt.md"

PROCESSED_DIR = OUTPUT_DIR / "processed"
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)


@dataclass
class ClusterProcessingContext:
    """クラスタ処理のコンテキスト"""

    df: pd.DataFrame
    template: str
    message_metadata: Dict[str, Dict]
    gemini: bool
    save_raw: bool


def load_goal_template() -> str:
    """Goalプロンプトテンプレートを読み込み"""
    if not TEMPLATE_FILE.exists():
        raise FileNotFoundError(
            f"テンプレートファイルが見つかりません: {TEMPLATE_FILE}"
        )

    with open(TEMPLATE_FILE, "r", encoding="utf-8") as f:
        template = f.read()

    return template


def generate_cluster_prompt(
    cluster_id: int, cluster_df: pd.DataFrame, template: str
) -> Dict:
    """
    1つのクラスタに対するGoal抽出プロンプトを生成

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
        start_time = row.start_time

        # start_timeがdatetime型であることを確認
        if hasattr(start_time, "strftime"):
            time_str = start_time.strftime("%Y-%m-%d %H:%M")  # type: ignore[union-attr]
        else:
            time_str = str(start_time)

        msg = {
            "message_id": str(row.message_id),
            "channel": str(row.full_path),
            "time": time_str,
            "content": str(row.combined_content),
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

    # テンプレートに値を埋め込み（{messages}プレースホルダーのみ）
    prompt_text = template.format(
        messages="\n".join(message_parts),
    )

    return {
        "cluster_id": cluster_id,
        "message_count": len(messages),
        "prompt": prompt_text,
        "messages": messages,
    }


def call_gemini_api_with_postprocess(
    prompt_text: str,
    cluster_id: int,
    message_metadata: Dict[str, Dict],
    save_raw: bool = False,
) -> Optional[List[Dict]]:
    """
    【API呼び出し + 後処理】Gemini APIを使ってGoalを抽出

    Args:
        prompt_text: Goal抽出プロンプト
        cluster_id: クラスタID
        message_metadata: msg_id -> {full_path, start_timestamps} のマッピング
        save_raw: 生のレスポンスをファイルに保存するか

    Returns:
        抽出されたGoalオブジェクトのリスト（エラー時はNone）
    """
    # API呼び出し（litellm側でキャッシュされる）
    try:
        model = gemini_client.GenerativeModel()
        response = model.generate_content(prompt_text)
        response_text = response.text

    except Exception as e:
        print(f"\n❌ クラスタ {cluster_id} でエラー発生: {type(e).__name__}: {e}")
        raise

    # 生のレスポンスを保存（オプション）
    if save_raw:
        raw_output_dir = OUTPUT_DIR / "raw_responses"
        raw_output_dir.mkdir(exist_ok=True)
        raw_file = raw_output_dir / f"cluster_{cluster_id:02d}_raw_response.txt"
        with open(raw_file, "w", encoding="utf-8") as f:
            f.write(response_text)

    # JSONをパース（前処理）
    goals = extraction_common.preprocess_extract_json_from_response(
        response_text,
        context=f"goal_extraction_cluster_{cluster_id:02d}",
        metadata={"cluster_id": cluster_id, "message_count": len(message_metadata)},
    )
    if goals is None:
        return None

    # メタデータを補完
    enriched_goals = extraction_common.enrich_items_with_metadata(
        goals, cluster_id, message_metadata
    )

    # JSON保存
    json_output_file = PROCESSED_DIR / f"cluster_{cluster_id:02d}_goals.json"
    extraction_common.save_items_as_json(enriched_goals, json_output_file)

    # CSV保存
    csv_output_file = PROCESSED_DIR / f"cluster_{cluster_id:02d}_goals.csv"
    extraction_common.save_items_as_csv(enriched_goals, csv_output_file)

    return enriched_goals


def _process_single_cluster(cluster_id: int, context: ClusterProcessingContext) -> Dict:
    """単一クラスタの処理"""
    cluster_df = context.df[context.df["cluster"] == cluster_id]
    prompt_info = generate_cluster_prompt(cluster_id, cluster_df, context.template)

    # プロンプトをファイルに保存
    prompt_file = OUTPUT_DIR / f"cluster_{cluster_id:02d}_prompt.md"
    with open(prompt_file, "w", encoding="utf-8") as f:
        f.write(prompt_info["prompt"])

    if context.gemini:
        goals = call_gemini_api_with_postprocess(
            prompt_info["prompt"],
            cluster_id,
            context.message_metadata,
            save_raw=context.save_raw,
        )
        prompt_info["extracted_goals"] = goals

    return prompt_info


def _process_all_clusters(
    cluster_ids: List[int],
    context: ClusterProcessingContext,
    *,
    max_workers: int,
) -> List[Dict]:
    """全クラスタの処理（並列または逐次）"""

    def process_cluster(cluster_id: int) -> Dict:
        return _process_single_cluster(cluster_id, context)

    if context.gemini:
        return gemini_client.parallel_execute(
            cluster_ids,
            process_cluster,
            max_workers=max_workers,
            desc="Gemini API でGoal抽出中",
            unit="cluster",
        )
    all_prompts = []
    for cluster_id in tqdm(cluster_ids, desc="プロンプト生成中", unit="cluster"):
        all_prompts.append(process_cluster(cluster_id))
    return all_prompts


def run_goal_extraction_pipeline(
    gemini: bool = False,
    cluster: Optional[int] = None,
    save_raw: bool = False,
    max_workers: int = 5,
) -> None:
    """
    Goal抽出パイプラインを実行

    Args:
        gemini: Gemini APIで抽出を実行するか
        cluster: 特定のクラスタのみ処理する場合、そのクラスタID
        save_raw: 生のレスポンスをファイルに保存するか
        max_workers: 並列実行の最大ワーカー数
    """
    print("\n" + "=" * 60)
    print("Goal抽出パイプライン開始")
    if gemini:
        print(f"+ Gemini API でGoal抽出を実行（並列数: {max_workers}）")
    if cluster is not None:
        print(f"+ クラスタ {cluster} のみ処理")
    if save_raw:
        print("+ 生レスポンスを保存")
    print("=" * 60)

    # 1. データ読み込み
    df = extraction_common.load_clustered_messages()
    message_metadata = extraction_common.build_message_metadata(df)

    # 2. テンプレート読み込み
    template = load_goal_template()

    # 3. クラスタID決定
    if cluster is not None:
        cluster_ids = [cluster]
    else:
        cluster_ids = sorted(df["cluster"].unique())

    # 4. コンテキスト作成
    context = ClusterProcessingContext(
        df=df,
        template=template,
        message_metadata=message_metadata,
        gemini=gemini,
        save_raw=save_raw,
    )

    # 5. 全クラスタ処理（並列または逐次）
    print(f"\n{len(cluster_ids)}個のクラスタに対してGoal抽出を実行します")
    all_results = _process_all_clusters(cluster_ids, context, max_workers=max_workers)

    # 6. 結果サマリー表示
    print("\n" + "=" * 60)
    print("Goal抽出パイプライン完了")
    print("=" * 60)

    total_goals = sum(
        len(result.get("extracted_goals", [])) for result in all_results if result.get("extracted_goals")
    )
    if gemini and total_goals > 0:
        print(f"\n✓ 合計 {total_goals} 件のGoalを抽出しました")
        print(f"✓ 出力ディレクトリ: {PROCESSED_DIR}")

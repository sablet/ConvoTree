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
from dotenv import load_dotenv
import google.generativeai as genai
from diskcache import Cache
from tqdm import tqdm
import hashlib


OUTPUT_DIR = Path("output/intent_extraction")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

CACHE_DIR = Path("output/.cache/intent_extraction")
CACHE_DIR.mkdir(parents=True, exist_ok=True)
cache = Cache(str(CACHE_DIR))

TEMPLATE_DIR = Path("templates")
TEMPLATE_FILE = TEMPLATE_DIR / "intent_extraction_prompt.md"

PROCESSED_DIR = OUTPUT_DIR / "processed"
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)


def load_template() -> str:
    """プロンプトテンプレートを読み込み"""
    if not TEMPLATE_FILE.exists():
        raise FileNotFoundError(f"テンプレートファイルが見つかりません: {TEMPLATE_FILE}")

    with open(TEMPLATE_FILE, 'r', encoding='utf-8') as f:
        return f.read()


def load_clustered_messages() -> pd.DataFrame:
    """クラスタリング済みメッセージを読み込み"""
    csv_path = Path("output/message_clustering/clustered_messages.csv")
    if not csv_path.exists():
        raise FileNotFoundError(f"クラスタリング結果が見つかりません: {csv_path}")

    df = pd.read_csv(csv_path)
    df['start_time'] = pd.to_datetime(df['start_time'])
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
                'full_path': row.full_path,
                'min_start_timestamp': row.start_time.isoformat()
            }
        else:
            # 同じmsg_idで複数行ある場合、最小のタイムスタンプを保持
            current_ts = pd.to_datetime(metadata[msg_id]['min_start_timestamp'])
            if row.start_time < current_ts:
                metadata[msg_id]['min_start_timestamp'] = row.start_time.isoformat()
    return metadata


def generate_cluster_prompt(cluster_id: int, cluster_df: pd.DataFrame, template: str) -> Dict:
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
    cluster_df = cluster_df.sort_values('start_time')

    # メッセージリストを構築
    messages = []
    message_parts = []

    for i, row in enumerate(cluster_df.itertuples(), 1):
        msg = {
            'message_id': row.message_id,
            'channel': row.full_path,
            'time': row.start_time.strftime('%Y-%m-%d %H:%M'),
            'content': row.combined_content
        }
        messages.append(msg)

        # メッセージ部分のテキスト構築
        message_parts.extend([
            f"### メッセージ {i}",
            f"- ID: `{msg['message_id']}`",
            f"- チャネル: {msg['channel']}",
            f"- 日時: {msg['time']}",
            f"- 内容:",
            "```",
            msg['content'],
            "```",
            ""
        ])

    # テンプレートに値を埋め込み
    prompt_text = template.format(
        cluster_id=cluster_id,
        message_count=len(messages),
        period_start=cluster_df['start_time'].min().strftime('%Y-%m-%d'),
        period_end=cluster_df['start_time'].max().strftime('%Y-%m-%d'),
        messages="\n".join(message_parts)
    )

    return {
        'cluster_id': cluster_id,
        'message_count': len(messages),
        'prompt': prompt_text,
        'messages': messages
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
    raw_response_text: str,
    cluster_id: int,
    message_metadata: Dict[str, Dict]
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
        intent['cluster_id'] = int(cluster_id)

        source_ids = intent.get('source_message_ids', [])
        if not source_ids:
            continue

        # source_message_idsに対応するfull_pathとmin_start_timestampを集約
        full_paths = []
        timestamps = []

        for msg_id in source_ids:
            metadata = message_metadata.get(msg_id, {})
            full_path = metadata.get('full_path')
            timestamp = metadata.get('min_start_timestamp')

            if full_path:
                full_paths.append(full_path)
            if timestamp:
                timestamps.append(timestamp)

        # ユニークなfull_pathのリスト
        intent['source_full_paths'] = list(set(full_paths)) if full_paths else []

        # 最小のタイムスタンプ
        intent['min_start_timestamp'] = min(timestamps) if timestamps else None

    # 処理後のJSONを保存
    output_file = PROCESSED_DIR / f"cluster_{cluster_id:02d}_processed.json"
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(intents, f, ensure_ascii=False, indent=2)

    return intents


def call_gemini_api_with_postprocess(
    prompt_text: str,
    cluster_id: int,
    message_metadata: Dict[str, Dict],
    save_raw: bool = False
) -> Optional[List[Dict]]:
    """
    【API呼び出し + 後処理】Gemini APIを使って意図を抽出（キャッシュ対応）

    Args:
        prompt_text: 意図抽出プロンプト
        cluster_id: クラスタID
        message_metadata: msg_id -> {full_path, min_start_timestamp} のマッピング
        save_raw: 生のレスポンスをファイルに保存するか

    Returns:
        抽出された意図オブジェクトのリスト（エラー時はNone）
    """
    # キャッシュキーを生成（プロンプトのみで判定）
    cache_key = f"intent_extraction_{hashlib.md5(prompt_text.encode()).hexdigest()}"

    # キャッシュから生レスポンステキストを取得
    cached_data = cache.get(cache_key)

    if cached_data is not None and isinstance(cached_data, str):
        # キャッシュヒット（新フォーマット）: 生レスポンスに対して後処理を実行
        response_text = cached_data
    else:
        # キャッシュミス: API呼び出し
        try:
            model = genai.GenerativeModel("gemini-2.5-flash")
            response = model.generate_content(prompt_text)
            response_text = response.text

            # 生のレスポンステキストをキャッシュに保存
            cache.set(cache_key, response_text)

        except Exception as e:
            print(f"\n❌ クラスタ {cluster_id} でエラー発生: {type(e).__name__}: {e}")
            raise

    # 生のレスポンスを保存（オプション）
    if save_raw:
        raw_output_dir = OUTPUT_DIR / "raw_responses"
        raw_output_dir.mkdir(exist_ok=True)
        raw_file = raw_output_dir / f"cluster_{cluster_id:02d}_raw_response.txt"
        with open(raw_file, 'w', encoding='utf-8') as f:
            f.write(response_text)

    # 後処理を実行（キャッシュヒット時も毎回実行）
    intents = postprocess_enrich_and_save_intents(
        response_text,
        cluster_id,
        message_metadata
    )

    return intents


def main():
    """メイン処理"""
    # コマンドライン引数をパース
    parser = argparse.ArgumentParser(
        description="クラスタごとの意図抽出プロンプトを生成し、オプションでGemini APIによる意図抽出を実行"
    )
    parser.add_argument(
        "--gemini",
        action="store_true",
        help="Gemini APIで意図抽出を実行してレビュー用HTMLを生成"
    )
    parser.add_argument(
        "--cluster",
        type=int,
        help="特定のクラスタIDのみ処理（指定しない場合は全クラスタ）"
    )
    parser.add_argument(
        "--save-raw",
        action="store_true",
        help="Gemini APIの生レスポンスをファイルに保存（デバッグ用）"
    )
    args = parser.parse_args()

    print("=" * 60)
    print("意図抽出プロンプト生成")
    if args.gemini:
        print("+ Gemini API で意図抽出を実行")
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
        genai.configure(api_key=api_key)
        print("✓ Gemini API を初期化しました")
        print(f"✓ キャッシュディレクトリ: {CACHE_DIR}")
        print(f"✓ キャッシュサイズ: {len(cache)}件")

    # テンプレート読み込み
    print("\nプロンプトテンプレートを読み込み中...")
    try:
        template = load_template()
        print(f"✓ テンプレート読み込み完了: {TEMPLATE_FILE}")
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
    cluster_ids = sorted(df['cluster'].unique())

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
    if args.cluster is not None and (OUTPUT_DIR / "generation_summary.json").exists():
        # 既存のサマリーから他のクラスタの情報を読み込む
        with open(OUTPUT_DIR / "generation_summary.json", 'r', encoding='utf-8') as f:
            existing_summary = json.load(f)
        # 既存の抽出結果も読み込み（HTML再生成のため）
        # ここでは簡略化のため、指定クラスタのみ再生成

    # tqdmで進捗表示
    progress_desc = "Gemini API で意図抽出中" if args.gemini else "プロンプト生成中"
    for cluster_id in tqdm(cluster_ids, desc=progress_desc, unit="cluster"):
        cluster_df = df[df['cluster'] == cluster_id]
        prompt_info = generate_cluster_prompt(cluster_id, cluster_df, template)

        # Gemini APIで意図抽出（オプション指定時）
        if args.gemini:
            intents = call_gemini_api_with_postprocess(
                prompt_info['prompt'],
                cluster_id,
                message_metadata,
                save_raw=args.save_raw
            )
            prompt_info['extracted_intents'] = intents

            # tqdmの進捗バー外に詳細を表示
            status = f"✓ {len(intents)}件" if intents else "✗ 失敗"
            tqdm.write(f"  クラスタ {cluster_id:2d} ({prompt_info['message_count']:3d}件): {status}")

        all_prompts.append(prompt_info)

        # 個別ファイルとして保存
        output_file = OUTPUT_DIR / f"cluster_{cluster_id:02d}_prompt.md"
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(prompt_info['prompt'])
            

    # サマリー情報を保存
    summary = {
        'generated_at': datetime.now().isoformat(),
        'total_clusters': int(len(cluster_ids)),
        'total_messages': int(len(df)),
        'clusters': [
            {
                'cluster_id': int(p['cluster_id']),
                'message_count': int(p['message_count']),
                'prompt_file': f"cluster_{p['cluster_id']:02d}_prompt.md"
            }
            for p in all_prompts
        ]
    }

    summary_file = OUTPUT_DIR / "generation_summary.json"
    with open(summary_file, 'w', encoding='utf-8') as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    print(f"\n✓ サマリー情報を保存: {summary_file}")

    # レビュー用のHTMLを生成
    if args.gemini:
        # Gemini抽出結果のレビューHTML
        generate_intent_review_html(all_prompts)
        print("\n" + "=" * 60)
        print("✅ 意図抽出完了！")
        print("=" * 60)
        print(f"📁 出力ディレクトリ: {OUTPUT_DIR}")
        print(f"📄 レビュー用HTML: {OUTPUT_DIR / 'intent_review.html'}")
        print(f"📄 後処理済みJSON: {PROCESSED_DIR}/")
        print(f"\n次のステップ:")
        print(f"  1. {OUTPUT_DIR}/intent_review.html をブラウザで開く")
        print(f"  2. 抽出された意図を確認・レビュー")
        print(f"  3. {PROCESSED_DIR}/ のJSONファイルを確認")
    else:
        # プロンプト一覧のインデックスHTML
        generate_review_index(all_prompts)
        print("\n" + "=" * 60)
        print("✅ プロンプト生成完了！")
        print("=" * 60)
        print(f"📁 出力ディレクトリ: {OUTPUT_DIR}")
        print(f"📄 レビュー用インデックス: {OUTPUT_DIR / 'index.html'}")
        print(f"\n次のステップ:")
        print(f"  1. {OUTPUT_DIR}/index.html をブラウザで開く")
        print(f"  2. 各クラスタのプロンプトをレビュー")
        print(f"  3. --gemini オプションで意図抽出を実行")


def generate_intent_review_html(all_prompts: List[Dict]):
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
        "    .summary { background: #e8f5e9; padding: 15px; border-radius: 5px; margin: 20px 0; }",
        "    .cluster-section { margin: 30px 0; padding: 20px; background: #fafafa; border-radius: 8px; }",
        "    .cluster-header { background: #4CAF50; color: white; padding: 15px; border-radius: 5px; margin-bottom: 15px; }",
        "    .cluster-title { font-size: 1.3em; font-weight: bold; }",
        "    .cluster-meta { margin-top: 5px; font-size: 0.9em; opacity: 0.9; }",
        "    .intents-container { margin-top: 15px; }",
        "    .intent-card { background: white; border: 1px solid #ddd; padding: 15px; margin: 10px 0; border-radius: 5px; border-left: 4px solid #2196F3; }",
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
    total_intents = sum(len(p.get('extracted_intents', [])) for p in all_prompts if p.get('extracted_intents'))
    failed_clusters = sum(1 for p in all_prompts if not p.get('extracted_intents'))
    success_clusters = total_clusters - failed_clusters

    html_parts.extend([
        "    <div class='summary'>",
        f"      <strong>生成日時:</strong> {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}<br>",
        f"      <strong>モデル:</strong> Gemini 2.5 Flash",
        "    </div>",
        "    <div class='stats'>",
        f"      <div class='stat-card'><div class='stat-value'>{total_clusters}</div><div class='stat-label'>クラスタ数</div></div>",
        f"      <div class='stat-card'><div class='stat-value'>{total_intents}</div><div class='stat-label'>抽出された意図</div></div>",
        f"      <div class='stat-card'><div class='stat-value'>{success_clusters}</div><div class='stat-label'>成功</div></div>",
        f"      <div class='stat-card'><div class='stat-value'>{failed_clusters}</div><div class='stat-label'>失敗</div></div>",
        "    </div>",
    ])

    # 各クラスタの結果を表示
    for prompt_info in all_prompts:
        cluster_id = prompt_info['cluster_id']
        message_count = prompt_info['message_count']
        intents = prompt_info.get('extracted_intents')

        html_parts.extend([
            "    <div class='cluster-section'>",
            "      <div class='cluster-header'>",
            f"        <div class='cluster-title'>クラスタ {cluster_id}</div>",
            f"        <div class='cluster-meta'>{message_count}件のメッセージ</div>",
            "      </div>",
        ])

        if intents:
            html_parts.append("      <div class='intents-container'>")
            for i, intent in enumerate(intents, 1):
                status = intent.get('status', 'unknown')
                status_class = f"status-{status}"

                # 意図の説明文を柔軟に取得（description, intent, その他の順で探す）
                description = intent.get('description') or intent.get('intent') or '（説明なし）'

                html_parts.extend([
                    "        <div class='intent-card'>",
                    "          <div class='intent-header'>",
                    f"            <div class='intent-description'>{i}. {description}</div>",
                    f"            <div class='intent-status {status_class}'>{status}</div>",
                    "          </div>",
                ])

                # 特別なキーを除外して、残りのフィールドを動的に表示
                special_keys = {'description', 'intent', 'status', 'source_message_ids'}

                # 日本語ラベルマッピング
                label_map = {
                    'target': '対象',
                    'motivation': '動機',
                    'why': '理由',
                    'objective_facts': '客観的事実',
                }

                for key, value in intent.items():
                    if key in special_keys:
                        continue
                    if key == 'source_message_ids':
                        continue
                    if value is None or value == '':
                        continue

                    label = label_map.get(key, key)
                    html_parts.extend([
                        "          <div class='intent-field'>",
                        f"            <div class='field-label'>{label}:</div>",
                        f"            <div class='field-value'>{value}</div>",
                        "          </div>",
                    ])

                # source_message_ids（常に表示）
                if intent.get('source_message_ids'):
                    html_parts.extend([
                        "          <div class='intent-field'>",
                        "            <div class='field-label'>メッセージID:</div>",
                        "            <div class='message-ids'>",
                    ])
                    for msg_id in intent['source_message_ids']:
                        html_parts.append(f"              <span class='message-id-tag'>{msg_id}</span>")
                    html_parts.extend([
                        "            </div>",
                        "          </div>",
                    ])

                html_parts.append("        </div>")

            html_parts.append("      </div>")
        else:
            html_parts.append("      <div class='error-message'>⚠️ 意図抽出に失敗しました</div>")

        html_parts.append("    </div>")

    html_parts.extend([
        "  </div>",
        "</body>",
        "</html>",
    ])

    output_file = OUTPUT_DIR / "intent_review.html"
    with open(output_file, 'w', encoding='utf-8') as f:
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
        cluster_id = prompt_info['cluster_id']
        message_count = prompt_info['message_count']
        filename = f"cluster_{cluster_id:02d}_prompt.md"

        # プレビュー用に最初のメッセージを取得
        first_msg = prompt_info['messages'][0] if prompt_info['messages'] else None
        preview = first_msg['content'][:200] + "..." if first_msg else ""

        html_parts.extend([
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
        ])

    html_parts.extend([
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
    ])

    index_file = OUTPUT_DIR / "index.html"
    with open(index_file, 'w', encoding='utf-8') as f:
        f.write("\n".join(html_parts))

    print(f"\n✓ レビュー用インデックスを生成: {index_file}")


if __name__ == "__main__":
    main()

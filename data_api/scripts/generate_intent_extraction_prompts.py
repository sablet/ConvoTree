#!/usr/bin/env python3
"""
クラスタごとの意図抽出プロンプト生成

各クラスタのメッセージから意図オブジェクトを抽出するためのプロンプトを生成
"""

import json
import pandas as pd
from pathlib import Path
from typing import List, Dict
from datetime import datetime


OUTPUT_DIR = Path("output/intent_extraction")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

TEMPLATE_DIR = Path("templates")
TEMPLATE_FILE = TEMPLATE_DIR / "intent_extraction_prompt.md"


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


def main():
    """メイン処理"""
    print("=" * 60)
    print("意図抽出プロンプト生成")
    print("=" * 60)

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

    # クラスタごとにプロンプト生成
    cluster_ids = sorted(df['cluster'].unique())
    print(f"\n{len(cluster_ids)}個のクラスタに対してプロンプトを生成します\n")

    all_prompts = []

    for cluster_id in cluster_ids:
        cluster_df = df[df['cluster'] == cluster_id]
        prompt_info = generate_cluster_prompt(cluster_id, cluster_df, template)
        all_prompts.append(prompt_info)

        # 個別ファイルとして保存
        output_file = OUTPUT_DIR / f"cluster_{cluster_id:02d}_prompt.md"
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(prompt_info['prompt'])

        print(f"✓ クラスタ {cluster_id:2d}: {prompt_info['message_count']:3d}件のメッセージ → {output_file.name}")

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

    # レビュー用のインデックスHTMLを生成
    generate_review_index(all_prompts)

    print("\n" + "=" * 60)
    print("✅ プロンプト生成完了！")
    print("=" * 60)
    print(f"📁 出力ディレクトリ: {OUTPUT_DIR}")
    print(f"📄 レビュー用インデックス: {OUTPUT_DIR / 'index.html'}")
    print(f"\n次のステップ:")
    print(f"  1. {OUTPUT_DIR}/index.html をブラウザで開く")
    print(f"  2. 各クラスタのプロンプトをレビュー")
    print(f"  3. LLMに投げて意図オブジェクトを抽出")


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

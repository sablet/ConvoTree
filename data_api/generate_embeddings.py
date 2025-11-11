#!/usr/bin/env python3
"""
メッセージの埋め込みベクトル生成

Gemini Embedding APIを使用してメッセージのベクトル埋め込みを生成
"""

import json
import os
import hashlib
from pathlib import Path
import pandas as pd
from dotenv import load_dotenv
import google.generativeai as genai
from tqdm import tqdm
from app.cache import get_cache

# 環境変数読み込み
load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")
if api_key:
    genai.configure(api_key=api_key)

# 出力ディレクトリ
OUTPUT_DIR = Path("output")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def generate_embedding(text: str, cache) -> list[float]:
    """
    テキストから埋め込みベクトルを生成（キャッシュ付き）

    Args:
        text: 埋め込みを生成するテキスト
        cache: キャッシュインスタンス

    Returns:
        埋め込みベクトル（768次元）
    """
    # キャッシュキー生成
    cache_key = hashlib.md5(text.encode('utf-8')).hexdigest()

    # キャッシュチェック
    cached_result = cache.get(cache_key)
    if cached_result is not None:
        return cached_result

    # Gemini Embedding API呼び出し
    try:
        result = genai.embed_content(
            model="models/embedding-001",
            content=text,
            task_type="clustering"
        )
        embedding = result['embedding']

        # キャッシュに保存
        cache.set(cache_key, embedding)

        return embedding
    except Exception as e:
        print(f"  ! 埋め込み生成エラー: {e}")
        # エラー時はゼロベクトルを返す
        return [0.0] * 768


def main():
    """メイン処理"""
    print("=" * 60)
    print("メッセージ埋め込み生成")
    print("=" * 60)

    # 入力CSVパス
    csv_path = "/Users/mikke/git_dir/chat-line/output/db-exports/2025-11-10T23-54-08/messages_with_hierarchy.csv"

    # CSV読み込み
    print(f"\nCSVを読み込み中: {csv_path}")
    df = pd.read_csv(csv_path)
    print(f"✓ {len(df)}件のメッセージを読み込みました")

    # message_idを生成（message_clustering.pyと同じロジック）
    df['message_id'] = [f"msg_{i:05d}" for i in range(len(df))]

    # キャッシュ初期化
    cache = get_cache("embeddings")

    # 埋め込み生成
    print("\n埋め込みベクトルを生成中...")
    embeddings_data = []

    for _, row in tqdm(df.iterrows(), total=len(df), desc="Generating embeddings"):
        msg_id = row['message_id']
        text = row['combined_content']

        # 空のテキストはスキップ
        if pd.isna(text) or str(text).strip() == "":
            print(f"  ! メッセージ {msg_id} はテキストが空のためスキップ")
            continue

        # 埋め込み生成
        embedding = generate_embedding(str(text), cache)

        embeddings_data.append({
            'id': msg_id,
            'embedding': embedding
        })

    # JSON保存
    output_path = OUTPUT_DIR / "messages_embedded.json"
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(embeddings_data, f, ensure_ascii=False, indent=2)

    print(f"\n✓ 埋め込みを保存: {output_path}")
    print(f"  - 件数: {len(embeddings_data)}")
    print(f"  - 次元数: {len(embeddings_data[0]['embedding']) if embeddings_data else 0}")

    print("\n" + "=" * 60)
    print("✅ 埋め込み生成完了！")
    print("=" * 60)
    print(f"📁 出力ファイル: {output_path}")
    print("\n次のステップ:")
    print("  uv run python message_clustering.py")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Gemini API テストプログラム

使用モデル（2025年11月時点の最新安定版）:
- gemini-2.5-flash: テキスト生成（価格とパフォーマンスのバランスが最良）
- gemini-embedding-001: 埋め込みベクトル生成（768次元、100言語以上対応）
  - 出力次元: 128-3072（推奨: 768, 1536, 3072）
  - 入力制限: 2,048トークン

旧モデル（非推奨）:
- text-embedding-004: 2026年1月14日に廃止予定
"""

import os
from dotenv import load_dotenv
import google.generativeai as genai

def main():
    # .env ファイルから環境変数を読み込み
    load_dotenv()

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY が .env ファイルに設定されていません")

    # API キーを設定
    genai.configure(api_key=api_key)

    print("=" * 60)
    print("Gemini API テスト開始")
    print("=" * 60)

    # テスト1: Gemini 2.5 Flash でテキスト生成
    test_gemini_flash()

    print()

    # テスト2: Embedding モデルでベクトル生成
    test_gemini_embedding()

    print("=" * 60)
    print("全テスト完了")
    print("=" * 60)


def test_gemini_flash():
    """Gemini 2.5 Flash のテスト"""
    print("\n[テスト1] Gemini 2.5 Flash - テキスト生成")
    print("-" * 60)

    try:
        # モデルを初期化（最新安定版）
        model = genai.GenerativeModel("gemini-2.5-flash")

        # テストプロンプト
        prompt = "こんにちは。簡単な自己紹介をしてください。"

        print(f"プロンプト: {prompt}")
        print()

        # テキスト生成
        response = model.generate_content(prompt)

        print(f"レスポンス: {response.text}")
        print(f"✓ Gemini 2.5 Flash のテストに成功しました")

    except Exception as e:
        print(f"✗ エラー: {e}")
        raise


def test_gemini_embedding():
    """Gemini Embedding モデルのテスト"""
    print("\n[テスト2] Gemini Embedding Model - 埋め込みベクトル生成")
    print("-" * 60)

    try:
        # テストテキスト
        text = "フッターUIからラインを切り替える機能を実装したい"

        print(f"テキスト: {text}")
        print()

        # Embedding 生成（最新安定版）
        result = genai.embed_content(
            model="models/gemini-embedding-001",
            content=text,
            task_type="retrieval_document",
            output_dimensionality=768  # 推奨: 768, 1536, 3072
        )

        embedding = result["embedding"]

        print(f"埋め込みベクトルの次元数: {len(embedding)}")
        print(f"最初の10次元: {embedding[:10]}")
        print(f"✓ Gemini Embedding Model のテストに成功しました")

    except Exception as e:
        print(f"✗ エラー: {e}")
        raise


if __name__ == "__main__":
    main()

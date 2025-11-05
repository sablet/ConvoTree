"""Pipeline 3: Embedding生成（LLM）"""
import os
import time
import hashlib
from dotenv import load_dotenv
import google.generativeai as genai
from tqdm import tqdm
from app.models import Intent
from app.cache import get_cache


# .env ファイルから環境変数を読み込み
load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")
if api_key:
    genai.configure(api_key=api_key)


def run_pipeline3(intents: list[Intent]) -> list[Intent]:
    """
    Intent に Embedding を生成して付与する（100件未満のバッチ処理）

    Args:
        intents: Intent のリスト

    Returns:
        Embedding が付与された Intent のリスト
    """
    BATCH_SIZE = 49  # 100件未満
    cache = get_cache("pipeline3")

    # intentsをBATCH_SIZEごとにチャンク分割
    chunks = [intents[i : i + BATCH_SIZE] for i in range(0, len(intents), BATCH_SIZE)]

    for idx, chunk in enumerate(tqdm(chunks, desc="Embedding生成", unit="batch")):
        try:
            # チャンク内の全Intentのsummaryを集める
            summaries = [intent.summary for intent in chunk]

            # キャッシュキーを生成（summary一覧のハッシュ）
            cache_key = hashlib.sha256(
                "\n".join(summaries).encode("utf-8")
            ).hexdigest()

            # キャッシュから取得を試みる
            cached_embeddings = cache.get(cache_key)
            if cached_embeddings is not None:
                # キャッシュヒット: Embeddingを復元
                for intent, embedding in zip(chunk, cached_embeddings):
                    intent.embedding = embedding
                continue

            # バッチでEmbedding生成
            result = genai.embed_content(
                model="models/gemini-embedding-001",
                content=summaries,
                task_type="retrieval_document",
                output_dimensionality=768,  # 推奨: 768, 1536, 3072
            )

            # 結果を各Intentに割り当て
            # contentをリストで渡した場合、result["embedding"]は常にリストのリストになる
            embeddings = result["embedding"]

            # 単一のcontentでもリスト形式で返される
            if not isinstance(embeddings[0], list):
                # 単一のembeddingが直接返された場合（リストとして渡したのに1つだけの場合など）
                embeddings = [embeddings]

            for intent, embedding in zip(chunk, embeddings):
                intent.embedding = embedding

            # キャッシュに保存
            cache.set(cache_key, embeddings)

            # Rate limit対策: 次のリクエストまで5秒待機（最後のバッチ以外）
            if idx < len(chunks) - 1:
                time.sleep(60)

        except Exception as e:
            print(f"\nError generating embeddings for batch {idx}: {e}")
            # エラー時は例外を再raiseして処理を中断
            raise

    return intents

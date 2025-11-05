"""Pipeline 3: Embedding生成（LLM）"""
import os
from dotenv import load_dotenv
import google.generativeai as genai
from app.models import Intent


# .env ファイルから環境変数を読み込み
load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")
if api_key:
    genai.configure(api_key=api_key)


def run_pipeline3(intents: list[Intent]) -> list[Intent]:
    """
    Intent に Embedding を生成して付与する

    Args:
        intents: Intent のリスト

    Returns:
        Embedding が付与された Intent のリスト
    """
    for intent in intents:
        try:
            # Embedding 生成
            result = genai.embed_content(
                model="models/gemini-embedding-001",
                content=intent.summary,
                task_type="retrieval_document",
                output_dimensionality=768,  # 推奨: 768, 1536, 3072
            )

            intent.embedding = result["embedding"]

        except Exception as e:
            print(f"Error generating embedding for intent {intent.id}: {e}")
            intent.embedding = None

    return intents

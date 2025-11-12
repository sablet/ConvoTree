"""
litellm + diskcache ユーティリティ

Gemini APIをlitellm経由で呼び出し、diskcacheで自動キャッシュする。
既存のgenai.GenerativeModel呼び出しを置き換えるための互換レイヤー。
"""

import os
import litellm
from litellm import completion
from litellm.caching import Cache
from pathlib import Path
from typing import Optional


# デフォルトのキャッシュディレクトリ
DEFAULT_CACHE_DIR = Path("output/.cache/litellm")
DEFAULT_CACHE_DIR.mkdir(parents=True, exist_ok=True)

# グローバルなキャッシュインスタンス（litellmが内部で使用）
litellm.cache = Cache(type="disk", disk_cache_dir=str(DEFAULT_CACHE_DIR))


class GenerativeModel:
    """
    genai.GenerativeModel の互換インターフェース
    litellm + diskcache を使って Gemini API を呼び出す
    """

    def __init__(
        self,
        model_name: str = "gemini-2.5-flash",
        cache_dir: Optional[Path] = None
    ):
        """
        Args:
            model_name: Geminiモデル名（例: "gemini-2.5-flash"）
            cache_dir: キャッシュディレクトリ（Noneの場合はデフォルト）
        """
        # litellmのモデル名に変換（"gemini/" プレフィックスが必要）
        if not model_name.startswith("gemini/"):
            self.model_name = f"gemini/{model_name}"
        else:
            self.model_name = model_name

        # キャッシュディレクトリを設定（指定された場合）
        if cache_dir is not None:
            cache_dir = Path(cache_dir)
            cache_dir.mkdir(parents=True, exist_ok=True)
            litellm.cache = Cache(type="disk", disk_cache_dir=str(cache_dir))

    def generate_content(self, prompt: str, temperature: float = 0.0) -> "Response":
        """
        コンテンツを生成（genai.GenerativeModel.generate_content の互換）

        Args:
            prompt: 入力プロンプト
            temperature: 温度パラメータ（デフォルト: 0.0）

        Returns:
            Response オブジェクト（.text 属性でテキスト取得可能）
        """
        response = completion(
            model=self.model_name,
            messages=[{"role": "user", "content": prompt}],
            caching=True,
            temperature=temperature,
        )

        return Response(response)


class Response:
    """
    genai.Response の互換インターフェース
    litellm のレスポンスをラップ
    """

    def __init__(self, litellm_response):
        """
        Args:
            litellm_response: litellm.completion() の返り値
        """
        self._response = litellm_response

    @property
    def text(self) -> str:
        """レスポンステキストを取得"""
        return self._response.choices[0].message.content


def configure(api_key: Optional[str] = None):
    """
    genai.configure の互換関数
    litellm は環境変数 GEMINI_API_KEY を自動で読み込むため、何もしない
    """
    if api_key:
        os.environ["GEMINI_API_KEY"] = api_key


def get_cache_stats() -> dict:
    """
    キャッシュの統計情報を取得

    Returns:
        {"cache_dir": str, "cache_size": int}
    """
    cache_dir = str(DEFAULT_CACHE_DIR)
    cache_size = 0

    if litellm.cache:
        # diskcacheのCacheオブジェクトからサイズを取得
        try:
            # diskcache.Cache は __len__ を持たないので、volume() を使う
            if hasattr(litellm.cache, 'volume'):
                cache_size = litellm.cache.volume()
            elif hasattr(litellm.cache, '__len__'):
                cache_size = len(litellm.cache)
        except Exception:
            cache_size = -1  # サイズ取得失敗

    return {
        "cache_dir": cache_dir,
        "cache_size": cache_size,
    }

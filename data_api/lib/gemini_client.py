"""
litellm + diskcache ユーティリティ

Gemini APIをlitellm経由で呼び出し、diskcacheで自動キャッシュする。
既存のgenai.GenerativeModel呼び出しを置き換えるための互換レイヤー。
"""

import os
import litellm
from litellm import ModelResponse, completion
from litellm.caching import Cache
from pathlib import Path
from typing import Optional, Callable, TypeVar, List, Any
from concurrent.futures import ThreadPoolExecutor, as_completed
from tqdm import tqdm  # type: ignore[import-untyped]

T = TypeVar("T")

# キャッシュ判定用定数
CACHE_HIT_THRESHOLD_SECONDS = 0.1  # キャッシュヒットは通常0.1秒未満

# デフォルトのキャッシュディレクトリ
DEFAULT_CACHE_DIR = Path("output/.cache/litellm")
DEFAULT_CACHE_DIR.mkdir(parents=True, exist_ok=True)

# グローバルなキャッシュインスタンス（litellmが内部で使用）
litellm.cache = Cache(type="disk", disk_cache_dir=str(DEFAULT_CACHE_DIR))  # type: ignore[arg-type]


class GenerativeModel:
    """
    genai.GenerativeModel の互換インターフェース
    litellm + diskcache を使って Gemini API を呼び出す
    """

    def __init__(
        self, model_name: str = "gemini-2.5-flash", cache_dir: Optional[Path] = None
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
            litellm.cache = Cache(type="disk", disk_cache_dir=str(cache_dir))  # type: ignore[arg-type]

    def generate_content(self, prompt: str, temperature: float = 0.0) -> "Response":
        """
        コンテンツを生成（genai.GenerativeModel.generate_content の互換）

        Args:
            prompt: 入力プロンプト
            temperature: 温度パラメータ（デフォルト: 0.0）

        Returns:
            Response オブジェクト（.text 属性でテキスト取得可能）
        """
        import time as _time

        _start = _time.time()
        response = completion(
            model=self.model_name,
            messages=[{"role": "user", "content": prompt}],
            caching=True,
            temperature=temperature,
        )
        _elapsed = _time.time() - _start

        # キャッシュヒット判定
        _status = "CACHE" if _elapsed < CACHE_HIT_THRESHOLD_SECONDS else "API"
        print(f"[{_status}] {_elapsed:.3f}s", flush=True)

        return Response(response)


class Response:
    """
    genai.Response の互換インターフェース
    litellm のレスポンスをラップ
    """

    def __init__(self, litellm_response: ModelResponse):
        """
        Args:
            litellm_response: litellm.completion() の返り値
        """
        self._response = litellm_response

    @property
    def text(self) -> str:
        """レスポンステキストを取得"""
        choice = self._response.choices[0]
        if hasattr(choice, "message"):
            content = choice.message.content
            return content if content is not None else ""
        return ""


def configure(api_key: Optional[str] = None):
    """
    genai.configure の互換関数
    litellm は環境変数 GEMINI_API_KEY を自動で読み込むため、何もしない
    """
    if api_key:
        os.environ["GEMINI_API_KEY"] = api_key


def initialize() -> None:
    """
    Gemini API を初期化（dotenv 読み込み + API key 設定）

    .env ファイルから GEMINI_API_KEY を読み込んで、環境変数に設定します。
    scripts から呼び出す際はこの関数を使用してください。

    Raises:
        SystemExit: GEMINI_API_KEY が設定されていない場合

    使用例:
        >>> from lib import gemini_client
        >>> gemini_client.initialize()
        >>> model = gemini_client.GenerativeModel()
    """
    from dotenv import load_dotenv

    load_dotenv()
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("❌ エラー: GEMINI_API_KEY が .env ファイルに設定されていません")
        raise SystemExit(1)

    configure(api_key=api_key)
    print("✓ Gemini API を初期化しました（litellm + diskcacheでキャッシュ有効）")


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
            if hasattr(litellm.cache, "volume"):
                cache_size = litellm.cache.volume()
            elif hasattr(litellm.cache, "__len__"):
                cache_size = len(litellm.cache)
        except Exception:
            cache_size = -1  # サイズ取得失敗

    return {
        "cache_dir": cache_dir,
        "cache_size": cache_size,
    }


def parallel_execute(
    items: List,
    process_func: Callable[[Any], T],
    max_workers: int = 5,
    desc: str = "Processing",
    unit: str = "item",
) -> List[T]:
    """
    並列実行ヘルパー関数

    Args:
        items: 処理対象のアイテムのリスト
        process_func: 各アイテムを処理する関数 (item) -> result
        max_workers: 最大並列実行数（デフォルト: 5）
        desc: tqdmの進捗バーの説明
        unit: tqdmの単位

    Returns:
        処理結果のリスト（元の順序を保持）

    Raises:
        例外が発生した場合、最初の例外をそのまま raise

    使用例:
        >>> def process(cluster_id):
        ...     # 重い処理
        ...     return result
        >>> results = parallel_execute(cluster_ids, process, max_workers=5)
    """
    results: List[Optional[T]] = [None] * len(items)  # 順序を保持するための結果配列
    item_to_index = {id(item): idx for idx, item in enumerate(items)}

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Future -> (item, index) のマッピング
        future_to_item = {
            executor.submit(process_func, item): (item, item_to_index[id(item)])
            for item in items
        }

        # tqdmで進捗表示しながら結果を収集
        with tqdm(total=len(items), desc=desc, unit=unit) as pbar:
            for future in as_completed(future_to_item):
                item, idx = future_to_item[future]
                try:
                    result = future.result()
                    results[idx] = result
                    pbar.update(1)
                except Exception as exc:
                    # 例外発生時は全タスクをキャンセルして例外を再raise
                    pbar.write(f"\n❌ エラー発生: {type(exc).__name__}: {exc}")
                    executor.shutdown(wait=False, cancel_futures=True)
                    raise

    # Cast to List[T] - all items should be filled by this point
    return results  # type: ignore[return-value]

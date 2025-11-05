"""Gemini API のローカルキャッシュ機能（diskcache使用）"""
from diskcache import Cache


# グローバルキャッシュインスタンス（パイプラインごとに分離）
_caches: dict[str, Cache] = {}


def get_cache(pipeline_name: str) -> Cache:
    """
    パイプライン名に対応するキャッシュインスタンスを取得

    Args:
        pipeline_name: パイプライン名（例: "pipeline2", "pipeline3", "pipeline5"）

    Returns:
        Cache インスタンス
    """
    if pipeline_name not in _caches:
        cache_dir = f"output/cache/{pipeline_name}"
        _caches[pipeline_name] = Cache(cache_dir)
    return _caches[pipeline_name]

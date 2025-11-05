"""Pipeline 4: 類似Intent検索"""
import math
from datetime import datetime
from app.models import Intent, SimilarIntents


def run_pipeline4(
    intents: list[Intent],
    source_intent_id: str,
    n_temporal: int = 5,
    m_similarity: int = 5,
) -> SimilarIntents:
    """
    類似Intent検索

    Args:
        intents: Intent のリスト
        source_intent_id: 検索対象のIntent ID
        n_temporal: 時系列で近いIntent数
        m_similarity: 類似度が高いIntent数

    Returns:
        SimilarIntents オブジェクト
    """
    # ソースIntentを取得
    source_intent = None
    for intent in intents:
        if intent.id == source_intent_id:
            source_intent = intent
            break

    if source_intent is None:
        raise ValueError(f"Intent not found: {source_intent_id}")

    # 時系列検索
    temporal_neighbors = _find_temporal_neighbors(intents, source_intent, n_temporal)

    # 類似度検索
    similarity_neighbors = _find_similarity_neighbors(intents, source_intent, m_similarity)

    return SimilarIntents(
        source_intent_id=source_intent_id,
        temporal_neighbors=temporal_neighbors,
        similarity_neighbors=similarity_neighbors,
    )


def _find_temporal_neighbors(
    intents: list[Intent],
    source_intent: Intent,
    n: int,
) -> list[str]:
    """時系列で近いIntentを検索"""
    # グループIDから作成時刻を推定（group_000, group_001, ...）
    source_index = int(source_intent.group_id.split("_")[-1])

    # 他のIntentとの時系列距離を計算
    distances: list[tuple[str, int]] = []
    for intent in intents:
        if intent.id == source_intent.id:
            continue

        intent_index = int(intent.group_id.split("_")[-1])
        distance = abs(source_index - intent_index)
        distances.append((intent.id, distance))

    # 距離でソート
    distances.sort(key=lambda x: x[1])

    # 上位N個を返す
    return [intent_id for intent_id, _ in distances[:n]]


def _find_similarity_neighbors(
    intents: list[Intent],
    source_intent: Intent,
    m: int,
) -> list[str]:
    """類似度が高いIntentを検索"""
    if source_intent.embedding is None:
        return []

    # 他のIntentとのコサイン類似度を計算
    similarities: list[tuple[str, float]] = []
    for intent in intents:
        if intent.id == source_intent.id or intent.embedding is None:
            continue

        similarity = _cosine_similarity(source_intent.embedding, intent.embedding)
        similarities.append((intent.id, similarity))

    # 類似度でソート（降順）
    similarities.sort(key=lambda x: x[1], reverse=True)

    # 上位M個を返す
    return [intent_id for intent_id, _ in similarities[:m]]


def _cosine_similarity(vec1: list[float], vec2: list[float]) -> float:
    """コサイン類似度を計算"""
    if len(vec1) != len(vec2):
        raise ValueError("Vector dimensions must match")

    dot_product = sum(a * b for a, b in zip(vec1, vec2))
    norm1 = math.sqrt(sum(a * a for a in vec1))
    norm2 = math.sqrt(sum(b * b for b in vec2))

    if norm1 == 0 or norm2 == 0:
        return 0.0

    return dot_product / (norm1 * norm2)

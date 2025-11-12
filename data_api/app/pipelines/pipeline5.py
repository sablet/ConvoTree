"""Pipeline 5: Why/How関係抽出（LLM）- グループ単位"""
import json
import os
import math
import hashlib
from dotenv import load_dotenv
import google.generativeai as genai
from app.models import Intent, IntentRelation
from app.cache import get_cache


# .env ファイルから環境変数を読み込み
load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")
if api_key:
    genai.configure(api_key=api_key)


def run_pipeline5(
    intents: list[Intent],
    target_group_id: str,
    top_k_similar: int = 3,
) -> list[IntentRelation]:
    """
    グループ単位でIntent間のWhy/How関係を抽出する

    Args:
        intents: Intent のリスト
        target_group_id: 対象グループID
        top_k_similar: 各Intentごとの類似Intent数

    Returns:
        IntentRelation のリスト
    """
    # Intent辞書を作成
    intents_dict = {intent.id: intent for intent in intents}

    # グループごとにIntentを整理
    groups_dict: dict[str, list[Intent]] = {}
    for intent in intents:
        if intent.group_id not in groups_dict:
            groups_dict[intent.group_id] = []
        groups_dict[intent.group_id].append(intent)

    # 対象グループのIntentを取得
    target_intents = groups_dict.get(target_group_id, [])
    if not target_intents:
        raise ValueError(f"Group not found: {target_group_id}")

    # 候補Intentを収集
    candidate_intent_ids: set[str] = set()

    # 1. 対象グループの全Intent
    for intent in target_intents:
        candidate_intent_ids.add(intent.id)

    # 2. 対象グループのIntent数が5件未満の場合のみ、前のグループ
    prev_group_id = None
    if len(target_intents) < 5:
        prev_group_id = _get_previous_group_id(target_group_id)
        if prev_group_id and prev_group_id in groups_dict:
            for intent in groups_dict[prev_group_id]:
                candidate_intent_ids.add(intent.id)

    # 3. 各Intentごとに類似度上位k件
    for intent in target_intents:
        similar_ids = _find_top_k_similar(intent, intents, top_k_similar)
        candidate_intent_ids.update(similar_ids)

    # 候補Intentオブジェクトを取得
    candidate_intents = [
        intents_dict[intent_id]
        for intent_id in candidate_intent_ids
        if intent_id in intents_dict
    ]

    if len(candidate_intents) <= 1:
        return []

    # LLMで関係抽出
    relations = _extract_relations(target_intents, candidate_intents)

    # グループ内Intentが含まれるリレーションのみフィルタリング
    target_intent_ids = {intent.id for intent in target_intents}
    filtered_relations = [
        rel for rel in relations
        if rel.source_intent_id in target_intent_ids or rel.target_intent_id in target_intent_ids
    ]

    return filtered_relations


def _get_previous_group_id(group_id: str) -> str | None:
    """前のグループIDを取得（group_000 -> None, group_001 -> group_000）"""
    try:
        parts = group_id.split("_")
        group_num = int(parts[-1])
        if group_num == 0:
            return None
        prev_num = group_num - 1
        return f"{parts[0]}_{prev_num:03d}"
    except (ValueError, IndexError):
        return None


def _find_top_k_similar(
    source_intent: Intent,
    all_intents: list[Intent],
    k: int,
) -> list[str]:
    """類似度上位k件のIntent IDを取得"""
    if source_intent.embedding is None:
        return []

    similarities: list[tuple[str, float]] = []
    for intent in all_intents:
        if intent.id == source_intent.id or intent.embedding is None:
            continue

        similarity = _cosine_similarity(source_intent.embedding, intent.embedding)
        similarities.append((intent.id, similarity))

    # 類似度でソート（降順）
    similarities.sort(key=lambda x: x[1], reverse=True)

    # 上位k個を返す
    return [intent_id for intent_id, _ in similarities[:k]]


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


def _extract_relations(
    target_intents: list[Intent],
    candidates: list[Intent],
) -> list[IntentRelation]:
    """LLMを使用してWhy/How関係を抽出（グループ単位）"""
    # キャッシュキーを生成（対象IntentsとcandidatesのIDリストのハッシュ）
    cache_key_data = (
        ",".join([intent.id for intent in target_intents])
        + "|"
        + ",".join([candidate.id for candidate in candidates])
    )
    cache_key = hashlib.sha256(cache_key_data.encode("utf-8")).hexdigest()
    cache = get_cache("pipeline5")

    # キャッシュから取得を試みる
    cached_result = cache.get(cache_key)
    if cached_result is not None:
        # キャッシュヒット: IntentRelation オブジェクトを復元
        relations: list[IntentRelation] = []
        for rel_dict in cached_result:
            relation = IntentRelation(
                source_intent_id=rel_dict["source_intent_id"],
                target_intent_id=rel_dict["target_intent_id"],
                relation_type=rel_dict["relation_type"],
            )
            relations.append(relation)
        return relations

    # 対象グループのIntentsを整形
    target_intents_text = "\n".join([
        f"{i+1}. \"{intent.summary}\" (ID: {intent.id})"
        for i, intent in enumerate(target_intents)
    ])

    # 候補Intentsを整形
    candidates_text = "\n".join([
        f"{i+1}. \"{candidate.summary}\" (ID: {candidate.id})"
        for i, candidate in enumerate(candidates)
    ])

    # プロンプト作成
    prompt = f"""# 対象グループのIntents
{target_intents_text}

# 候補Intents（関係を探す対象）
{candidates_text}

# タスク
対象グループのIntentと候補Intentsの間でWhy/How関係を判定してください：
- Why関係: あるIntentの背景・理由・原因となるIntent
- How関係: あるIntentの実現手段・解決方法となるIntent

**重要**: 返すリレーションは、fromまたはtoのいずれかに対象グループのIntent（1〜{len(target_intents)}番）が含まれるもののみとしてください。

# 出力形式（JSON）
{{
  "relations": [
    {{"from": 候補の番号, "to": 候補の番号, "type": "why"}},
    {{"from": 候補の番号, "to": 候補の番号, "type": "how"}}
  ]
}}

# 説明
- "from" → "to" の方向で関係を示します
- type="why": fromがtoの背景・理由（to WHY? → from）
- type="how": fromがtoの実現手段（to HOW? → from）
- 該当がない場合は空配列を返してください
- JSON形式で返してください（他の説明は不要）
"""

    try:
        # Gemini 2.5 Flash でテキスト生成
        model = genai.GenerativeModel("gemini-2.5-flash")
        response = model.generate_content(prompt)

        # JSONをパース
        response_text = response.text.strip()

        # Markdown形式の場合、コードブロックを除去
        if response_text.startswith("```json"):
            response_text = response_text.replace("```json", "").replace("```", "").strip()
        elif response_text.startswith("```"):
            response_text = response_text.replace("```", "").strip()

        relations_data = json.loads(response_text)

        # IntentRelation オブジェクトを作成
        relations: list[IntentRelation] = []

        for rel in relations_data.get("relations", []):
            from_index = int(rel["from"]) - 1
            to_index = int(rel["to"]) - 1
            rel_type = rel["type"]

            if from_index < 0 or from_index >= len(candidates):
                continue
            if to_index < 0 or to_index >= len(candidates):
                continue

            from_intent = candidates[from_index]
            to_intent = candidates[to_index]

            relation = IntentRelation(
                source_intent_id=from_intent.id,
                target_intent_id=to_intent.id,
                relation_type=rel_type,
            )
            relations.append(relation)

        # キャッシュに保存
        cache.set(cache_key, [rel.to_dict() for rel in relations])

        return relations

    except Exception as e:
        print(f"Error extracting relations for group: {e}")
        return []

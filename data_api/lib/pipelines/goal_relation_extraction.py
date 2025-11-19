#!/usr/bin/env python3
"""
Goal間のリレーション抽出パイプライン

クラスタごとに抽出されたGoalオブジェクト間のリレーションを判定し、
孤立ノードの分析を行う。

使用例:
  python main.py goal_relation_extraction
"""

import json
import numpy as np
import pandas as pd  # type: ignore[import-untyped]
import matplotlib.pyplot as plt  # type: ignore[import-untyped]
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from sentence_transformers import SentenceTransformer  # type: ignore[import-untyped]
from joblib import Memory  # type: ignore[import-untyped]

# キャッシュディレクトリ
CACHE_DIR = Path(".cache/goal_relation_extraction")
CACHE_DIR.mkdir(parents=True, exist_ok=True)
memory = Memory(str(CACHE_DIR), verbose=0)

# 出力ディレクトリ
OUTPUT_DIR = Path("output/goal_relation_extraction")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Sentence Transformerモデル
_model_instance: Optional[SentenceTransformer] = None

# 類似度閾値の定数
# 単一の選択肢は0.8をベースとし、OR条件の選択肢が多いほど厳しめに調整
THRESHOLD_HIERARCHY_THEME = 0.8
THRESHOLD_HIERARCHY_SUBJECT = 0.8
THRESHOLD_MEANS_END = 0.85  # 4つの選択肢のOR
THRESHOLD_DEPENDENCY = 0.83  # 3つの選択肢のOR
THRESHOLD_CAUSAL = 0.82  # 2つの選択肢のOR


def _get_model() -> SentenceTransformer:
    """Sentence Transformerモデルを取得（シングルトン）"""
    global _model_instance
    if _model_instance is None:
        print("  ruri-large-v2 モデルをロード中...")
        _model_instance = SentenceTransformer("cl-nagoya/ruri-large-v2")
        print("  ✓ モデルロード完了")
    return _model_instance


@memory.cache
def _compute_embeddings_cached(texts: List[str], cache_key: str) -> List[List[float]]:
    """
    埋め込みベクトルを計算（キャッシュ付き）

    Args:
        texts: テキストのリスト
        cache_key: キャッシュキー（SHA256ハッシュ）

    Returns:
        埋め込みベクトルのリスト
    """
    print(f"  埋め込みを生成中... ({len(texts)}件)")
    model = _get_model()
    batch_embeddings = model.encode(
        texts, convert_to_tensor=False, show_progress_bar=True, batch_size=32
    )
    return [embedding.tolist() for embedding in batch_embeddings]


def cosine_similarity(vec1: np.ndarray, vec2: np.ndarray) -> float:
    """コサイン類似度を計算"""
    dot_product = np.dot(vec1, vec2)
    norm1 = np.linalg.norm(vec1)
    norm2 = np.linalg.norm(vec2)
    if norm1 == 0 or norm2 == 0:
        return 0.0
    return float(dot_product / (norm1 * norm2))


@dataclass
class GoalNode:
    """Goalノードの表現"""

    node_id: str  # cluster_id + "_" + index
    cluster_id: int
    index: int  # クラスタ内のインデックス
    abstraction_level: str  # L2-L5
    abstraction_level_num: int  # 2-5
    theme: str
    subject: str
    action: List[str]
    target: List[Any]  # 文字列またはオブジェクト
    conditions: List[str]
    issue: List[str]
    domain: List[str]
    source_message_ids: List[str]
    source_full_paths: List[str]  # メッセージの full_path
    raw_data: Dict[str, Any]  # 元のJSONデータ

    # 埋め込みベクトル
    theme_embedding: Optional[np.ndarray] = None
    subject_embedding: Optional[np.ndarray] = None
    action_embedding: Optional[np.ndarray] = None
    target_embedding: Optional[np.ndarray] = None
    conditions_embedding: Optional[np.ndarray] = None
    issue_embedding: Optional[np.ndarray] = None


@dataclass
class RelationCandidate:
    """リレーション候補"""

    source_node_id: str
    target_node_id: str
    relation_type: str  # "hierarchy", "means_end", "dependency", "causal"
    score: float  # 類似度スコア
    reason: str  # 判定理由


def parse_abstraction_level(level_str: str) -> int:
    """
    abstraction_levelの文字列を数値に変換

    L2: Theme -> 2
    L3: Project -> 3
    L4: Subgoal -> 4
    L5: Task -> 5
    """
    if "L2" in level_str:
        return 2
    elif "L3" in level_str:
        return 3
    elif "L4" in level_str:
        return 4
    elif "L5" in level_str:
        return 5
    else:
        return 0


def load_all_goals() -> List[GoalNode]:
    """全クラスターファイルからGoalデータを読み込む"""
    processed_dir = Path("output/goal_extraction/processed")
    if not processed_dir.exists():
        raise FileNotFoundError(f"処理済みディレクトリが見つかりません: {processed_dir}")

    goal_files = sorted(processed_dir.glob("cluster_*_goals.json"))
    if not goal_files:
        raise FileNotFoundError(f"Goalファイルが見つかりません: {processed_dir}")

    all_goals = []
    for goal_file in goal_files:
        cluster_id = int(goal_file.stem.split("_")[1])
        with open(goal_file, "r", encoding="utf-8") as f:
            goals_data = json.load(f)

        for index, goal_data in enumerate(goals_data):
            node_id = f"{cluster_id:02d}_{index:02d}"
            abstraction_level = goal_data.get("abstraction_level", "")
            abstraction_level_num = parse_abstraction_level(abstraction_level)

            # targetからテキスト部分を抽出
            target_texts = []
            for t in goal_data.get("target", []):
                if isinstance(t, dict):
                    target_texts.append(t.get("name", ""))
                else:
                    target_texts.append(str(t))

            goal_node = GoalNode(
                node_id=node_id,
                cluster_id=cluster_id,
                index=index,
                abstraction_level=abstraction_level,
                abstraction_level_num=abstraction_level_num,
                theme=goal_data.get("theme", ""),
                subject=goal_data.get("subject", ""),
                action=goal_data.get("action", []),
                target=goal_data.get("target", []),
                conditions=goal_data.get("conditions", []),
                issue=goal_data.get("issue", []),
                domain=goal_data.get("domain", []),
                source_message_ids=goal_data.get("source_message_ids", []),
                source_full_paths=goal_data.get("source_full_paths", []),
                raw_data=goal_data,
            )
            all_goals.append(goal_node)

    print(f"✓ {len(all_goals)}件のGoalノードを読み込みました")
    return all_goals


def check_relation_precondition(goal_a: GoalNode, goal_b: GoalNode) -> bool:
    """
    リレーション抽出の前提条件をチェック

    条件:
    (a.abstraction_level <= b.abstraction_level) AND
    [(a.domain と b.domain に1つ以上の共通要素がある) OR (full_path が完全一致)]

    Returns:
        前提条件を満たす場合True
    """
    # 条件1: abstraction_level (必須)
    if goal_a.abstraction_level_num > goal_b.abstraction_level_num:
        return False

    # 条件2: domain の共通要素 OR full_path の完全一致
    has_common_domain = False
    has_common_path = False

    if goal_a.domain and goal_b.domain:
        common_domains = set(goal_a.domain) & set(goal_b.domain)
        if common_domains:
            has_common_domain = True

    if goal_a.source_full_paths and goal_b.source_full_paths:
        common_paths = set(goal_a.source_full_paths) & set(goal_b.source_full_paths)
        if common_paths:
            has_common_path = True

    return has_common_domain or has_common_path


def compute_goal_embeddings(goals: List[GoalNode]) -> None:
    """Goalノードの埋め込みベクトルを計算"""
    import hashlib

    # 各フィールドのテキストを収集
    theme_texts = [goal.theme for goal in goals]
    subject_texts = [goal.subject for goal in goals]
    action_texts = [", ".join(goal.action) for goal in goals]
    target_texts = [
        ", ".join(
            [t.get("name", "") if isinstance(t, dict) else str(t) for t in goal.target]
        )
        for goal in goals
    ]
    conditions_texts = [", ".join(goal.conditions) for goal in goals]
    issue_texts = [", ".join(goal.issue) for goal in goals]

    # キャッシュキー生成
    def make_cache_key(texts: List[str]) -> str:
        concatenated = "||".join(texts)
        return hashlib.sha256(concatenated.encode()).hexdigest()

    # 埋め込み計算
    print("\n埋め込みベクトルを計算中...")
    theme_embeddings = _compute_embeddings_cached(
        theme_texts, make_cache_key(theme_texts)
    )
    subject_embeddings = _compute_embeddings_cached(
        subject_texts, make_cache_key(subject_texts)
    )
    action_embeddings = _compute_embeddings_cached(
        action_texts, make_cache_key(action_texts)
    )
    target_embeddings = _compute_embeddings_cached(
        target_texts, make_cache_key(target_texts)
    )
    conditions_embeddings = _compute_embeddings_cached(
        conditions_texts, make_cache_key(conditions_texts)
    )
    issue_embeddings = _compute_embeddings_cached(
        issue_texts, make_cache_key(issue_texts)
    )

    # 埋め込みを各ノードに割り当て
    for i, goal in enumerate(goals):
        goal.theme_embedding = np.array(theme_embeddings[i])
        goal.subject_embedding = np.array(subject_embeddings[i])
        goal.action_embedding = np.array(action_embeddings[i])
        goal.target_embedding = np.array(target_embeddings[i])
        goal.conditions_embedding = np.array(conditions_embeddings[i])
        goal.issue_embedding = np.array(issue_embeddings[i])

    print("✓ 埋め込みベクトルの計算完了")


def extract_hierarchy_relations(
    goals: List[GoalNode],
    threshold_theme: float = THRESHOLD_HIERARCHY_THEME,
    threshold_subject: float = THRESHOLD_HIERARCHY_SUBJECT,
) -> List[RelationCandidate]:
    """
    階層関係（Parent-Child / 抽象-具体）を抽出

    条件:
    - 前提条件を満たす
    - abstraction_level が異なり、かつレベル差が1-2段階以内
    - theme の類似度が高い（> threshold_theme）
    - subject の類似度が中程度以上（> threshold_subject）

    方向: 抽象度が高い方 → 低い方
    """
    relations = []

    for goal_a in goals:
        for goal_b in goals:
            if goal_a.node_id == goal_b.node_id:
                continue

            # 前提条件チェック
            if not check_relation_precondition(goal_a, goal_b):
                continue

            # レベル差チェック
            level_diff = goal_b.abstraction_level_num - goal_a.abstraction_level_num
            if not (1 <= level_diff <= 2):
                continue

            # theme類似度
            if (
                goal_a.theme_embedding is None
                or goal_b.theme_embedding is None
                or not goal_a.theme
                or not goal_b.theme
            ):
                continue
            theme_sim = cosine_similarity(
                goal_a.theme_embedding, goal_b.theme_embedding
            )
            if theme_sim <= threshold_theme:
                continue

            # subject類似度
            if (
                goal_a.subject_embedding is None
                or goal_b.subject_embedding is None
                or not goal_a.subject
                or not goal_b.subject
            ):
                continue
            subject_sim = cosine_similarity(
                goal_a.subject_embedding, goal_b.subject_embedding
            )
            if subject_sim <= threshold_subject:
                continue

            # リレーション追加
            score = (theme_sim + subject_sim) / 2
            reason = f"theme_sim={theme_sim:.2f}, subject_sim={subject_sim:.2f}, level_diff={level_diff}"
            relations.append(
                RelationCandidate(
                    source_node_id=goal_a.node_id,
                    target_node_id=goal_b.node_id,
                    relation_type="hierarchy",
                    score=score,
                    reason=reason,
                )
            )

    return relations


def extract_means_end_relations(
    goals: List[GoalNode], threshold: float = THRESHOLD_MEANS_END
) -> List[RelationCandidate]:
    """
    手段-目的関係（Means-End）を抽出

    条件:
    - 前提条件を満たす
    - action/target による推定
    - ノードAの action または target が、ノードBの theme または subject と高類似（> threshold）

    方向: A（手段） → B（目的）
    """
    relations = []

    for goal_a in goals:
        for goal_b in goals:
            if goal_a.node_id == goal_b.node_id:
                continue

            # 前提条件チェック
            if not check_relation_precondition(goal_a, goal_b):
                continue

            # actionとtheme/subjectの類似度
            if (
                goal_a.action_embedding is None
                or goal_b.theme_embedding is None
                or not goal_a.action
            ):
                continue

            action_theme_sim = cosine_similarity(
                goal_a.action_embedding, goal_b.theme_embedding
            )
            action_subject_sim = 0.0
            if goal_b.subject_embedding is not None and goal_b.subject:
                action_subject_sim = cosine_similarity(
                    goal_a.action_embedding, goal_b.subject_embedding
                )

            # targetとtheme/subjectの類似度
            target_theme_sim = 0.0
            target_subject_sim = 0.0
            if (
                goal_a.target_embedding is not None
                and goal_b.theme_embedding is not None
            ):
                target_theme_sim = cosine_similarity(
                    goal_a.target_embedding, goal_b.theme_embedding
                )
            if (
                goal_a.target_embedding is not None
                and goal_b.subject_embedding is not None
            ):
                target_subject_sim = cosine_similarity(
                    goal_a.target_embedding, goal_b.subject_embedding
                )

            max_sim = max(
                action_theme_sim, action_subject_sim, target_theme_sim, target_subject_sim
            )

            if max_sim > threshold:
                reason = f"action_theme={action_theme_sim:.2f}, action_subject={action_subject_sim:.2f}, target_theme={target_theme_sim:.2f}, target_subject={target_subject_sim:.2f}"
                relations.append(
                    RelationCandidate(
                        source_node_id=goal_a.node_id,
                        target_node_id=goal_b.node_id,
                        relation_type="means_end",
                        score=max_sim,
                        reason=reason,
                    )
                )

    return relations


def extract_dependency_relations(
    goals: List[GoalNode], threshold: float = THRESHOLD_DEPENDENCY
) -> List[RelationCandidate]:
    """
    依存関係（Dependency / Prerequisite）を抽出

    条件:
    - 前提条件を満たす
    - ノードBの issue に、ノードAの theme や action と類似する内容が含まれる（> threshold）
    - または、ノードAの target がノードBの conditions と一致

    方向: A（前提条件） → B（依存先）
    """
    relations = []

    for goal_a in goals:
        for goal_b in goals:
            if goal_a.node_id == goal_b.node_id:
                continue

            # 前提条件チェック
            if not check_relation_precondition(goal_a, goal_b):
                continue

            # Bにissueがない場合はスキップ
            if not goal_b.issue or goal_b.issue_embedding is None:
                continue

            # Aのtheme/actionとBのissueの類似度
            theme_issue_sim = 0.0
            action_issue_sim = 0.0

            if goal_a.theme_embedding is not None and goal_a.theme:
                theme_issue_sim = cosine_similarity(
                    goal_a.theme_embedding, goal_b.issue_embedding
                )

            if goal_a.action_embedding is not None and goal_a.action:
                action_issue_sim = cosine_similarity(
                    goal_a.action_embedding, goal_b.issue_embedding
                )

            # targetとconditionsの類似度
            target_conditions_sim = 0.0
            if (
                goal_a.target_embedding is not None
                and goal_b.conditions_embedding is not None
                and goal_b.conditions
            ):
                target_conditions_sim = cosine_similarity(
                    goal_a.target_embedding, goal_b.conditions_embedding
                )

            max_sim = max(theme_issue_sim, action_issue_sim, target_conditions_sim)

            if max_sim > threshold:
                reason = f"theme_issue={theme_issue_sim:.2f}, action_issue={action_issue_sim:.2f}, target_conditions={target_conditions_sim:.2f}"
                relations.append(
                    RelationCandidate(
                        source_node_id=goal_a.node_id,
                        target_node_id=goal_b.node_id,
                        relation_type="dependency",
                        score=max_sim,
                        reason=reason,
                    )
                )

    return relations


def extract_causal_relations(
    goals: List[GoalNode], threshold: float = THRESHOLD_CAUSAL
) -> List[RelationCandidate]:
    """
    因果関係（Causal）を抽出

    条件:
    - 前提条件を満たす
    - ノードAの action とノードBの conditions が類似（> threshold）
    - または、Aの target とBの theme が因果的に関連

    方向: A（原因） → B（結果）
    """
    relations = []

    for goal_a in goals:
        for goal_b in goals:
            if goal_a.node_id == goal_b.node_id:
                continue

            # 前提条件チェック
            if not check_relation_precondition(goal_a, goal_b):
                continue

            # actionとconditionsの類似度
            action_conditions_sim = 0.0
            if (
                goal_a.action_embedding is not None
                and goal_b.conditions_embedding is not None
                and goal_a.action
                and goal_b.conditions
            ):
                action_conditions_sim = cosine_similarity(
                    goal_a.action_embedding, goal_b.conditions_embedding
                )

            # targetとthemeの類似度
            target_theme_sim = 0.0
            if (
                goal_a.target_embedding is not None
                and goal_b.theme_embedding is not None
                and goal_b.theme
            ):
                target_theme_sim = cosine_similarity(
                    goal_a.target_embedding, goal_b.theme_embedding
                )

            max_sim = max(action_conditions_sim, target_theme_sim)

            if max_sim > threshold:
                reason = f"action_conditions={action_conditions_sim:.2f}, target_theme={target_theme_sim:.2f}"
                relations.append(
                    RelationCandidate(
                        source_node_id=goal_a.node_id,
                        target_node_id=goal_b.node_id,
                        relation_type="causal",
                        score=max_sim,
                        reason=reason,
                    )
                )

    return relations


def calculate_possible_relation_pairs(goals: List[GoalNode]) -> Dict[str, int]:
    """
    各リレーションタイプで論理的に可能なペア数を計算

    前提条件:
    (a.abstraction_level <= b.abstraction_level) AND
    [(a.domain と b.domain に共通要素) OR (full_path が一致)]

    Returns:
        リレーションタイプごとの可能なペア数
    """
    n = len(goals)
    total_pairs = n * (n - 1)  # 自己除外

    # hierarchy: 前提条件 + レベル差が1-2段階以内のペア
    hierarchy_pairs = 0
    for goal_a in goals:
        for goal_b in goals:
            if goal_a.node_id == goal_b.node_id:
                continue
            if not check_relation_precondition(goal_a, goal_b):
                continue
            level_diff = goal_b.abstraction_level_num - goal_a.abstraction_level_num
            if 1 <= level_diff <= 2:
                hierarchy_pairs += 1

    # means_end: 前提条件を満たすペア
    means_end_pairs = 0
    for goal_a in goals:
        for goal_b in goals:
            if goal_a.node_id == goal_b.node_id:
                continue
            if check_relation_precondition(goal_a, goal_b):
                means_end_pairs += 1

    # dependency: 前提条件 + Bにissueがあるペア
    dependency_pairs = 0
    for goal_a in goals:
        for goal_b in goals:
            if goal_a.node_id == goal_b.node_id:
                continue
            if not check_relation_precondition(goal_a, goal_b):
                continue
            if goal_b.issue:  # Bにissueが存在する
                dependency_pairs += 1

    # causal: 前提条件を満たすペア
    causal_pairs = 0
    for goal_a in goals:
        for goal_b in goals:
            if goal_a.node_id == goal_b.node_id:
                continue
            if check_relation_precondition(goal_a, goal_b):
                causal_pairs += 1

    return {
        "hierarchy": hierarchy_pairs,
        "means_end": means_end_pairs,
        "dependency": dependency_pairs,
        "causal": causal_pairs,
        "total_pairs": total_pairs,
    }


def analyze_isolated_nodes(
    goals: List[GoalNode], relations: List[RelationCandidate]
) -> Dict[str, Any]:
    """
    孤立ノードを分析

    Returns:
        分析結果の辞書
    """
    # リレーションに含まれるノードIDを収集
    connected_nodes = set()
    for rel in relations:
        connected_nodes.add(rel.source_node_id)
        connected_nodes.add(rel.target_node_id)

    # 孤立ノードを特定
    all_node_ids = {goal.node_id for goal in goals}
    isolated_nodes = all_node_ids - connected_nodes

    # クラスタごとの統計
    cluster_stats = {}
    for goal in goals:
        cluster_id = goal.cluster_id
        if cluster_id not in cluster_stats:
            cluster_stats[cluster_id] = {
                "total": 0,
                "connected": 0,
                "isolated": 0,
            }
        cluster_stats[cluster_id]["total"] += 1
        if goal.node_id in connected_nodes:
            cluster_stats[cluster_id]["connected"] += 1
        else:
            cluster_stats[cluster_id]["isolated"] += 1

    # 論理的に可能なペア数を計算
    possible_pairs = calculate_possible_relation_pairs(goals)

    # リレーションタイプごとの統計
    relation_stats_by_type = {}
    for rel in relations:
        rel_type = rel.relation_type
        if rel_type not in relation_stats_by_type:
            relation_stats_by_type[rel_type] = 0
        relation_stats_by_type[rel_type] += 1

    # 抽出率を計算
    extraction_rates = {}
    for rel_type, count in relation_stats_by_type.items():
        possible = possible_pairs.get(rel_type, 1)
        extraction_rates[rel_type] = {
            "extracted": count,
            "possible": possible,
            "rate": count / possible if possible > 0 else 0,
        }

    return {
        "total_nodes": len(goals),
        "connected_nodes": len(connected_nodes),
        "isolated_nodes": len(isolated_nodes),
        "connection_rate": len(connected_nodes) / len(goals) if goals else 0,
        "isolated_node_ids": sorted(list(isolated_nodes)),
        "cluster_stats": cluster_stats,
        "possible_pairs": possible_pairs,
        "extraction_rates": extraction_rates,
    }


def save_relations_to_csv(relations: List[RelationCandidate], output_path: Path) -> None:
    """リレーション候補をCSVに保存"""
    df = pd.DataFrame(
        [
            {
                "source_node_id": rel.source_node_id,
                "target_node_id": rel.target_node_id,
                "relation_type": rel.relation_type,
                "score": rel.score,
                "reason": rel.reason,
            }
            for rel in relations
        ]
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(output_path, index=False, encoding="utf-8")
    print(f"✓ リレーションをCSVに保存: {output_path}")


def save_analysis_to_json(analysis: Dict[str, Any], output_path: Path) -> None:
    """孤立ノード分析結果をJSONに保存"""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(analysis, f, ensure_ascii=False, indent=2)
    print(f"✓ 分析結果をJSONに保存: {output_path}")


def compute_similarity_distributions(
    goals: List[GoalNode],
) -> Dict[str, Dict[str, List[float]]]:
    """
    各リレーションタイプで使用する類似度の分布を計算

    Returns:
        リレーションタイプごとの類似度リスト
    """
    distributions = {
        "hierarchy_theme": [],
        "hierarchy_subject": [],
        "means_end_action_theme": [],
        "means_end_action_subject": [],
        "means_end_target_theme": [],
        "means_end_target_subject": [],
        "dependency_theme_issue": [],
        "dependency_action_issue": [],
        "dependency_target_conditions": [],
        "causal_action_conditions": [],
        "causal_target_theme": [],
    }

    print("  類似度分布を計算中...")

    # サンプリング: 全ペアは多すぎるので、最大10000ペアをランダムサンプリング
    max_samples = 10000
    n = len(goals)
    total_pairs = n * (n - 1)

    if total_pairs > max_samples:
        # ランダムサンプリング
        sample_indices = np.random.choice(total_pairs, max_samples, replace=False)
    else:
        sample_indices = range(total_pairs)

    pair_idx = 0
    for i, goal_a in enumerate(goals):
        for j, goal_b in enumerate(goals):
            if i == j:
                continue

            if total_pairs > max_samples and pair_idx not in sample_indices:
                pair_idx += 1
                continue

            pair_idx += 1

            # hierarchy用の類似度
            if (
                goal_a.theme_embedding is not None
                and goal_b.theme_embedding is not None
                and goal_a.theme
                and goal_b.theme
            ):
                theme_sim = cosine_similarity(
                    goal_a.theme_embedding, goal_b.theme_embedding
                )
                distributions["hierarchy_theme"].append(theme_sim)

            if (
                goal_a.subject_embedding is not None
                and goal_b.subject_embedding is not None
                and goal_a.subject
                and goal_b.subject
            ):
                subject_sim = cosine_similarity(
                    goal_a.subject_embedding, goal_b.subject_embedding
                )
                distributions["hierarchy_subject"].append(subject_sim)

            # means_end用の類似度
            if (
                goal_a.action_embedding is not None
                and goal_b.theme_embedding is not None
                and goal_a.action
            ):
                action_theme_sim = cosine_similarity(
                    goal_a.action_embedding, goal_b.theme_embedding
                )
                distributions["means_end_action_theme"].append(action_theme_sim)

            if (
                goal_a.action_embedding is not None
                and goal_b.subject_embedding is not None
                and goal_a.action
                and goal_b.subject
            ):
                action_subject_sim = cosine_similarity(
                    goal_a.action_embedding, goal_b.subject_embedding
                )
                distributions["means_end_action_subject"].append(action_subject_sim)

            if (
                goal_a.target_embedding is not None
                and goal_b.theme_embedding is not None
            ):
                target_theme_sim = cosine_similarity(
                    goal_a.target_embedding, goal_b.theme_embedding
                )
                distributions["means_end_target_theme"].append(target_theme_sim)

            if (
                goal_a.target_embedding is not None
                and goal_b.subject_embedding is not None
                and goal_b.subject
            ):
                target_subject_sim = cosine_similarity(
                    goal_a.target_embedding, goal_b.subject_embedding
                )
                distributions["means_end_target_subject"].append(target_subject_sim)

            # dependency用の類似度
            if (
                goal_a.theme_embedding is not None
                and goal_b.issue_embedding is not None
                and goal_a.theme
                and goal_b.issue
            ):
                theme_issue_sim = cosine_similarity(
                    goal_a.theme_embedding, goal_b.issue_embedding
                )
                distributions["dependency_theme_issue"].append(theme_issue_sim)

            if (
                goal_a.action_embedding is not None
                and goal_b.issue_embedding is not None
                and goal_a.action
                and goal_b.issue
            ):
                action_issue_sim = cosine_similarity(
                    goal_a.action_embedding, goal_b.issue_embedding
                )
                distributions["dependency_action_issue"].append(action_issue_sim)

            if (
                goal_a.target_embedding is not None
                and goal_b.conditions_embedding is not None
                and goal_b.conditions
            ):
                target_conditions_sim = cosine_similarity(
                    goal_a.target_embedding, goal_b.conditions_embedding
                )
                distributions["dependency_target_conditions"].append(target_conditions_sim)

            # causal用の類似度
            if (
                goal_a.action_embedding is not None
                and goal_b.conditions_embedding is not None
                and goal_a.action
                and goal_b.conditions
            ):
                action_conditions_sim = cosine_similarity(
                    goal_a.action_embedding, goal_b.conditions_embedding
                )
                distributions["causal_action_conditions"].append(action_conditions_sim)

            if (
                goal_a.target_embedding is not None
                and goal_b.theme_embedding is not None
                and goal_b.theme
            ):
                target_theme_sim = cosine_similarity(
                    goal_a.target_embedding, goal_b.theme_embedding
                )
                distributions["causal_target_theme"].append(target_theme_sim)

    print(f"  ✓ 類似度分布計算完了（{len(sample_indices)}ペアをサンプリング）")
    return distributions


def generate_similarity_histograms(
    distributions: Dict[str, List[float]],
    output_dir: Path,
) -> None:
    """
    類似度分布のヒストグラムを生成してPNGとして保存

    Args:
        distributions: 類似度分布データ
        output_dir: 出力ディレクトリ
    """
    output_dir.mkdir(parents=True, exist_ok=True)

    # 各リレーションタイプごとにヒストグラムを生成
    relation_configs = {
        "hierarchy": {
            "distributions": ["hierarchy_theme", "hierarchy_subject"],
            "thresholds": [THRESHOLD_HIERARCHY_THEME, THRESHOLD_HIERARCHY_SUBJECT],
            "labels": ["theme similarity", "subject similarity"],
            "colors": ["#2196F3", "#03A9F4"],
        },
        "means_end": {
            "distributions": [
                "means_end_action_theme",
                "means_end_action_subject",
                "means_end_target_theme",
                "means_end_target_subject",
            ],
            "thresholds": [THRESHOLD_MEANS_END] * 4,
            "labels": [
                "action-theme",
                "action-subject",
                "target-theme",
                "target-subject",
            ],
            "colors": ["#4CAF50", "#66BB6A", "#81C784", "#A5D6A7"],
        },
        "dependency": {
            "distributions": [
                "dependency_theme_issue",
                "dependency_action_issue",
                "dependency_target_conditions",
            ],
            "thresholds": [THRESHOLD_DEPENDENCY] * 3,
            "labels": ["theme-issue", "action-issue", "target-conditions"],
            "colors": ["#FF9800", "#FFB74D", "#FFCC80"],
        },
        "causal": {
            "distributions": [
                "causal_action_conditions",
                "causal_target_theme",
            ],
            "thresholds": [THRESHOLD_CAUSAL] * 2,
            "labels": ["action-conditions", "target-theme"],
            "colors": ["#9C27B0", "#BA68C8"],
        },
    }

    for rel_type, config in relation_configs.items():
        fig, axes = plt.subplots(
            len(config["distributions"]), 1, figsize=(10, 4 * len(config["distributions"]))
        )

        if len(config["distributions"]) == 1:
            axes = [axes]

        for i, (dist_key, threshold, label, color) in enumerate(
            zip(
                config["distributions"],
                config["thresholds"],
                config["labels"],
                config["colors"],
            )
        ):
            data = distributions.get(dist_key, [])
            if not data:
                continue

            ax = axes[i]
            ax.hist(data, bins=50, alpha=0.7, color=color, edgecolor="black")
            ax.axvline(
                threshold, color="red", linestyle="--", linewidth=2, label=f"Threshold: {threshold}"
            )
            ax.set_xlabel("Similarity Score")
            ax.set_ylabel("Frequency")
            ax.set_title(f"{rel_type.capitalize()} - {label}")
            ax.legend()
            ax.grid(True, alpha=0.3)

        plt.tight_layout()
        output_file = output_dir / f"{rel_type}_similarity_distribution.png"
        plt.savefig(output_file, dpi=150, bbox_inches="tight")
        plt.close()
        print(f"  ✓ ヒストグラム生成: {output_file}")

    print(f"✓ 全ヒストグラム生成完了")


def generate_markdown_report(
    goals: List[GoalNode],
    relations: List[RelationCandidate],
    analysis: Dict[str, Any],
    output_path: Path,
) -> None:
    """Markdownレポートを生成"""
    # ノードIDからGoalNodeへのマッピング
    node_map = {goal.node_id: goal for goal in goals}

    # リレーションタイプごとの集計
    relation_type_counts = {}
    for rel in relations:
        relation_type_counts[rel.relation_type] = (
            relation_type_counts.get(rel.relation_type, 0) + 1
        )

    # 全ペア数
    total_pairs = analysis.get("possible_pairs", {}).get("total_pairs", 0)

    # Markdown テンプレート
    md_content = f"""# Goal Relation Extraction Report

## Summary Statistics

| Metric | Value |
|--------|-------|
| Total Nodes | {analysis['total_nodes']} |
| Connected Nodes | {analysis['connected_nodes']} |
| Isolated Nodes | {analysis['isolated_nodes']} |
| Connection Rate | {analysis['connection_rate']:.1%} |

## Relation Type Distribution

| Relation Type | Count |
|---------------|-------|
"""

    for rel_type, count in sorted(
        relation_type_counts.items(), key=lambda x: x[1], reverse=True
    ):
        md_content += f"| {rel_type} | {count:,} |\n"

    md_content += "\n## Filtering Pipeline\n\n"
    md_content += "段階的なフィルタリング過程\n\n"
    md_content += "| Relation Type | 全ペア候補 | 前提条件通過 | 類似度閾値通過 | 最終通過率 |\n"
    md_content += "|---------------|------------|--------------|----------------|------------|\n"

    extraction_rates = analysis.get("extraction_rates", {})
    possible_pairs = analysis.get("possible_pairs", {})

    for rel_type in ["hierarchy", "means_end", "dependency", "causal"]:
        if rel_type in extraction_rates:
            stats = extraction_rates[rel_type]
            possible = possible_pairs.get(rel_type, 0)
            extracted = stats['extracted']
            precondition_rate = (possible / total_pairs * 100) if total_pairs > 0 else 0
            similarity_rate = (extracted / possible * 100) if possible > 0 else 0
            final_rate = (extracted / total_pairs * 100) if total_pairs > 0 else 0

            md_content += f"| {rel_type} | {total_pairs:,} | {possible:,} ({precondition_rate:.1f}%) | {extracted:,} ({similarity_rate:.1f}%) | {final_rate:.2f}% |\n"

    md_content += "\n### フィルタリング条件\n\n"
    md_content += "1. **前提条件**: `(a.abstraction_level <= b.abstraction_level) AND [(a.domain共通) OR (full_path一致)]`\n"
    md_content += f"2. **類似度閾値**:\n"
    md_content += f"   - hierarchy: {THRESHOLD_HIERARCHY_THEME} (theme AND subject両方)\n"
    md_content += f"   - means_end: {THRESHOLD_MEANS_END} (4つの選択肢のいずれか)\n"
    md_content += f"   - dependency: {THRESHOLD_DEPENDENCY} (3つの選択肢のいずれか)\n"
    md_content += f"   - causal: {THRESHOLD_CAUSAL} (2つの選択肢のいずれか)\n\n"

    md_content += "## Extraction Rate Statistics\n\n"
    md_content += "前提条件を通過したペアのうち、類似度閾値で抽出された割合\n\n"
    md_content += "| Relation Type | Extracted | Possible Pairs | Extraction Rate |\n"
    md_content += "|---------------|-----------|----------------|-----------------|\n"

    for rel_type in ["hierarchy", "means_end", "dependency", "causal"]:
        if rel_type in extraction_rates:
            stats = extraction_rates[rel_type]
            md_content += f"| {rel_type} | {stats['extracted']:,} | {stats['possible']:,} | {stats['rate']:.2%} |\n"

    md_content += "\n## Similarity Distribution Histograms\n\n"

    # ヒストグラム画像へのリンク
    for rel_type in ["hierarchy", "means_end", "dependency", "causal"]:
        image_path = f"{rel_type}_similarity_distribution.png"
        md_content += f"### {rel_type.capitalize()} Relation\n\n"
        md_content += f"![{rel_type} similarity distribution]({image_path})\n\n"

    md_content += "\n## Cluster Statistics\n\n"
    md_content += "| Cluster ID | Total Nodes | Connected | Isolated | Connection Rate |\n"
    md_content += "|------------|-------------|-----------|----------|----------------|\n"

    for cluster_id, stats in sorted(analysis["cluster_stats"].items()):
        connection_rate = (
            stats["connected"] / stats["total"] if stats["total"] > 0 else 0
        )
        md_content += f"| Cluster {cluster_id:02d} | {stats['total']} | {stats['connected']} | {stats['isolated']} | {connection_rate:.1%} |\n"

    md_content += "\n## Sample Relations by Type\n\n"
    md_content += "各リレーションタイプごとにスコアが高い上位3件の詳細\n\n"
    md_content += "**注**: 各リレーションは、複数の類似度のうち**いずれか1つ以上が各タイプの閾値を超えた**ものです。\n"
    md_content += "Scoreは使用した類似度の最大値（hierarchy）または最大値そのもの（means_end, dependency, causal）です。\n\n"

    # relation_typeごとにグループ化
    relations_by_type: Dict[str, List[RelationCandidate]] = {}
    for rel in relations:
        if rel.relation_type not in relations_by_type:
            relations_by_type[rel.relation_type] = []
        relations_by_type[rel.relation_type].append(rel)

    # 各タイプごとにスコアでソートして上位3件を表示
    sample_count_per_type = 3
    for rel_type in ["hierarchy", "means_end", "dependency", "causal"]:
        if rel_type not in relations_by_type:
            continue

        type_relations = sorted(relations_by_type[rel_type], key=lambda x: x.score, reverse=True)[:sample_count_per_type]

        md_content += f"### {rel_type.upper()} Relations (Top {len(type_relations)})\n\n"

        for i, rel in enumerate(type_relations, 1):
            source_node = node_map.get(rel.source_node_id)
            target_node = node_map.get(rel.target_node_id)

            md_content += f"#### {rel_type.upper()} #{i} (Score: {rel.score:.3f})\n\n"
            md_content += f"**Direction**: `{rel.source_node_id}` → `{rel.target_node_id}`\n\n"
            md_content += f"**Reason**: {rel.reason}\n\n"

            if source_node:
                md_content += "**Source Node**:\n\n"
                md_content += "```json\n"
                md_content += json.dumps(source_node.raw_data, ensure_ascii=False, indent=2)
                md_content += "\n```\n\n"

            if target_node:
                md_content += "**Target Node**:\n\n"
                md_content += "```json\n"
                md_content += json.dumps(target_node.raw_data, ensure_ascii=False, indent=2)
                md_content += "\n```\n\n"

            md_content += "---\n\n"

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(md_content)
    print(f"✓ Markdownレポートを生成: {output_path}")


def run_goal_relation_extraction_pipeline() -> None:
    """Goal間のリレーション抽出パイプラインを実行"""
    print("\n" + "=" * 60)
    print("Goal Relation Extraction Pipeline")
    print("=" * 60)

    # 1. Goalデータを読み込み
    print("\n[1/6] Goalデータを読み込み中...")
    goals = load_all_goals()

    # 2. 埋め込みベクトルを計算
    print("\n[2/6] 埋め込みベクトルを計算中...")
    compute_goal_embeddings(goals)

    # 3. リレーション抽出
    print("\n[3/6] リレーションを抽出中...")
    print("  - 階層関係を抽出中...")
    hierarchy_relations = extract_hierarchy_relations(goals)
    print(f"    ✓ {len(hierarchy_relations)}件の階層関係を抽出")

    print("  - 手段-目的関係を抽出中...")
    means_end_relations = extract_means_end_relations(goals)
    print(f"    ✓ {len(means_end_relations)}件の手段-目的関係を抽出")

    print("  - 依存関係を抽出中...")
    dependency_relations = extract_dependency_relations(goals)
    print(f"    ✓ {len(dependency_relations)}件の依存関係を抽出")

    print("  - 因果関係を抽出中...")
    causal_relations = extract_causal_relations(goals)
    print(f"    ✓ {len(causal_relations)}件の因果関係を抽出")

    # 全リレーションを結合
    all_relations = (
        hierarchy_relations
        + means_end_relations
        + dependency_relations
        + causal_relations
    )
    print(f"\n  ✓ 合計 {len(all_relations)}件のリレーション候補を抽出")

    # 4. 孤立ノード分析
    print("\n[4/8] 孤立ノードを分析中...")
    analysis = analyze_isolated_nodes(goals, all_relations)
    print(f"  ✓ 接続ノード数: {analysis['connected_nodes']}/{analysis['total_nodes']}")
    print(f"  ✓ 孤立ノード数: {analysis['isolated_nodes']}")
    print(f"  ✓ 接続率: {analysis['connection_rate']:.1%}")

    # 5. 類似度分布を計算
    print("\n[5/8] 類似度分布を計算中...")
    distributions = compute_similarity_distributions(goals)

    # 6. ヒストグラム生成
    print("\n[6/8] ヒストグラムを生成中...")
    generate_similarity_histograms(distributions, OUTPUT_DIR)

    # 7. 結果を保存
    print("\n[7/8] 結果を保存中...")
    save_relations_to_csv(all_relations, OUTPUT_DIR / "goal_relations.csv")
    save_analysis_to_json(analysis, OUTPUT_DIR / "isolated_nodes_analysis.json")

    # 8. レポート生成
    print("\n[8/8] レポートを生成中...")
    generate_markdown_report(goals, all_relations, analysis, OUTPUT_DIR / "report.md")

    print("\n" + "=" * 60)
    print("Goal Relation Extraction Pipeline Complete!")
    print(f"出力ディレクトリ: {OUTPUT_DIR}")
    print("=" * 60)

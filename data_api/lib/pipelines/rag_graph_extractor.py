"""
RAG部分グラフ抽出モジュール

検索結果のintentから関連するゴールネットワークの部分グラフを抽出する。
Balanced Strategy: Parent（全て）、Self、Siblings（全て）、Children（直接のみ）
"""

import json
from typing import Any

from lib.rag_models import GoalEdge, GoalNetwork, GoalNode, UnifiedIntent

# 定数: プロンプトに埋め込む兄弟/子ノードの最大件数
MAX_SIBLING_NODES_IN_PROMPT = 10
MAX_CHILD_NODES_IN_PROMPT = 10

# 定数: ゴールネットワークのラベル（means-end network / goal hierarchy の文脈）
# 目的-手段階層（Means-Ends Hierarchy）では：
# - 親 = より抽象的・上位の目的（goal/end）
# - 子 = より具体的・下位の手段（means）
# - 兄弟 = 同じ親目的を達成するための代替手段
LABEL_SEARCH_HIT = "検索ヒット本体"
LABEL_PARENT_NODES = "親ノード（より抽象的な上位目的）: ルートから近い順"
LABEL_SIBLING_NODES = "兄弟ノード（同じ上位目的を達成する代替手段）"
LABEL_CHILD_NODES = "子ノード（より具体的な下位手段）: 直接の子のみ"


def load_goal_network(network_path: str) -> dict[str, Any]:
    """ゴールネットワークJSONを読み込む"""
    with open(network_path, encoding="utf-8") as f:
        return json.load(f)


def build_graph_structure(
    network_data: dict[str, Any],
) -> tuple[dict[str, GoalNode], dict[str, list[str]], dict[str, list[str]]]:
    """
    ゴールネットワークからグラフ構造を構築

    Args:
        network_data: goal_network.jsonの内容

    Returns:
        (all_nodes, parent_map, children_map)
        - all_nodes: {node_id: GoalNode}
        - parent_map: {child_id: [parent_id1, parent_id2, ...]}
        - children_map: {parent_id: [child_id1, child_id2, ...]}
    """
    all_nodes: dict[str, GoalNode] = {}
    parent_map: dict[str, list[str]] = {}
    children_map: dict[str, list[str]] = {}

    # nodes（dict形式）からノード情報を収集
    nodes_dict = network_data.get("nodes", {})
    for node_id, node_data in nodes_dict.items():
        all_nodes[node_id] = GoalNode(
            id=node_id,
            intent=node_data["intent"],
            status=node_data["status"],
            node_type=node_data.get("type", "individual"),
        )

    # generated_nodes（list形式）からもノード情報を収集
    generated_nodes = network_data.get("generated_nodes", [])
    for node_data in generated_nodes:
        node_id = node_data["intent_id"]
        if node_id not in all_nodes:
            all_nodes[node_id] = GoalNode(
                id=node_id,
                intent=node_data["intent"],
                status=node_data["status"],
                node_type="generated",
            )

    # relationsからエッジ情報を構築
    relations = network_data.get("relations", [])
    for relation in relations:
        parent_id = relation["to"]  # goal-meansの場合、toが目的（親）
        child_id = relation["from"]  # fromが手段（子）

        # parent_map構築
        if child_id not in parent_map:
            parent_map[child_id] = []
        parent_map[child_id].append(parent_id)

        # children_map構築
        if parent_id not in children_map:
            children_map[parent_id] = []
        children_map[parent_id].append(child_id)

    return all_nodes, parent_map, children_map


def get_ancestors(
    node_id: str, parent_map: dict[str, list[str]], visited: set[str] | None = None
) -> set[str]:
    """
    指定ノードの全ての祖先ノードを取得（ルートまで）

    Args:
        node_id: 起点ノードID
        parent_map: {child_id: [parent_id1, ...]}
        visited: 訪問済みノードセット（循環参照対策）

    Returns:
        祖先ノードIDのセット
    """
    if visited is None:
        visited = set()

    ancestors = set()
    if node_id in visited:
        return ancestors

    visited.add(node_id)

    parents = parent_map.get(node_id, [])
    for parent_id in parents:
        ancestors.add(parent_id)
        # 再帰的に祖先を取得
        ancestors.update(get_ancestors(parent_id, parent_map, visited))

    return ancestors


def get_ancestors_ordered(node_id: str, parent_map: dict[str, list[str]]) -> list[str]:
    """
    指定ノードの全ての祖先ノードをルートから近い順に取得

    ルート（最も遠い祖先）から直接の親まで、階層順に並べます。

    Args:
        node_id: 起点ノードID
        parent_map: {child_id: [parent_id1, ...]}

    Returns:
        祖先ノードIDのリスト（ルートから近い順）
    """
    # 全ての祖先を取得
    ancestors = get_ancestors(node_id, parent_map)

    if not ancestors:
        return []

    # 各祖先ノードのルートからの深さを計算
    def get_depth_from_root(node: str, visited: set[str] | None = None) -> int:
        """ルートからの深さを計算（親がないノードが深さ0）"""
        if visited is None:
            visited = set()

        if node in visited:
            return 0  # 循環参照対策

        visited.add(node)

        parents = parent_map.get(node, [])
        if not parents:
            return 0  # ルートノード

        # 親の中で最も深いものを選択
        max_depth = 0
        for parent in parents:
            depth = get_depth_from_root(parent, visited)
            max_depth = max(max_depth, depth)

        return max_depth + 1

    # 深さでソート（浅い順 = ルートから近い順）
    ancestors_with_depth = [
        (ancestor, get_depth_from_root(ancestor)) for ancestor in ancestors
    ]
    ancestors_with_depth.sort(key=lambda x: (x[1], x[0]))  # 深さ優先、同じ深さならID順

    return [ancestor for ancestor, _ in ancestors_with_depth]


def get_siblings(
    node_id: str, parent_map: dict[str, list[str]], children_map: dict[str, list[str]]
) -> set[str]:
    """
    指定ノードの兄弟ノード（全ての親を共有するノード）を取得

    真の兄弟は「全ての親を共有する」子ノードのみです。
    共通の親を一部持つだけのノードは「いとこ」レベルであり、兄弟ではありません。

    Args:
        node_id: 起点ノードID
        parent_map: {child_id: [parent_id1, ...]}
        children_map: {parent_id: [child_id1, ...]}

    Returns:
        兄弟ノードIDのセット（自分自身は含まない）
    """
    # 起点ノードの親を取得
    node_parents = set(parent_map.get(node_id, []))

    if not node_parents:
        return set()  # 親がない場合は兄弟もいない

    siblings = set()

    # 最初の親の子ノードを候補として取得
    first_parent = next(iter(node_parents))
    candidate_siblings = children_map.get(first_parent, [])

    # 各候補について、全ての親を共有しているかチェック
    for candidate_id in candidate_siblings:
        if candidate_id == node_id:
            continue

        candidate_parents = set(parent_map.get(candidate_id, []))

        # 全ての親が一致する場合のみ兄弟とする
        if candidate_parents == node_parents:
            siblings.add(candidate_id)

    return siblings


def get_root_node(node_id: str, parent_map: dict[str, list[str]]) -> str:
    """
    指定ノードのルートノード（最上位ノード）を取得

    Args:
        node_id: 起点ノードID
        parent_map: {child_id: [parent_id1, ...]}

    Returns:
        ルートノードID
    """
    visited = set()
    current = node_id

    while True:
        if current in visited:
            # 循環参照対策
            return current

        visited.add(current)
        parents = parent_map.get(current, [])

        if not parents:
            # 親がない = ルートノード
            return current

        # 最初の親を辿る（複数親がある場合は最初のものを選択）
        current = parents[0]


def extract_subgraph(
    intents: list[UnifiedIntent],
    network_path: str = "output/goal_network/ultra_intent_goal_network.json",
    strategy: str = "balanced",
) -> GoalNetwork:
    """
    検索結果から部分グラフを抽出

    Balanced Strategy:
    - Parent: 全て（ルートまで）
    - Self: 検索ヒットノード
    - Siblings: 全て
    - Children: 直接の子のみ

    Args:
        intents: 検索結果の意図リスト
        network_path: ゴールネットワークJSONのパス
        strategy: グラフ抽出戦略（現在は"balanced"のみ対応）

    Returns:
        GoalNetwork: 抽出された部分グラフ
    """
    if strategy != "balanced":
        raise ValueError(
            f"Unsupported strategy: {strategy}. Only 'balanced' is supported."
        )

    # ゴールネットワーク読み込み
    network_data = load_goal_network(network_path)
    all_nodes, parent_map, children_map = build_graph_structure(network_data)

    # 検索結果のノードID
    hit_node_ids = {intent.id for intent in intents}

    # 部分グラフに含めるノードID
    subgraph_node_ids: set[str] = set()

    for node_id in hit_node_ids:
        # ノードがグラフに存在しない場合はスキップ
        if node_id not in all_nodes:
            continue

        # Self
        subgraph_node_ids.add(node_id)

        # Parents（ルートまで全て）
        ancestors = get_ancestors(node_id, parent_map)
        subgraph_node_ids.update(ancestors)

        # Siblings（同じ親を持つ全てのノード）
        siblings = get_siblings(node_id, parent_map, children_map)
        subgraph_node_ids.update(siblings)

        # Children（直接の子のみ）
        children = children_map.get(node_id, [])
        subgraph_node_ids.update(children)

    # 部分グラフのノードリスト作成
    subgraph_nodes = [
        all_nodes[node_id] for node_id in subgraph_node_ids if node_id in all_nodes
    ]

    # 部分グラフのエッジリスト作成
    subgraph_edges: list[GoalEdge] = []
    relations = network_data.get("relations", [])

    for relation in relations:
        parent_id = relation["to"]
        child_id = relation["from"]
        relation_type = relation.get("type", "means")

        # 両端のノードが部分グラフに含まれる場合のみエッジを追加
        if child_id in subgraph_node_ids and parent_id in subgraph_node_ids:
            subgraph_edges.append(
                GoalEdge(from_id=child_id, to_id=parent_id, relation=relation_type)
            )

    return GoalNetwork(nodes=subgraph_nodes, edges=subgraph_edges)


def _format_node_line(
    node_id: str,
    nodes_detail: dict[str, Any],
    intents_map: dict[str, Any] | None,
    node_map: dict[str, GoalNode],
    indent: int = 0,
) -> str:
    """
    1つのノードを1行でフォーマット

    Args:
        node_id: ノードID
        nodes_detail: ゴールネットワークJSONのnodes詳細情報
        intents_map: UnifiedIntentマッピング
        node_map: 部分グラフのノードマッピング
        indent: インデントレベル

    Returns:
        フォーマット済みの行
    """
    if node_id not in node_map:
        return f"{'  ' * indent}- (ノード情報なし: {node_id})"

    node = node_map[node_id]
    node_detail = nodes_detail.get(node_id, {})
    objective_facts = node_detail.get("objective_facts") or ""
    context = node_detail.get("context") or ""

    # timestampを取得
    timestamp = ""
    if intents_map and node_id in intents_map:
        intent = intents_map[node_id]
        timestamp = intent.timestamps[0].isoformat() if intent.timestamps else ""

    # プロパティ構築
    props = []
    if objective_facts:
        props.append(f'objective_facts="{objective_facts}"')
    if context:
        props.append(f'context="{context}"')
    if timestamp:
        props.append(f'timestamp="{timestamp}"')
    props.append(f"status={node.status.value}")

    props_str = " ".join(props)
    prefix = "  " * indent
    return f"{prefix}- {node.intent} {{{props_str}}}"


def format_subgraph_for_llm(
    subgraph: GoalNetwork,
    intents_map: dict[str, Any] | None = None,
    network_path: str = "output/goal_network/ultra_intent_goal_network.json",
    hit_intent_ids: list[str] | None = None,
) -> str:
    """
    部分グラフをLLMプロンプト用にフォーマット（構造化形式）

    全ての検索ヒットが同じ最上位ノードを持つ場合、インデント構造の単一ツリーで表示

    Args:
        subgraph: 部分グラフ
        intents_map: {intent_id: UnifiedIntent} のマッピング（timestamp情報用）
        network_path: ゴールネットワークJSONのパス（objective_facts, context取得用）
        hit_intent_ids: 検索でヒットしたintent IDのリスト（マーキング用）

    Returns:
        構造化されたMarkdown形式の文字列
    """
    if not subgraph.nodes:
        return "（グラフ情報なし）"

    # ゴールネットワークから詳細情報を読み込む
    network_data = load_goal_network(network_path)
    nodes_detail = network_data.get("nodes", {})

    # ノードIDから意図テキストへのマッピング
    node_map = {node.id: node for node in subgraph.nodes}

    # 親子マップを構築
    all_nodes_in_network, parent_map, children_map = build_graph_structure(network_data)

    lines = [
        "### ゴールネットワーク（検索ヒット中心）",
        "",
        "このネットワークは**目的-手段階層（Means-Ends Hierarchy / Goal Hierarchy）**を表現しています：",
        "- **親ノード**: より抽象的・上位の目的（goal/end）",
        "- **子ノード**: より具体的・下位の手段（means）",
        "- **兄弟ノード**: 同じ上位目的を達成するための代替手段",
        "",
    ]

    # 検索ヒットがある場合、ルートノードごとにツリーを構築
    if hit_intent_ids:
        from collections import defaultdict

        # 検索ヒットをルートノードでグループ化
        root_groups: dict[str, list[str]] = defaultdict(list)
        hit_ids_not_in_network = []

        for hit_id in hit_intent_ids:
            if hit_id not in node_map:
                hit_ids_not_in_network.append(hit_id)
                continue

            # このヒットのルートノードを取得
            root_id = get_root_node(hit_id, parent_map)
            root_groups[root_id].append(hit_id)

        # Goal Networkに存在しないヒットを先に表示
        for hit_id in hit_ids_not_in_network:
            hit_idx = hit_intent_ids.index(hit_id) + 1
            lines.append(f"\n#### 検索ヒット {hit_idx}: {hit_id} (Goal Networkに未登録)")
            if intents_map and hit_id in intents_map:
                intent = intents_map[hit_id]
                timestamp_str = (
                    intent.timestamps[0].isoformat() if intent.timestamps else ""
                )
                lines.append(
                    f'- **{intent.intent}** {{timestamp="{timestamp_str}" status={intent.status.value}}}'
                )

        # 検索ヒットIDのセット（マーキング用）
        hit_ids_set = set(hit_intent_ids)

        # ツリー構築の再帰関数
        def build_tree_recursive(
            node_id: str, indent: int, visited: set[str]
        ) -> list[str]:
            """
            ノードから再帰的にツリーを構築

            Args:
                node_id: 現在のノードID
                indent: インデントレベル
                visited: 訪問済みノードセット（循環参照対策）

            Returns:
                フォーマット済みの行リスト
            """
            if node_id in visited or node_id not in node_map:
                return []

            visited.add(node_id)

            # ノード情報をフォーマット
            node = node_map[node_id]
            node_detail = nodes_detail.get(node_id, {})
            objective_facts = node_detail.get("objective_facts") or ""
            context = node_detail.get("context") or ""

            # timestampを取得
            timestamp = ""
            if intents_map and node_id in intents_map:
                intent = intents_map[node_id]
                timestamp = intent.timestamps[0].isoformat() if intent.timestamps else ""

            # プロパティ構築
            props = []
            if objective_facts:
                props.append(f'objective_facts="{objective_facts}"')
            if context:
                props.append(f'context="{context}"')
            if timestamp:
                props.append(f'timestamp="{timestamp}"')
            props.append(f"status={node.status.value}")

            props_str = " ".join(props)
            prefix = "  " * indent

            # 検索ヒットの場合はマーカーを追加
            hit_marker = ""
            if node_id in hit_ids_set:
                hit_idx = hit_intent_ids.index(node_id) + 1
                hit_marker = f"**[HIT {hit_idx}]** "

            result = [f"{prefix}- {hit_marker}{node.intent} {{{props_str}}}"]

            # 子ノードを取得（部分グラフに含まれるもののみ）
            all_children = [
                child_id
                for child_id in children_map.get(node_id, [])
                if child_id in node_map
            ]

            # 子ノードが11件以上の場合、検索ヒット以外を省略
            if len(all_children) > MAX_CHILD_NODES_IN_PROMPT:
                # 検索ヒットの子ノードのみを表示
                hit_children = [
                    child_id for child_id in all_children if child_id in hit_ids_set
                ]
                non_hit_count = len(all_children) - len(hit_children)

                # 検索ヒットの子ノードを再帰的に追加
                for child_id in sorted(hit_children):
                    result.extend(build_tree_recursive(child_id, indent + 1, visited))

                # 省略メッセージを追加
                if non_hit_count > 0:
                    omit_prefix = "  " * (indent + 1)
                    result.append(
                        f"{omit_prefix}（他{non_hit_count}件の子ノードは省略）"
                    )
            else:
                # 全ての子ノードを再帰的に追加
                for child_id in sorted(all_children):
                    result.extend(build_tree_recursive(child_id, indent + 1, visited))

            return result

        # 各ルートノードごとにツリーを構築
        for tree_idx, (root_id, hit_ids_in_root) in enumerate(
            sorted(root_groups.items()), 1
        ):
            if root_id not in node_map:
                continue

            # ヒット番号を取得
            hit_indices = [hit_intent_ids.index(hit_id) + 1 for hit_id in hit_ids_in_root]
            hit_indices_str = ", ".join(str(idx) for idx in sorted(hit_indices))

            # ツリーのタイトル
            root_node = node_map[root_id]
            if len(root_groups) == 1:
                lines.append(f"\n#### ゴールツリー (検索ヒット {hit_indices_str})")
            else:
                lines.append(
                    f"\n#### ゴールツリー {tree_idx} (検索ヒット {hit_indices_str})"
                )
            lines.append("")

            # ルートから再帰的にツリーを構築
            visited: set[str] = set()
            tree_lines = build_tree_recursive(root_id, 0, visited)
            lines.extend(tree_lines)

        return "\n".join(lines)

    # 検索ヒットがない場合は従来通りの全体表示
    # ルートノードを見つける（親がないノード）
    # 注: 自己ループは無視する
    child_ids = {edge.from_id for edge in subgraph.edges if edge.from_id != edge.to_id}
    root_ids = {node.id for node in subgraph.nodes if node.id not in child_ids}

    lines.append("")

    # ルートノードから階層的に表示
    visited: set[str] = set()
    hit_ids_set = set(hit_intent_ids) if hit_intent_ids else set()

    def format_node_tree(node_id: str, indent: int = 0) -> list[str]:
        """ノードを階層的にフォーマット"""
        if node_id in visited or node_id not in node_map:
            return []

        visited.add(node_id)
        node = node_map[node_id]
        prefix = "  " * indent

        # ノード詳細情報を取得
        node_detail = nodes_detail.get(node_id, {})
        objective_facts = node_detail.get("objective_facts") or ""
        context = node_detail.get("context") or ""

        # timestampを取得（UnifiedIntentから）
        timestamp = ""
        if intents_map and node_id in intents_map:
            intent = intents_map[node_id]
            timestamp = intent.timestamps[0].isoformat() if intent.timestamps else ""

        # プロパティ部分を構築（id は除外）
        props = []
        if objective_facts:
            props.append(f'objective_facts="{objective_facts}"')
        if context:
            props.append(f'context="{context}"')
        if timestamp:
            props.append(f'timestamp="{timestamp}"')
        props.append(f"status={node.status.value}")

        props_str = " ".join(props)

        # 検索ヒットの場合はマーカーを追加
        hit_marker = ""
        if node_id in hit_ids_set:
            # 検索ヒットの番号を取得
            hit_index = (
                (hit_intent_ids or []).index(node_id) + 1
                if hit_intent_ids and node_id in hit_intent_ids
                else 0
            )
            if hit_index > 0:
                hit_marker = f"**[検索ヒット{hit_index}]** "

        # フォーマット: - intent {props}
        result = [f"{prefix}- {hit_marker}{node.intent} {{{props_str}}}"]

        # 子ノードを探す（自己ループは無視）
        children = [
            edge.from_id
            for edge in subgraph.edges
            if edge.to_id == node_id and edge.from_id != edge.to_id
        ]
        if children:
            for child_id in sorted(children):
                result.extend(format_node_tree(child_id, indent + 1))

        return result

    # 各ルートから木を構築
    for root_id in sorted(root_ids):
        lines.extend(format_node_tree(root_id))

    # 孤立ノード（エッジに含まれないノード）も表示
    orphan_nodes = [node for node in subgraph.nodes if node.id not in visited]
    if orphan_nodes:
        lines.append("\n### 孤立ノード")
        for node in sorted(orphan_nodes, key=lambda n: n.id):
            node_detail = nodes_detail.get(node.id, {})
            objective_facts = node_detail.get("objective_facts") or ""
            context = node_detail.get("context") or ""

            # timestampを取得
            timestamp = ""
            if intents_map and node.id in intents_map:
                intent = intents_map[node.id]
                timestamp = (
                    intent.timestamps[0].isoformat() if intent.timestamps else ""
                )

            # プロパティ部分を構築（id は除外）
            props = []
            if objective_facts:
                props.append(f'objective_facts="{objective_facts}"')
            if context:
                props.append(f'context="{context}"')
            if timestamp:
                props.append(f'timestamp="{timestamp}"')
            props.append(f"status={node.status.value}")

            props_str = " ".join(props)

            # 検索ヒットの場合はマーカーを追加
            hit_marker = ""
            if node.id in hit_ids_set:
                hit_index = (
                    (hit_intent_ids or []).index(node.id) + 1
                    if hit_intent_ids and node.id in hit_intent_ids
                    else 0
                )
                if hit_index > 0:
                    hit_marker = f"**[検索ヒット{hit_index}]** "

            lines.append(f"- {hit_marker}{node.intent} {{{props_str}}}")

    return "\n".join(lines)


# テスト用コード
if __name__ == "__main__":
    # テスト: 任意のノードIDで部分グラフを抽出
    network_path = "output/goal_network/ultra_intent_goal_network.json"

    # ダミーのUnifiedIntentを作成
    from lib.rag_models import IntentStatus

    test_intents = [
        UnifiedIntent(
            id="intent_16_5",
            intent="テスト意図1",
            timestamp="2025-11-14T00:00:00",
            status=IntentStatus.TODO,
            cluster_id=16,
            ultra_intent_id="ultra_0",
            ultra_intent_text="開発プロジェクトの品質と基盤を強化する",
            embedding_text="テスト意図1",
        )
    ]

    # 部分グラフ抽出
    subgraph = extract_subgraph(test_intents, network_path=network_path)

    print(f"部分グラフ: {len(subgraph.nodes)} ノード, {len(subgraph.edges)} エッジ")
    print("\n" + format_subgraph_for_llm(subgraph))

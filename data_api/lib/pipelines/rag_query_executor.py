"""
RAGクエリ実行モジュール

Phase 3: デバッグ用検索（パラメータ直接指定のみ）
"""

import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import chromadb

from lib.pipelines.rag_graph_extractor import (
    build_graph_structure,
    extract_subgraph,
    format_subgraph_for_llm,
    get_ancestors_ordered,
    get_siblings,
    load_goal_network,
)
from lib.rag_models import IntentStatus, QueryParams, SearchResult, UnifiedIntent


def load_unified_intent_from_metadata(
    intent_id: str,
    metadata: dict[str, Any],
    document: str,
) -> UnifiedIntent:
    """
    Chromaのメタデータから UnifiedIntent を復元

    Args:
        intent_id: intent ID
        metadata: Chromaのメタデータ
        document: embedding_text

    Returns:
        UnifiedIntent
    """
    # timestampはUnix時間（整数）またはISO文字列で保存されている
    timestamp_value = metadata.get("timestamp_iso") or metadata.get("timestamp", "")
    if isinstance(timestamp_value, int):
        # Unix時間の場合はdatetimeに変換してリストに
        timestamps = [datetime.fromtimestamp(timestamp_value)]
    elif timestamp_value:
        # ISO文字列の場合はリストに（Pydanticがパースする）
        timestamps = [timestamp_value]
    else:
        timestamps = []

    return UnifiedIntent(
        id=intent_id,
        type="individual_intent",
        intent=metadata.get("intent", ""),
        context=metadata.get("context", ""),
        combined_content="",  # Chromaには保存していない
        timestamps=timestamps,
        status=IntentStatus(metadata.get("status", "idea")),
        cluster_id=metadata.get("cluster_id", 0),
        source_message_ids=[],  # Chromaには保存していない
        source_full_paths=[],  # Chromaには保存していない
        ultra_intent_id=metadata.get("ultra_intent_id", ""),
        ultra_intent_text="",  # Chromaには保存していない
        meta_intent_id=metadata.get("meta_intent_id", ""),
        meta_intent_text="",  # Chromaには保存していない
        embedding_text=document,
    )


def execute_search(
    topic: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    status: str = "todo,idea",
    top_k: int = 15,
    chroma_db_path: str = "output/rag_index/chroma_db",
) -> list[UnifiedIntent]:
    """
    パラメータに基づいて検索実行（デバッグ用）

    Args:
        topic: トピック（semantic search）
        start_date: 開始日（YYYY-MM-DD）
        end_date: 終了日（YYYY-MM-DD）
        status: ステータスフィルタ（カンマ区切り、例: "todo,idea"）
        top_k: 取得件数
        chroma_db_path: Chroma DBのパス

    Returns:
        検索結果の UnifiedIntent リスト
    """
    # Chroma client
    client = chromadb.PersistentClient(path=chroma_db_path)
    collection = client.get_collection(name="intents")

    # メタデータフィルタ構築
    # statusがtupleの場合はそのまま使用、文字列の場合は分割
    if isinstance(status, tuple):
        status_list = list(status)
    elif isinstance(status, str):
        status_list = [s.strip() for s in status.split(",")]
    else:
        status_list = list(status)

    # 期間フィルタと組み合わせる場合は$andを使用
    # Chromaは$gte/$lteで数値比較のみサポートするため、Unix時間（整数）に変換
    if start_date and end_date:
        start_dt = datetime.fromisoformat(start_date)
        end_dt = datetime.fromisoformat(end_date)
        start_timestamp = int(start_dt.timestamp())
        end_timestamp = int(end_dt.timestamp())
        where_filter: dict[str, Any] = {
            "$and": [
                {"status": {"$in": status_list}},
                {"timestamp": {"$gte": start_timestamp}},
                {"timestamp": {"$lte": end_timestamp}},
            ]
        }
    else:
        where_filter = {"status": {"$in": status_list}}

    # Semantic search（トピックがある場合）
    if topic:
        # ruri-large-v2でembeddingを生成（インデックス構築時と同じモデル）
        from sentence_transformers import SentenceTransformer

        model = SentenceTransformer("cl-nagoya/ruri-large-v2")
        query_embedding = model.encode([topic], convert_to_numpy=True)

        results = collection.query(
            query_embeddings=query_embedding.tolist(),
            where=where_filter,
            n_results=top_k,
        )

        # UnifiedIntentに変換
        intents = []
        if results["ids"] and results["ids"][0]:
            for idx, intent_id in enumerate(results["ids"][0]):
                metadata = results["metadatas"][0][idx] if results["metadatas"] else {}
                document = results["documents"][0][idx] if results["documents"] else ""
                intents.append(
                    load_unified_intent_from_metadata(intent_id, metadata, document)
                )
        return intents

    # 期間のみの場合はメタデータフィルタのみ
    if start_date and end_date:
        results = collection.get(
            where=where_filter,
            limit=top_k,
        )

        # UnifiedIntentに変換
        intents = []
        if results["ids"]:
            for idx, intent_id in enumerate(results["ids"]):
                metadata = results["metadatas"][idx] if results["metadatas"] else {}
                document = results["documents"][idx] if results["documents"] else ""
                intents.append(
                    load_unified_intent_from_metadata(intent_id, metadata, document)
                )
        return intents

    # トピックも期間もない場合はエラー
    raise ValueError("topicまたは(start_date AND end_date)のいずれかを指定してください")


def generate_answer(
    query: str,
    intents: list[UnifiedIntent],
    subgraph,
    network_path: str,
) -> str:
    """
    LLMで最終回答を生成

    Args:
        query: ユーザーのクエリ文
        intents: 検索結果の意図リスト
        subgraph: 抽出された部分グラフ
        network_path: ゴールネットワークJSONのパス

    Returns:
        LLM生成の回答
    """
    from pathlib import Path

    from lib import gemini_client

    # テンプレート読み込み
    template_path = Path("templates/rag_answer_prompt.md")
    with open(template_path, encoding="utf-8") as f:
        prompt_template = f.read()

    # 意図リストをフォーマット
    intents_text = "\n".join(
        [
            f"- [{intent.status.value}] {intent.intent} "
            f"({intent.timestamps[0].strftime('%Y-%m-%d') if intent.timestamps else 'N/A'})"
            for intent in intents
        ]
    )

    # グラフをフォーマット（既存の format_subgraph_for_llm を使用）
    # JSONLから全意図を読み込む
    jsonl_path = Path("output/rag_index/unified_intents.jsonl")
    intents_map: dict[str, UnifiedIntent] = {}
    if jsonl_path.exists():
        with open(jsonl_path, encoding="utf-8") as f:
            for line in f:
                intent_dict = json.loads(line)
                intent_obj = UnifiedIntent(**intent_dict)
                intents_map[intent_obj.id] = intent_obj
    else:
        # JSONLがない場合はヒットした意図のみ使用
        intents_map = {intent.id: intent for intent in intents}

    hit_intent_ids = [intent.id for intent in intents]
    graph_text = format_subgraph_for_llm(
        subgraph, intents_map, network_path, hit_intent_ids=hit_intent_ids
    )

    # プロンプト構築
    prompt = prompt_template.replace("{{QUERY}}", query)
    prompt = prompt.replace("{{INTENTS}}", intents_text)
    prompt = prompt.replace("{{GRAPH}}", graph_text)

    # Gemini API呼び出し
    model = gemini_client.GenerativeModel()
    response = model.generate_content(prompt)

    return response.text


def extract_query_params(query: str) -> "QueryParams":
    """
    自然言語クエリからパラメータを抽出

    Args:
        query: 自然言語クエリ（例: 「ここ1週間、開発ツールについて何をやっていたか」）

    Returns:
        QueryParams
    """
    from pathlib import Path

    from lib import gemini_client

    # テンプレート読み込み
    template_path = Path("templates/rag_query_parser_prompt.md")
    with open(template_path, encoding="utf-8") as f:
        prompt_template = f.read()

    # プロンプト構築
    prompt = prompt_template.replace("{{QUERY}}", query)

    # Gemini API呼び出し
    model = gemini_client.GenerativeModel()
    response = model.generate_content(prompt)

    # JSONパース（```json ... ``` のような囲みがある場合は除去）
    response_clean = response.text.strip()
    if response_clean.startswith("```json"):
        response_clean = response_clean[7:]  # "```json\n" を除去
    if response_clean.startswith("```"):
        response_clean = response_clean[3:]  # "```" を除去
    if response_clean.endswith("```"):
        response_clean = response_clean[:-3]  # "```" を除去
    response_clean = response_clean.strip()

    # JSONパース
    params_dict = json.loads(response_clean)

    # Pydantic検証
    return QueryParams(**params_dict)


def execute_rag_query(
    query: str,
    answer_with_llm: bool = True,
    save_output: bool = False,
    chroma_db_path: str = "output/rag_index/chroma_db",
    network_path: str = "output/goal_network/ultra_intent_goal_network.json",
) -> SearchResult:
    """
    RAGクエリ実行（自然言語入力）

    Args:
        query: 自然言語クエリ（例: 「ここ1週間、開発ツールについて何をやっていたか」）
        answer_with_llm: LLMで最終回答を生成するか
        save_output: 検索結果を保存するか
        chroma_db_path: Chroma DBのパス
        network_path: ゴールネットワークJSONのパス

    Returns:
        SearchResult
    """
    print("=" * 60)
    print("RAGクエリ実行（自然言語モード）")
    print("=" * 60)
    print(f"\nクエリ: {query}")

    # 1. クエリパラメータ抽出
    print("\n[1/4] クエリパラメータ抽出中...")
    params = extract_query_params(query)
    print(f"  ✓ 抽出パラメータ:")
    print(f"    - period_days: {params.period_days}")
    print(f"    - topic: {params.topic}")
    print(f"    - status_filter: {[s.value for s in params.status_filter]}")

    # 2. 検索実行
    print("\n[2/4] 検索実行中...")

    # パラメータから検索条件を構築
    topic = params.topic
    start_date = None
    end_date = None
    if params.period_days:
        end_date = datetime.now()
        start_date = end_date - timedelta(days=params.period_days)
        start_date_str = start_date.strftime("%Y-%m-%d")
        end_date_str = end_date.strftime("%Y-%m-%d")
    else:
        start_date_str = None
        end_date_str = None

    status_str = ",".join([s.value for s in params.status_filter])

    intents = execute_search(
        topic=topic,
        start_date=start_date_str,
        end_date=end_date_str,
        status=status_str,
        top_k=15,
        chroma_db_path=chroma_db_path,
    )
    print(f"  ✓ 検索結果: {len(intents)} 件")

    # 結果を表示
    if intents:
        print("\n  検索結果:")
        for i, intent in enumerate(intents[:5], 1):  # 最初の5件のみ表示
            print(f"    {i}. [{intent.status.value}] {intent.intent}")
        if len(intents) > 5:
            print(f"    ... 他 {len(intents) - 5} 件")

    # 3. 部分グラフ抽出
    print("\n[3/4] 部分グラフ抽出中...")
    subgraph = extract_subgraph(
        intents,
        network_path=network_path,
        strategy="balanced",
    )
    print(f"  ✓ 部分グラフ: {len(subgraph.nodes)} ノード, {len(subgraph.edges)} エッジ")

    # 4. LLM回答生成
    answer = None
    if answer_with_llm:
        print("\n[4/4] LLM回答生成中...")
        answer = generate_answer(
            query=query,
            intents=intents,
            subgraph=subgraph,
            network_path=network_path,
        )
        print(f"\n{'=' * 60}")
        print("【LLM生成の回答】")
        print(f"{'=' * 60}")
        print(answer)
        print(f"{'=' * 60}")
    else:
        print("\n[4/4] LLM回答生成をスキップしました")

    # 5. 結果保存
    result = SearchResult(
        query=query,
        params=params,
        intents=intents,
        subgraph=subgraph,
        answer=answer,
        metadata={
            "top_k": len(intents),
            "timestamp": datetime.now().isoformat(),
        },
    )

    if save_output:
        from pathlib import Path

        output_dir = Path("output/rag_queries")
        output_dir.mkdir(parents=True, exist_ok=True)

        timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_path = output_dir / f"query_{timestamp_str}.json"

        # SearchResultをJSONに変換
        result_dict = result.model_dump()
        # datetimeをISO形式に変換
        for intent in result_dict["intents"]:
            intent["timestamps"] = [
                ts.isoformat() if isinstance(ts, datetime) else ts
                for ts in intent["timestamps"]
            ]
            intent["status"] = (
                intent["status"].value
                if hasattr(intent["status"], "value")
                else intent["status"]
            )

        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(result_dict, f, ensure_ascii=False, indent=2, default=str)

        print(f"\n  ✓ 検索結果を保存しました: {output_path}")

    print("\n" + "=" * 60)
    print("✅ クエリ実行完了！")
    print("=" * 60)

    return result


def _print_node_details(
    node_id: str, all_nodes: dict, intents_map: dict, label: str = ""
) -> None:
    """
    ノードの詳細情報を出力

    Args:
        node_id: ノードID
        all_nodes: {node_id: GoalNode}
        intents_map: {intent_id: UnifiedIntent}
        label: ラベル（Self/Parent/Sibling/Childなど）
    """
    if node_id not in all_nodes:
        print(f"    [{label}] {node_id} (ノード情報なし)")
        return

    node = all_nodes[node_id]
    intent = intents_map.get(node_id)

    print(f"    [{label}] {node_id}")
    print(f"      intent: {node.intent}")
    print(f"      status: {node.status.value}")
    print(f"      node_type: {node.node_type}")

    if intent:
        print(
            f"      context: {intent.context[:100]}..."
            if len(intent.context) > 100
            else f"      context: {intent.context}"
        )
        print(f"      timestamps: {[ts.isoformat() for ts in intent.timestamps]}")
        print(f"      cluster_id: {intent.cluster_id}")
        print(f"      ultra_intent_id: {intent.ultra_intent_id}")
        print(
            f"      ultra_intent_text: {intent.ultra_intent_text[:80]}..."
            if len(intent.ultra_intent_text) > 80
            else f"      ultra_intent_text: {intent.ultra_intent_text}"
        )
    print()


def _print_subgraph_details(
    hit_intents: list[UnifiedIntent],
    subgraph,
    network_path: str,
) -> None:
    """
    部分グラフの詳細検証出力

    Args:
        hit_intents: 検索でヒットした意図リスト
        subgraph: 抽出された部分グラフ
        network_path: ゴールネットワークJSONのパス
    """
    # ゴールネットワークを読み込んでグラフ構造を構築
    network_data = load_goal_network(network_path)
    all_nodes, parent_map, children_map = build_graph_structure(network_data)

    # 全てのUnifiedIntentをJSONLから読み込む
    jsonl_path = Path("output/rag_index/unified_intents.jsonl")
    intents_map: dict[str, UnifiedIntent] = {}
    if jsonl_path.exists():
        with open(jsonl_path, encoding="utf-8") as f:
            for line in f:
                intent_dict = json.loads(line)
                intent = UnifiedIntent(**intent_dict)
                intents_map[intent.id] = intent
    else:
        # JSONLがない場合はヒットした意図のみ使用
        intents_map = {intent.id: intent for intent in hit_intents}

    # 検索でヒットした各ノードについて関連ノードを出力
    for i, hit_intent in enumerate(hit_intents, 1):
        node_id = hit_intent.id

        print(f"\n【検索ヒット {i}/{len(hit_intents)}】")
        print("=" * 60)

        # Self
        print("■ Self (検索ヒット本体)")
        _print_node_details(node_id, all_nodes, intents_map, "SELF")

        # Parents（ルートから近い順）
        ancestors = get_ancestors_ordered(node_id, parent_map)
        if ancestors:
            print(f"■ Parents（ルートから近い順: {len(ancestors)}件）")
            for ancestor_id in ancestors:
                _print_node_details(ancestor_id, all_nodes, intents_map, "PARENT")
        else:
            print("■ Parents: なし")
            print()

        # Siblings（同じ親を持つノード）
        siblings = get_siblings(node_id, parent_map, children_map)
        if siblings:
            print(f"■ Siblings（同じ親を持つノード: {len(siblings)}件）")
            for sibling_id in sorted(siblings):
                _print_node_details(sibling_id, all_nodes, intents_map, "SIBLING")
        else:
            print("■ Siblings: なし")
            print()

        # Children（直接の子のみ）
        children = children_map.get(node_id, [])
        if children:
            print(f"■ Children（直接の子のみ: {len(children)}件）")
            for child_id in sorted(children):
                _print_node_details(child_id, all_nodes, intents_map, "CHILD")
        else:
            print("■ Children: なし")
            print()

    print("=" * 60)

    # LLMプロンプト用フォーマット出力
    print("\n" + "=" * 60)
    print("LLMプロンプト用フォーマット（objective_facts + context + timestamp付き）")
    print("=" * 60)
    hit_intent_ids = [intent.id for intent in hit_intents]
    llm_formatted = format_subgraph_for_llm(
        subgraph, intents_map, network_path, hit_intent_ids=hit_intent_ids
    )
    print(llm_formatted)
    print("=" * 60)


def execute_rag_query_debug(
    topic: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    status: str = "todo,idea",
    top_k: int = 15,
    subgraph_strategy: str = "balanced",
    answer_with_llm: bool = False,
    save_output: bool = False,
    chroma_db_path: str = "output/rag_index/chroma_db",
    network_path: str = "output/goal_network/ultra_intent_goal_network.json",
) -> SearchResult:
    """
    RAGクエリ実行（デバッグ用・パラメータ直接指定）

    Args:
        topic: トピック（semantic search）
        start_date: 開始日（YYYY-MM-DD）
        end_date: 終了日（YYYY-MM-DD）
        status: ステータスフィルタ（カンマ区切り、例: "todo,idea"）
        top_k: 取得件数
        subgraph_strategy: グラフ抽出戦略（balanced）
        answer_with_llm: LLMで最終回答を生成するか（Phase 4で実装）
        save_output: 検索結果を保存するか
        chroma_db_path: Chroma DBのパス
        network_path: ゴールネットワークJSONのパス

    Returns:
        SearchResult
    """
    print("=" * 60)
    print("RAGクエリ実行（デバッグモード）")
    print("=" * 60)

    # 検証
    has_period = bool(start_date and end_date)
    has_topic = bool(topic)

    if not has_period and not has_topic:
        raise ValueError(
            "topicまたは(start_date AND end_date)のいずれかを指定してください"
        )

    # パラメータ表示
    print("\n検索パラメータ:")
    if topic:
        print(f"  Topic: {topic}")
    if start_date and end_date:
        print(f"  Period: {start_date} ~ {end_date}")
    print(f"  Status: {status}")
    print(f"  Top-k: {top_k}")
    print(f"  Subgraph strategy: {subgraph_strategy}")

    # 1. 検索実行
    print("\n[1/3] 検索実行中...")
    intents = execute_search(
        topic=topic,
        start_date=start_date,
        end_date=end_date,
        status=status,
        top_k=top_k,
        chroma_db_path=chroma_db_path,
    )
    print(f"  ✓ 検索結果: {len(intents)} 件")

    # 結果を表示
    if intents:
        print("\n  検索結果:")
        for i, intent in enumerate(intents[:5], 1):  # 最初の5件のみ表示
            print(f"    {i}. [{intent.status.value}] {intent.intent}")
        if len(intents) > 5:
            print(f"    ... 他 {len(intents) - 5} 件")

    # 2. 部分グラフ抽出
    print("\n[2/3] 部分グラフ抽出中...")
    subgraph = extract_subgraph(
        intents,
        network_path=network_path,
        strategy=subgraph_strategy,
    )
    print(f"  ✓ 部分グラフ: {len(subgraph.nodes)} ノード, {len(subgraph.edges)} エッジ")

    # 部分グラフの詳細検証出力
    print("\n" + "=" * 60)
    print("部分グラフ詳細検証")
    print("=" * 60)
    _print_subgraph_details(intents, subgraph, network_path)

    # 3. LLM回答生成
    answer = None
    if answer_with_llm:
        print("\n[3/3] LLM回答生成中...")
        answer = generate_answer(
            query=f"topic={topic}, period={start_date}~{end_date}",
            intents=intents,
            subgraph=subgraph,
            network_path=network_path,
        )
        print(f"\n{'=' * 60}")
        print("【LLM生成の回答】")
        print(f"{'=' * 60}")
        print(answer)
        print(f"{'=' * 60}")
    else:
        print("\n[3/3] LLM回答生成をスキップしました")

    # 4. 結果保存
    # QueryParamsを構築
    # statusがtupleの場合はそのまま使用、文字列の場合は分割
    if isinstance(status, tuple):
        status_list = [IntentStatus(s.strip()) for s in status]
    elif isinstance(status, str):
        status_list = [IntentStatus(s.strip()) for s in status.split(",")]
    else:
        status_list = [IntentStatus(s.strip()) for s in status]
    period_days = None
    if start_date and end_date:
        start_dt = datetime.fromisoformat(start_date)
        end_dt = datetime.fromisoformat(end_date)
        period_days = (end_dt - start_dt).days

    params = QueryParams(
        period_days=period_days,
        topic=topic,
        status_filter=status_list,
    )

    result = SearchResult(
        query=f"topic={topic}, period={start_date}~{end_date}",
        params=params,
        intents=intents,
        subgraph=subgraph,
        answer=answer,
        metadata={
            "top_k": len(intents),
            "timestamp": datetime.now().isoformat(),
        },
    )

    if save_output:
        output_dir = Path("output/rag_queries")
        output_dir.mkdir(parents=True, exist_ok=True)

        timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_path = output_dir / f"query_{timestamp_str}.json"

        # SearchResultをJSONに変換
        result_dict = result.model_dump()
        # datetimeをISO形式に変換
        for intent in result_dict["intents"]:
            intent["timestamps"] = [
                ts.isoformat() if isinstance(ts, datetime) else ts
                for ts in intent["timestamps"]
            ]
            intent["status"] = (
                intent["status"].value
                if hasattr(intent["status"], "value")
                else intent["status"]
            )

        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(result_dict, f, ensure_ascii=False, indent=2, default=str)

        print(f"\n  ✓ 検索結果を保存しました: {output_path}")

    print("\n" + "=" * 60)
    print("✅ クエリ実行完了！")
    print("=" * 60)

    return result


# テスト用コード
if __name__ == "__main__":
    # テストケース1: トピックベース
    print("\n### テストケース1: トピックベース ###")
    result1 = execute_rag_query_debug(
        topic="開発ツール",
        status="todo,idea,doing,done",
        top_k=10,
    )

    # テストケース2: 期間ベース
    print("\n\n### テストケース2: 期間ベース ###")
    result2 = execute_rag_query_debug(
        start_date="2025-11-07",
        end_date="2025-11-14",
        status="doing,done",
        top_k=10,
    )

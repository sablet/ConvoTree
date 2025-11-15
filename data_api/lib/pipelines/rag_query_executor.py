"""
RAGクエリ実行モジュール

Phase 3: デバッグ用検索（パラメータ直接指定のみ）
"""

import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import TYPE_CHECKING, Any

import chromadb

from lib.pipelines.rag_graph_extractor import (
    build_graph_structure,
    extract_subgraph,
    format_subgraph_for_llm,
    get_ancestors_ordered,
    get_siblings,
    load_goal_network,
)
from lib.rag_models import (
    IntentStatus,
    QueryDebugParams,
    QueryParams,
    SearchResult,
    UnifiedIntent,
)

if TYPE_CHECKING:
    from lib.rag_models import GoalNetwork

# Display constants for print functions
MAX_INTENTS_TO_DISPLAY = 5
MAX_CONTEXT_LENGTH = 100
MAX_ULTRA_INTENT_LENGTH = 80


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
    if isinstance(timestamp_value, int) and timestamp_value > 0:
        # Unix時間の場合はdatetimeに変換してリストに（0は無効な値として扱う）
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
                metadata = (
                    dict(results["metadatas"][0][idx]) if results["metadatas"] else {}
                )
                document = results["documents"][0][idx] if results["documents"] else ""
                intents.append(
                    load_unified_intent_from_metadata(intent_id, metadata, document)
                )
        return intents

    # 期間のみの場合はメタデータフィルタのみ
    if start_date and end_date:
        get_results = collection.get(
            where=where_filter,
            limit=top_k,
        )

        # UnifiedIntentに変換
        intents = []
        if get_results["ids"]:
            for idx, intent_id in enumerate(get_results["ids"]):
                metadata = (
                    dict(get_results["metadatas"][idx])
                    if get_results["metadatas"]
                    else {}
                )
                document = (
                    get_results["documents"][idx] if get_results["documents"] else ""
                )
                intents.append(
                    load_unified_intent_from_metadata(intent_id, metadata, document)
                )
        return intents

    # トピックも期間もない場合はエラー
    raise ValueError("topicまたは(start_date AND end_date)のいずれかを指定してください")


def _load_intents_map(
    jsonl_path: Path, fallback_intents: list[UnifiedIntent]
) -> dict[str, UnifiedIntent]:
    """
    JSONLファイルから意図マップを読み込む

    Args:
        jsonl_path: unified_intents.jsonlのパス
        fallback_intents: JSONLが存在しない場合のフォールバック意図リスト

    Returns:
        {intent_id: UnifiedIntent}のマッピング
    """
    if jsonl_path.exists():
        from lib.parse_error_handler import safe_json_loads

        intents_map: dict[str, UnifiedIntent] = {}
        with open(jsonl_path, encoding="utf-8") as f:
            for line_num, line in enumerate(f, start=1):
                intent_dict = safe_json_loads(
                    line.strip(),
                    context=f"unified_intents_jsonl_line_{line_num}",
                    metadata={"file": str(jsonl_path), "line_number": line_num},
                    log_errors=True,
                    save_errors=True,
                )
                if intent_dict is None:
                    print(f"  ⚠️ 行 {line_num} のパースをスキップしました: {jsonl_path}")
                    continue
                intent_obj = UnifiedIntent(**intent_dict)
                intents_map[intent_obj.id] = intent_obj
        return intents_map
    return {intent.id: intent for intent in fallback_intents}


def _format_intents_text(intents: list[UnifiedIntent]) -> str:
    """
    意図リストをテキスト形式にフォーマット

    Args:
        intents: 意図リスト

    Returns:
        フォーマット済みテキスト
    """
    return "\n".join(
        [
            f"- [{intent.status.value}] {intent.intent} "
            f"({intent.timestamps[0].strftime('%Y-%m-%d') if intent.timestamps else 'N/A'})"
            for intent in intents
        ]
    )


def _save_prompt_file(
    output_dir: Path, filename: str, query: str, content: str
) -> None:
    """
    プロンプトまたはレスポンスをファイルに保存

    Args:
        output_dir: 出力ディレクトリ
        filename: ファイル名
        query: クエリ文字列
        content: 保存する内容
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    file_path = output_dir / filename

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(f"**Query**: {query}\n\n")
        f.write(f"**Timestamp**: {datetime.now().isoformat()}\n\n")
        f.write("---\n\n")
        f.write(content)

    print(f"  ✓ 保存しました: {file_path}")


def generate_answer(
    query: str,
    intents: list[UnifiedIntent],
    subgraph: "GoalNetwork",
    network_path: str,
    save_prompt: bool = True,
) -> str:
    """
    LLMで最終回答を生成

    Args:
        query: ユーザーのクエリ文
        intents: 検索結果の意図リスト
        subgraph: 抽出された部分グラフ (GoalNetwork)
        network_path: ゴールネットワークJSONのパス
        save_prompt: プロンプトを保存するか

    Returns:
        LLM生成の回答
    """
    from lib import gemini_client

    # テンプレート読み込み
    template_path = Path("templates/rag_answer_prompt.md")
    with open(template_path, encoding="utf-8") as f:
        prompt_template = f.read()

    # 意図リストをフォーマット
    intents_text = _format_intents_text(intents)

    # JSONLから全意図を読み込む
    jsonl_path = Path("output/rag_index/unified_intents.jsonl")
    intents_map = _load_intents_map(jsonl_path, intents)

    # グラフをフォーマット
    hit_intent_ids = [intent.id for intent in intents]
    graph_text = format_subgraph_for_llm(
        subgraph, intents_map, network_path, hit_intent_ids=hit_intent_ids
    )

    # プロンプト構築
    prompt = prompt_template.replace("{{QUERY}}", query)
    prompt = prompt.replace("{{INTENTS}}", intents_text)
    prompt = prompt.replace("{{GRAPH}}", graph_text)

    # プロンプト保存
    timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
    if save_prompt:
        output_dir = Path("output/rag_queries/prompts")
        _save_prompt_file(
            output_dir, f"answer_prompt_{timestamp_str}.md", query, prompt
        )

    # Gemini API呼び出し
    model = gemini_client.GenerativeModel()
    response = model.generate_content(prompt)

    # レスポンス保存
    if save_prompt:
        output_dir = Path("output/rag_queries/prompts")
        _save_prompt_file(
            output_dir, f"answer_response_{timestamp_str}.md", query, response.text
        )

    return response.text


def extract_query_params(query: str, save_prompt: bool = True) -> "QueryParams":
    """
    自然言語クエリからパラメータを抽出

    Args:
        query: 自然言語クエリ（例: 「ここ1週間、開発ツールについて何をやっていたか」）
        save_prompt: プロンプトを保存するか

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

    # プロンプト保存
    timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
    if save_prompt:
        output_dir = Path("output/rag_queries/prompts")
        output_dir.mkdir(parents=True, exist_ok=True)

        prompt_path = output_dir / f"parser_prompt_{timestamp_str}.md"

        with open(prompt_path, "w", encoding="utf-8") as f:
            f.write("# RAG Query Parser Prompt\n\n")
            f.write(f"**Query**: {query}\n\n")
            f.write(f"**Timestamp**: {datetime.now().isoformat()}\n\n")
            f.write("---\n\n")
            f.write(prompt)

        print(f"  ✓ パーサープロンプトを保存しました: {prompt_path}")

    # Gemini API呼び出し
    model = gemini_client.GenerativeModel()
    response = model.generate_content(prompt)

    # レスポンス保存
    if save_prompt:
        output_dir = Path("output/rag_queries/prompts")
        response_path = output_dir / f"parser_response_{timestamp_str}.json"

        with open(response_path, "w", encoding="utf-8") as f:
            f.write(response.text)

        print(f"  ✓ パーサーレスポンスを保存しました: {response_path}")

    # JSONパース（エラーハンドリング付き）
    from lib.parse_error_handler import extract_json_from_markdown

    params_dict = extract_json_from_markdown(
        response.text,
        context="rag_query_param_extraction",
        metadata={"query": query[:100]},  # クエリの最初の100文字を保存
        log_errors=True,
        save_errors=True,
    )

    if params_dict is None:
        raise ValueError(
            f"クエリパラメータの抽出に失敗しました。クエリ: {query[:100]}..."
        )

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
    print("  ✓ 抽出パラメータ:")
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
    _print_search_results(intents)

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
    return _finalize_and_save_result(
        query, params, intents, subgraph, answer, save_output
    )


def _print_search_results(intents: list[UnifiedIntent]) -> None:
    """
    検索結果を表示

    Args:
        intents: 検索結果の意図リスト
    """
    if intents:
        print("\n  検索結果:")
        for i, intent in enumerate(intents[:MAX_INTENTS_TO_DISPLAY], 1):
            print(f"    {i}. [{intent.status.value}] {intent.intent}")
        if len(intents) > MAX_INTENTS_TO_DISPLAY:
            print(f"    ... 他 {len(intents) - MAX_INTENTS_TO_DISPLAY} 件")


def _finalize_and_save_result(
    query: str,
    params: QueryParams,
    intents: list[UnifiedIntent],
    subgraph: "GoalNetwork",
    answer: str | None,
    save_output: bool,
) -> SearchResult:
    """
    検索結果を構築して保存

    Args:
        query: クエリ文字列
        params: クエリパラメータ
        intents: 検索結果の意図リスト
        subgraph: 抽出された部分グラフ
        answer: LLM生成の回答
        save_output: 検索結果を保存するか

    Returns:
        SearchResult
    """
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
        output_dir = Path("output/rag_queries")
        output_dir.mkdir(parents=True, exist_ok=True)

        timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_path = output_dir / f"query_{timestamp_str}.json"

        _save_search_result_to_json(result, output_path)

    print("\n" + "=" * 60)
    print("✅ クエリ実行完了！")
    print("=" * 60)

    return result


def _save_search_result_to_json(result: SearchResult, output_path: Path) -> None:
    """
    検索結果をJSONファイルに保存

    Args:
        result: 検索結果
        output_path: 出力先パス
    """
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
            f"      context: {intent.context[:MAX_CONTEXT_LENGTH]}..."
            if len(intent.context) > MAX_CONTEXT_LENGTH
            else f"      context: {intent.context}"
        )
        print(f"      timestamps: {[ts.isoformat() for ts in intent.timestamps]}")
        print(f"      cluster_id: {intent.cluster_id}")
        print(f"      ultra_intent_id: {intent.ultra_intent_id}")
        print(
            f"      ultra_intent_text: {intent.ultra_intent_text[:MAX_ULTRA_INTENT_LENGTH]}..."
            if len(intent.ultra_intent_text) > MAX_ULTRA_INTENT_LENGTH
            else f"      ultra_intent_text: {intent.ultra_intent_text}"
        )
    print()


def _print_node_category(
    category_name: str,
    node_ids: list[str],
    all_nodes: dict,
    intents_map: dict,
    label: str,
) -> None:
    """
    ノードカテゴリを出力

    Args:
        category_name: カテゴリ名（例: "Parents", "Siblings"）
        node_ids: ノードIDリスト
        all_nodes: {node_id: GoalNode}
        intents_map: {intent_id: UnifiedIntent}
        label: ラベル（例: "PARENT", "SIBLING"）
    """
    if node_ids:
        print(f"■ {category_name}（{len(node_ids)}件）")
        for node_id in node_ids:
            _print_node_details(node_id, all_nodes, intents_map, label)
    else:
        print(f"■ {category_name}: なし")
        print()


def _print_subgraph_details(
    hit_intents: list[UnifiedIntent],
    subgraph: "GoalNetwork",
    network_path: str,
) -> None:
    """
    部分グラフの詳細検証出力

    Args:
        hit_intents: 検索でヒットした意図リスト
        subgraph: 抽出された部分グラフ (GoalNetwork)
        network_path: ゴールネットワークJSONのパス
    """
    # ゴールネットワークを読み込んでグラフ構造を構築
    network_data = load_goal_network(network_path)
    all_nodes, parent_map, children_map = build_graph_structure(network_data)

    # 全てのUnifiedIntentをJSONLから読み込む
    jsonl_path = Path("output/rag_index/unified_intents.jsonl")
    intents_map = _load_intents_map(jsonl_path, hit_intents)

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
        _print_node_category(
            "Parents（ルートから近い順", ancestors, all_nodes, intents_map, "PARENT"
        )

        # Siblings（同じ親を持つノード）
        siblings = sorted(get_siblings(node_id, parent_map, children_map))
        _print_node_category(
            "Siblings（同じ親を持つノード", siblings, all_nodes, intents_map, "SIBLING"
        )

        # Children（直接の子のみ）
        children = sorted(children_map.get(node_id, []))
        _print_node_category(
            "Children（直接の子のみ", children, all_nodes, intents_map, "CHILD"
        )

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


def _convert_status_to_list(status: str | tuple | list) -> list[IntentStatus]:
    """
    ステータス文字列をIntentStatusリストに変換

    Args:
        status: ステータス（文字列、タプル、リスト）

    Returns:
        IntentStatusのリスト
    """
    if isinstance(status, tuple):
        return [IntentStatus(s.strip()) for s in status]
    if isinstance(status, str):
        return [IntentStatus(s.strip()) for s in status.split(",")]
    return [IntentStatus(s.strip()) for s in status]


def _build_query_params_from_debug(params: QueryDebugParams) -> QueryParams:
    """
    QueryDebugParamsからQueryParamsを構築

    Args:
        params: デバッグ用パラメータ

    Returns:
        QueryParams
    """
    status_list = _convert_status_to_list(params.status)
    period_days = None
    if params.start_date and params.end_date:
        start_dt = datetime.fromisoformat(params.start_date)
        end_dt = datetime.fromisoformat(params.end_date)
        period_days = (end_dt - start_dt).days

    return QueryParams(
        period_days=period_days,
        topic=params.topic,
        status_filter=status_list,
    )


def execute_rag_query_debug(params: QueryDebugParams) -> SearchResult:
    """
    RAGクエリ実行（デバッグ用・パラメータ直接指定）

    Args:
        params: QueryDebugParams（トピック、期間、ステータスなどのパラメータ）

    Returns:
        SearchResult
    """
    print("=" * 60)
    print("RAGクエリ実行（デバッグモード）")
    print("=" * 60)

    # 検証
    has_period = bool(params.start_date and params.end_date)
    has_topic = bool(params.topic)

    if not has_period and not has_topic:
        raise ValueError(
            "topicまたは(start_date AND end_date)のいずれかを指定してください"
        )

    # パラメータ表示
    print("\n検索パラメータ:")
    if params.topic:
        print(f"  Topic: {params.topic}")
    if params.start_date and params.end_date:
        print(f"  Period: {params.start_date} ~ {params.end_date}")
    print(f"  Status: {params.status}")
    print(f"  Top-k: {params.top_k}")
    print(f"  Subgraph strategy: {params.subgraph_strategy}")

    # 1. 検索実行
    print("\n[1/3] 検索実行中...")
    intents = execute_search(
        topic=params.topic,
        start_date=params.start_date,
        end_date=params.end_date,
        status=params.status,
        top_k=params.top_k,
        chroma_db_path=params.chroma_db_path,
    )
    print(f"  ✓ 検索結果: {len(intents)} 件")

    # 結果を表示
    _print_search_results(intents)

    # 2. 部分グラフ抽出
    print("\n[2/3] 部分グラフ抽出中...")
    subgraph = extract_subgraph(
        intents,
        network_path=params.network_path,
        strategy=params.subgraph_strategy,
    )
    print(f"  ✓ 部分グラフ: {len(subgraph.nodes)} ノード, {len(subgraph.edges)} エッジ")

    # 部分グラフの詳細検証出力
    print("\n" + "=" * 60)
    print("部分グラフ詳細検証")
    print("=" * 60)
    _print_subgraph_details(intents, subgraph, params.network_path)

    # 3. LLM回答生成
    answer = None
    if params.answer_with_llm:
        print("\n[3/3] LLM回答生成中...")
        answer = generate_answer(
            query=f"topic={params.topic}, period={params.start_date}~{params.end_date}",
            intents=intents,
            subgraph=subgraph,
            network_path=params.network_path,
        )
        print(f"\n{'=' * 60}")
        print("【LLM生成の回答】")
        print(f"{'=' * 60}")
        print(answer)
        print(f"{'=' * 60}")
    else:
        print("\n[3/3] LLM回答生成をスキップしました")

    # 4. 結果保存
    query_params = _build_query_params_from_debug(params)
    query_str = f"topic={params.topic}, period={params.start_date}~{params.end_date}"
    return _finalize_and_save_result(
        query_str, query_params, intents, subgraph, answer, params.save_output
    )


# テスト用コード
if __name__ == "__main__":
    # テストケース1: トピックベース
    print("\n### テストケース1: トピックベース ###")
    params1 = QueryDebugParams(
        topic="開発ツール",
        status="todo,idea,doing,done",
        top_k=10,
    )
    result1 = execute_rag_query_debug(params1)

    # テストケース2: 期間ベース
    print("\n\n### テストケース2: 期間ベース ###")
    params2 = QueryDebugParams(
        start_date="2025-11-07",
        end_date="2025-11-14",
        status="doing,done",
        top_k=10,
    )
    result2 = execute_rag_query_debug(params2)

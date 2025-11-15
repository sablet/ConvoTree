.PHONY: help check format lint typecheck complexity duplication jscpd dead-code deps module-lines run parse-claude-history export-neon rag-query-ui

UV ?= uv

ALL_DIRS := main.py lib scripts
CHECK_DIRS := main.py lib
ENTRY_POINT := main.py

help: ## ヘルプを表示
	@echo "使用可能なコマンド:"
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

rag-query: ## RAG検索（自然言語クエリ）
	@if [ -z "$(QUERY)" ]; then \
		echo "Error: QUERY is required. Usage: make rag-query QUERY=\"your question\""; \
		exit 1; \
	fi
	$(UV) run python $(ENTRY_POINT) rag_query --query="$(QUERY)" --answer_with_llm

rag-query-ui: ## RAGクエリUIを起動（Streamlit）
	$(UV) run streamlit run scripts/rag_query_app.py

## アプリケーションコマンド
clustering: ## ステップ1: メッセージクラスタリング
	$(UV) run python $(ENTRY_POINT) clustering

intent-extraction: ## ステップ2: 意図抽出と階層化（Gemini API使用）
	$(UV) run python $(ENTRY_POINT) intent_extraction --gemini --aggregate --aggregate_all

goal-network: ## ステップ3: ゴールネットワーク構築
	$(UV) run python $(ENTRY_POINT) goal_network --save_prompts 

rag-build: ## RAGインデックス構築
	$(UV) run python $(ENTRY_POINT) rag_build

rag-query-debug: ## RAG検索（デバッグ用・パラメータ直接指定）
	$(UV) run python $(ENTRY_POINT) rag_query_debug \
		$(if $(TOPIC),--topic="$(TOPIC)") \
		$(if $(START),--start_date=$(START)) \
		$(if $(END),--end_date=$(END)) \
		$(if $(STATUS),--status=$(STATUS)) \
		$(if $(TOP_K),--top_k=$(TOP_K)) \
		$(if $(SUBGRAPH),--subgraph_strategy=$(SUBGRAPH))

parse-claude-history: ## Claude履歴をパースしてCSVに変換
	$(UV) run python scripts/claude_history_parser.py parse

export-neon: ## 親ディレクトリでnpm run export:neonを実行
	cd ../../chat-line && npm run export:neon

all-build: ## 全パイプライン実行（データ取得→パース→クラスタリング→意図抽出→ゴールネットワーク→RAG構築）
	@echo "========================================="
	@echo "全パイプライン開始"
	@echo "========================================="
	@echo "\nステップ 1/6: データエクスポート（Neon）"
	@make export-neon
	@echo "\nステップ 2/6: Claude履歴パース"
	@make parse-claude-history
	@echo "\nステップ 3/6: メッセージクラスタリング"
	@make clustering
	@echo "\nステップ 4/6: 意図抽出と階層化"
	@make intent-extraction
	@echo "\nステップ 5/6: ゴールネットワーク構築"
	@make goal-network
	@echo "\nステップ 6/6: RAGインデックス構築"
	@make rag-build
	@echo "\n========================================="
	@echo "全パイプライン完了"
	@echo "========================================="
	@echo "\n主要な出力ファイル:"
	@echo "  1. output/message_clustering/clustered_messages.csv"
	@echo "  2. output/message_clustering/clustering_report.html"
	@echo "  3. output/intent_extraction/cross_cluster/ultra_intents_enriched.json"
	@echo "  4. output/goal_network/ultra_intent_goal_network.json"
	@echo "  5. output/goal_network/ultra_prompts_responses/ (プロンプト/レスポンス)"
	@echo "  6. output/rag_index/unified_intents.jsonl"
	@echo "  7. output/rag_index/chroma_db/"
	@echo "\nRAG検索を試すには:"
	@echo "  make rag-query QUERY=\"ここ1週間、何をやっていたか\""


## コード解析コマンド
check: duplication dead-code deps module-lines format lint complexity typecheck ## 全品質チェックを実行（一部エラーになる可能性あり）

format: ## コードフォーマット (ruff format)
	$(UV) run ruff format $(ALL_DIRS)

lint: ## リントチェック (ruff check)
	$(UV) run ruff check --fix --unsafe-fixes $(CHECK_DIRS)

typecheck: ## 型チェック (mypy)
	$(UV) run mypy $(CHECK_DIRS)

complexity: ## 複雑度チェック (xenon)
	$(UV) run xenon $(CHECK_DIRS)

duplication: ## コードの重複をチェック (jscpd)
	jscpd --config .jscpd.json $(CHECK_DIRS)

dead-code: ## 未使用コード検出 (vulture)
	$(UV) run vulture $(ENTRY_POINT) --min-confidence 80

deps: ## 依存関係チェック (deptry)
	$(UV) run deptry .

module-lines: ## モジュール行数チェック (pylint max-module-lines=500)
	$(UV) run pylint $(CHECK_DIRS) --rcfile=pyproject.toml


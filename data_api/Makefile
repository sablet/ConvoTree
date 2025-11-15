.PHONY: help check format lint typecheck complexity duplication jscpd dead-code deps module-lines run parse-claude-history export-neon

UV ?= uv

ALL_DIRS := main.py lib scripts
CHECK_DIRS := main.py lib
ENTRY_POINT := main.py

help: ## ヘルプを表示
	@echo "使用可能なコマンド:"
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

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

run: ## 全パイプライン実行（クラスタリング→意図抽出→ゴールネットワーク）
	$(UV) run python $(ENTRY_POINT) run_all --save_prompts --save_raw 

run-with-rag: ## 全パイプライン + RAGインデックス構築
	$(UV) run python $(ENTRY_POINT) run_all_with_rag --save_prompts

clustering: ## ステップ1: メッセージクラスタリング
	$(UV) run python $(ENTRY_POINT) clustering

intent-extraction: ## ステップ2: 意図抽出と階層化（Gemini API使用）
	$(UV) run python $(ENTRY_POINT) intent_extraction --gemini --aggregate --aggregate_all

goal-network: ## ステップ3: ゴールネットワーク構築
	$(UV) run python $(ENTRY_POINT) goal_network

rag-build: ## RAGインデックス構築
	$(UV) run python $(ENTRY_POINT) rag_build

rag-query: ## RAG検索（自然言語クエリ）
	@if [ -z "$(QUERY)" ]; then \
		echo "Error: QUERY is required. Usage: make rag-query QUERY=\"your question\""; \
		exit 1; \
	fi
	$(UV) run python $(ENTRY_POINT) rag_query --query="$(QUERY)" --answer_with_llm

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

all-build:
	@make export-neon
	@make parse-claude-history
	# @make run
	@make build-rag
	# @make rag-query QUERY="タスク開発アプリで次にやるべきことは何か"

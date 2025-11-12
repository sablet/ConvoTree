.PHONY: help test-api jscpd run-all run-1 run-2 run-3 run-4 run-5 report clean

help: ## ヘルプを表示
	@echo "使用可能なコマンド:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

test-api: ## Gemini API の動作確認
	uv run python scripts/test_gemini_api.py

jscpd: ## コードの重複をチェック
	jscpd .

run-full: ## 全パイプライン実行 (Pipeline 1-5)
	@echo "Pipeline 1-3を実行..."
	uv run python main.py \
		--input data/messagees_sample.csv \
		--pipelines 1,2,3 \
		--threshold 30 \
		--output output/
	@echo ""
	@echo "Pipeline 4を実行（全Intent対象）..."
	uv run python main.py \
		--pipelines 4 \
		--intents output/intents_embedded.json \
		--n-temporal 5 \
		--m-similarity 5 \
		--output output/
	@echo ""
	@echo "Pipeline 5を実行（全グループ対象）..."
	uv run python main.py \
		--pipelines 5 \
		--intents output/intents_embedded.json \
		--output output/

run-1: ## Pipeline 1のみ実行
	uv run python main.py \
		--input data/messagees_sample.csv \
		--pipelines 1 \
		--threshold 30 \
		--output output/

run-2: ## Pipeline 2のみ実行（groups.json必要）
	uv run python main.py \
		--input data/messagees_sample.csv \
		--pipelines 2 \
		--groups output/groups.json \
		--output output/

run-3: ## Pipeline 3のみ実行（intents.json必要）
	uv run python main.py \
		--pipelines 3 \
		--intents output/intents.json \
		--output output/

run-4: ## Pipeline 4のみ実行（intents_embedded.json必要、INTENT_ID指定）
	@if [ -z "$(INTENT_ID)" ]; then \
		echo "エラー: INTENT_ID を指定してください"; \
		echo "例: make run-4 INTENT_ID=group_000_intent_0"; \
		exit 1; \
	fi
	uv run python main.py \
		--pipelines 4 \
		--intents output/intents_embedded.json \
		--intent-id $(INTENT_ID) \
		--n-temporal 5 \
		--m-similarity 5 \
		--output output/

run-5: ## Pipeline 5のみ実行（intents_embedded.json, similar.json必要、INTENT_ID指定）
	@if [ -z "$(INTENT_ID)" ]; then \
		echo "エラー: INTENT_ID を指定してください"; \
		echo "例: make run-5 INTENT_ID=group_000_intent_0"; \
		exit 1; \
	fi
	uv run python main.py \
		--pipelines 5 \
		--intents output/intents_embedded.json \
		--intent-id $(INTENT_ID) \
		--output output/

report: ## 依存関係レポートを生成（intents.json, relations.json必要）
	uv run python scripts/generate_report.py

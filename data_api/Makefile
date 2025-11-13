.PHONY: help check format lint typecheck complexity duplication jscpd dead-code deps module-lines run

UV ?= uv

CHECK_DIRS := main.py lib
ENTRY_POINT := main.py

help: ## ヘルプを表示
	@echo "使用可能なコマンド:"
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

check: duplication dead-code deps module-lines format lint complexity typecheck ## 全品質チェックを実行（一部エラーになる可能性あり）

format: ## コードフォーマット (ruff format)
	$(UV) run ruff format $(CHECK_DIRS)

lint: ## リントチェック (ruff check)
	$(UV) run ruff check --fix --unsafe-fixes $(CHECK_DIRS)

typecheck: ## 型チェック (mypy)
	$(UV) run mypy $(CHECK_DIRS)

complexity: ## 複雑度チェック (xenon)
	$(UV) run xenon $(CHECK_DIRS)

duplication: ## コードの重複をチェック (jscpd)
	jscpd --config .jscpd.json $(CHECK_DIRS)

jscpd: ## コードの重複をチェック (非推奨: duplication を使用)
	jscpd .

dead-code: ## 未使用コード検出 (vulture)
	$(UV) run vulture $(ENTRY_POINT) --min-confidence 80

deps: ## 依存関係チェック (deptry)
	$(UV) run deptry .

module-lines: ## モジュール行数チェック (pylint max-module-lines=500)
	$(UV) run pylint $(CHECK_DIRS) --rcfile=pyproject.toml

run: ## 全パイプライン実行（プロンプト/レスポンス保存）
	$(UV) run python main.py run_all --save_prompts

clustering: ## ステップ1: メッセージクラスタリング
	$(UV) run python main.py clustering

intent-extraction: ## ステップ2: 意図抽出と階層化（Gemini API使用）
	$(UV) run python main.py intent_extraction --gemini --aggregate --aggregate_all

goal-network: ## ステップ3: ゴールネットワーク構築
	$(UV) run python main.py goal_network

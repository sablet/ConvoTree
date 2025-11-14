# Message Intent Analysis - 検証プログラム

メッセージデータから意図（Intent: 「〜したい」という目的）を抽出し、時系列・意味的類似度・因果関係で関連性を分析する処理フローの検証。

## 目的

散在するメッセージから意図を自動抽出し、時間的・意味的に関連する意図を発見し、因果関係を明らかにする。これまで何をやっていたか、次に何をやるべきか、にアイデアベースでも良いので答える。


答えたい質問の例： [] で囲まれた部分は変数
* ここ[一週間|数日|１ヶ月]、何をやっていたか
* [トピック]について 次にやるべきことは何か

## クイックスタート

### 環境設定

```bash
# 1. 依存パッケージインストール
uv sync

# 3. 環境変数設定（.envファイル作成）
echo "GEMINI_API_KEY=your_api_key_here" > .env
```

**注**: 入力ファイル `messages_with_hierarchy.csv` は chat-line アプリから別途エクスポートされます。

### 実行例

```bash
# 基本パイプライン実行（クラスタリング→意図抽出→ゴールネットワーク）
make run

# RAGまで含む完全パイプライン実行
make run-with-rag

# RAG検索（run-with-rag実行後）
make rag-query QUERY="ここ1週間、何をやっていたか"
make rag-query QUERY="開発ツールについて次にやるべきことは何か"

# 使用可能なコマンド一覧
make help
```

**所要時間**: 初回実行で約10〜20分（メッセージ数に依存）

## 処理フロー

`messages_with_hierarchy.csv` → RAGシステムまでの主要パイプライン：

```
1. メッセージクラスタリング
   messages_with_hierarchy.csv → clustered_messages.csv

2. 意図抽出と階層化
   clustered_messages.csv → 個別意図 → 上位意図 → 最上位意図 → ultra_intents_enriched.json

3. ゴールネットワーク構築
   ultra_intents_enriched.json → ultra_intent_goal_network.json

4. RAGインデックス構築（オプション）
   既存ファイル群 → unified_intents.jsonl → Vector DB (Chroma)

5. RAG質問応答（オプション）
   自然言語クエリ → 検索 → 部分グラフ抽出 → LLM回答生成
```

**パイプライン構成**:
- `make run`: ステップ1〜3（クラスタリング、意図抽出、ゴールネットワーク構築）
- `make run-with-rag`: ステップ1〜4（上記 + RAGインデックス構築）

---

## 詳細実行手順

### 1. 入力データ

**データソース**: chat-lineアプリからエクスポートされた `messages_with_hierarchy.csv`

**CSV構造**:
```csv
full_path,start_time,end_time,combined_content
Inbox,2025-11-10 10:58:00,2025-11-10 10:58:00,メッセージ内容
Inbox -> タスク -> 開発,2025-11-09 15:30:00,2025-11-09 15:30:00,開発タスクの内容
```

**カラム説明**:
- `full_path`: チャネル階層パス（` -> ` 区切り）
- `start_time`: メッセージ開始時刻
- `end_time`: メッセージ終了時刻
- `combined_content`: メッセージ本文

---

### 2. メッセージクラスタリング

**目的**: 意味的に類似したメッセージをクラスタにグループ化

**実行方法**:
```bash
# Makeコマンド（推奨）
make clustering

# 詳細オプション指定（直接実行）
uv run python main.py clustering \
  --method=kmeans_constrained \
  --size_min=10 \
  --size_max=50 \
  --embedding_weight=0.7 \
  --time_weight=0.15 \
  --hierarchy_weight=0.15
```

**出力先**:
- `output/message_clustering/clustered_messages.csv` - クラスタリング結果
- `output/message_clustering/clustering_report.html` - クラスタレポート
- `output/message_clustering/cluster_distribution.png` - クラスタサイズ分布
- `output/message_clustering/tsne_projection.png` - t-SNE可視化
- `output/message_clustering/temporal_clusters.png` - 時系列分布
- `output/message_clustering/clustering_metadata.json` - メトリクス・設定

**処理内容**:
1. 文章埋め込みベクトル生成（ruri-large-v2）
2. 埋め込み・時間・階層距離の合成
3. クラスタリング（HDBSCAN/k-means-constrained/階層的）
4. クラスタIDをメッセージに付与
5. 評価指標の計算とレポート生成

**CSV構造**:
```csv
full_path,start_time,end_time,combined_content,message_id,normalized_path,hierarchy_depth,cluster
Inbox,2025-11-10 10:58:00,2025-11-10 10:58:00,メッセージ内容,msg_00000,Inbox,0,3
```

---

### 3. 意図抽出と階層化

意図の抽出は3つのレベルで実行されます：

```
Level 0: 個別意図 (individual intents)    ← メッセージから抽出
  ↓ 各クラスタ内でグループ化
Level 1: クラスタ別上位意図 (meta intents)  ← 個別意図をグループ化
  ↓ 全クラスタ横断でグループ化
Level 2: 最上位意図 (super intents)        ← 上位意図をさらにグループ化
```

#### 3-1. 個別意図の抽出

**目的**: 各クラスタのメッセージから個別の意図を抽出

**実行方法**:
```bash
# 全クラスタを処理
uv run python main.py intent_extraction --gemini

# 特定クラスタのみ処理
uv run python main.py intent_extraction --gemini --cluster=6

# 生レスポンスも保存（デバッグ用）
uv run python main.py intent_extraction --gemini --cluster=6 --save_raw
```

**出力先**:
- `output/intent_extraction/processed/cluster_XX_processed.json` - Level 0: 個別意図
- `output/intent_extraction/raw_responses/cluster_XX_raw_response.txt` - 生レスポンス（オプション）
- `output/intent_extraction/intent_review.html` - レビュー用HTML

**個別意図オブジェクト構造**:
```json
{
  "intent": "スラッシュコマンドの自動補完機能を実現したい",
  "status": "todo",
  "cluster_id": 6,
  "source_message_ids": ["msg_00496"],
  "source_full_paths": ["Inbox -> タスク開発アプリ -> 欲しい機能"],
  "start_timestamps": ["2025-09-24T00:33:00"],
  "context": "今後コマンドが増えていっても自動で対応されるようにしたい。"
}
```

**statusの定義**:
- `idea`: アイデア・構想段階
- `todo`: 着手していないタスク
- `doing`: 進行中
- `done`: 完了

---

#### 3-2. クラスタ別上位意図の抽出

**目的**: 各クラスタ内の個別意図をグループ化し、上位の意図を生成

**実行方法**:
```bash
# 全クラスタで意図抽出+上位意図抽出
uv run python main.py intent_extraction --gemini --aggregate

# 特定クラスタのみ
uv run python main.py intent_extraction --gemini --aggregate --cluster=2
```

**出力先**:
- `output/intent_extraction/aggregated/cluster_XX_aggregated.json` - Level 1: 上位意図

**上位意図オブジェクト構造**:
```json
{
  "meta_intent": "LLMコーディングエージェントの選定と費用管理の効率化を実現したい",
  "description": "...",
  "covered_intent_indices": [0, 1, 2, 3],  // 含まれる個別意図のインデックス
  "rationale": "これらの意図は全てLLMエージェントの選定と費用という共通テーマを持つ",
  "aggregate_status": "todo"  // 含まれる意図の中で最も進んでいないステータス
}
```

**処理の流れ**:
1. Pythonが個別意図のテキストのみを抽出（`intent`フィールド）
2. LLMが意図の内容を理解し、共通テーマでグループ化
3. Pythonがグループ情報から上位意図オブジェクトを構築
   - 網羅性チェック（全ての個別意図がカバーされているか）
   - 重複チェック（1つの意図が複数のグループに属していないか）
   - `aggregate_status`の決定（最も進んでいないステータス）

---

#### 3-3. 最上位意図の抽出（クラスタ横断）

**目的**: 全クラスタの上位意図をさらにグループ化し、最上位の意図を生成

**実行方法**:
```bash
# Makeコマンド（推奨）
make intent-extraction

# 直接実行
uv run python main.py intent_extraction --gemini --aggregate --aggregate_all
```

**出力先**:
- `output/intent_extraction/cross_cluster/super_intents.json` - Level 2: 最上位意図
- `output/intent_extraction/cross_cluster/ultra_intents_enriched.json` - エンリッチ済み最上位意図

**最上位意図オブジェクト構造**:
```json
{
  "super_intent": "個人の生産性と意思決定の質を向上させたい",
  "description": "...",
  "covered_meta_intent_indices": [0, 3, 5, 8],  // 含まれる上位意図のインデックス
  "rationale": "複数クラスタの上位意図（タスク管理、思考整理、時間管理）を包含",
  "aggregate_status": "idea"
}
```

**処理の流れ**:
1. Pythonが全クラスタの上位意図を収集
2. Pythonが上位意図のテキストのみを抽出（`meta_intent`フィールド）
3. LLMが上位意図の内容を理解し、共通テーマでグループ化
4. Pythonが最上位意図オブジェクトを構築（網羅性・重複チェック、status決定）
5. **自動的にエンリッチを実行**: 各最上位意図に個別意図の詳細情報を付加し、`ultra_intents_enriched.json`を生成

**注意**: `--aggregate-all`は全クラスタ処理が必要なため、`--cluster`オプションとは併用できません。

---

#### 3-4. 意図定義の共通化

全てのレベルの意図（individual, meta, super）は同じ定義に従います：

**intent の定義**: 何を目指しているか、目的としているか

以下を両方含むこと:
- **志向対象（Target / Object）**: 何に向かっているのか（目的・目標・状態・価値など）
- **志向方向性（Directionality）**: 主体がその対象に対してどうしたいのか

**良い例**:
- 「作業効率を上げたい」（対象=作業効率、方向性=上げたい）
- 「ユーザーが迷わず使えるUIを実現したい」（対象=UI、方向性=実現したい）

**悪い例**:
- 「より良くしたい」（対象が不明）
- 「デザインが気になる」（方向性が欠けている）

**テンプレート構造**:
```
templates/
├── common/
│   └── intent_object_common.md               # 共通定義（全レベルで共有）
├── intent_extraction_prompt.md               # メッセージ → 個別意図
├── intent_grouping_prompt.md                 # 意図のグループ化（統一テンプレート）
├── intent_reassignment_prompt.md             # 意図の再割り当て
├── goal_network_extraction_prompt.md         # ゴールネットワーク抽出
└── ultra_sub_intent_relations_prompt.md      # Ultra配下の階層構造抽出
```

`intent_grouping_prompt.md`は以下の両方で使用:
- 個別意図 → 上位意図
- 上位意図 → 最上位意図

---

### 4. ゴールネットワーク構築

**目的**: 意図間の目的→手段リレーションを抽出し、階層的なゴールネットワークを構築

**実行方法**:
```bash
# Makeコマンド（推奨）
make goal-network

# 詳細オプション指定（直接実行）
# 全Ultra Intentsを処理
uv run python main.py goal_network

# 特定のUltra Intent（ID: 0-6）のみ処理
uv run python main.py goal_network --ultra_id=0

# プロンプト/レスポンスも保存
uv run python main.py goal_network --save_prompts
```

**処理内容**:
- 各Ultra Intent配下の個別intentをLLMで階層化
- 目的→手段のゴール-手段リレーションを抽出
- テンプレート: `templates/ultra_sub_intent_relations_prompt.md`

**出力先**:
- `output/goal_network/ultra_intent_goal_network.json` - ゴールネットワーク全体
- `output/goal_network/ultra_prompts_responses/` - プロンプト/レスポンス（`--save-prompts`時）
  - `intent_relations_ultra_{X}_prompt.md` - Ultra Intent X用のプロンプト
  - `intent_relations_ultra_{X}_raw_response.md` - LLMの生レスポンス
  - `intent_relations_ultra_{X}_parsed.json` - パース済みのリレーション情報

**ゴールネットワーク構造**:
```json
{
  "nodes": [
    {
      "id": "ultra_0",
      "type": "ultra_intent",
      "intent": "最上位意図のテキスト",
      "description": "...",
      "aggregate_status": "idea"
    },
    {
      "id": "msg_00496",
      "type": "individual_intent",
      "intent": "個別意図のテキスト",
      "status": "todo",
      "cluster_id": 6,
      "source_message_ids": ["msg_00496"],
      "context": "..."
    },
    {
      "id": "generated_001",
      "type": "generated",
      "intent": "LLMが生成した中間ゴール",
      "description": "..."
    }
  ],
  "relations": [
    {
      "source": "ultra_0",
      "target": "generated_001",
      "type": "means"
    },
    {
      "source": "generated_001",
      "target": "msg_00496",
      "type": "means"
    }
  ]
}
```

**ノードタイプ**:
- `ultra_intent`: 最上位意図（ルートノード）
- `individual_intent`: 個別意図（メッセージから抽出）
- `generated`: LLMが生成した中間ゴール

**リレーションタイプ**:
- `means`: 目的→手段の関係（source を達成するために target が必要）

---

### 5. RAGシステム（質問応答）

**目的**: 既存の意図データとゴールネットワークを活用し、自然言語で質問に回答するシステム

**機能概要**:
- 自然言語クエリから期間・トピック・ステータスを自動抽出
- Vector DB（Chroma）による意味的検索
- ゴールネットワークからの部分グラフ抽出（Balanced Strategy）
- LLMによる最終回答生成

#### 5-1. RAGインデックス構築

**前提**: ステップ1〜3の実行が完了していること

**実行方法**: `make run-with-rag`（推奨、全自動）または `make rag-build`（個別実行）

**処理内容**:
1. 既存ファイルから統合ドキュメントを生成
   - メッセージ本文・意図・階層情報を統合
2. ruri-large-v2でEmbeddingを生成
3. Chromaにインデックスを作成

**出力先**:
- `output/rag_index/unified_intents.jsonl` - 統合ドキュメント
- `output/rag_index/chroma_db/` - Vector DBデータ

#### 5-2. RAG質問応答（自然言語クエリ）

**実行方法**:
```bash
# 過去の活動を確認
make rag-query QUERY="ここ1週間、開発ツールについて何をやっていたか"

# 次のアクションを確認
make rag-query QUERY="アルゴトレードについて次にやるべきことは何か"

# 期間のみ
make rag-query QUERY="ここ数日、何をやっていたか"

# トピックのみ
make rag-query QUERY="Claude Codeについて次にやるべきことは"
```

**処理フロー**:
1. **クエリパラメータ抽出**（LLM使用）
   - 期間: 「ここ1週間」→ 7日
   - トピック: 「開発ツール」
   - ステータス: 「何をやっていたか」→ `["doing", "done"]`
2. **Vector DB検索**
   - 期間フィルタ + トピックのsemantic search
3. **部分グラフ抽出**
   - 検索結果のintentに関連するゴールネットワークを抽出
4. **LLM回答生成**
   - 検索結果 + 部分グラフ → 最終回答

**出力例**:
```
抽出パラメータ: QueryParams(period_days=7, topic="開発ツール", status_filter=["doing", "done"], ...)
検索結果: 12 件
部分グラフ: 25 ノード, 18 エッジ

回答:
ここ1週間、開発ツール関連で以下の活動を行っていました：
1. Claude Codeのワークフロー改善（doing）
2. スラッシュコマンドの自動補完機能の検討（done）
3. ...
```

#### 5-3. RAG検索（デバッグ用・パラメータ直接指定）

**実行方法**:
```bash
# トピックのみ指定
make rag-query-debug TOPIC="開発ツール" STATUS="doing,done"

# 期間のみ指定
make rag-query-debug START=2025-11-07 END=2025-11-14 STATUS="todo,idea"

# ハイブリッド検索（期間 + トピック）
make rag-query-debug TOPIC="開発ツール" START=2025-11-07 END=2025-11-14 STATUS="doing,done"

# 全パラメータ指定
make rag-query-debug \
  TOPIC="RAG" \
  START=2025-11-07 \
  END=2025-11-14 \
  STATUS="doing,done" \
  TOP_K=20 \
  SUBGRAPH=balanced
```

**パラメータ**:
- `TOPIC`: トピック（semantic search）
- `START`: 開始日（YYYY-MM-DD形式）
- `END`: 終了日（YYYY-MM-DD形式）
- `STATUS`: ステータスフィルタ（カンマ区切り、デフォルト: `todo,idea`）
- `TOP_K`: 取得件数（デフォルト: 15）
- `SUBGRAPH`: グラフ抽出戦略（minimal/balanced/max、デフォルト: balanced）

**検証ルール**:
- `TOPIC` または `(START AND END)` のいずれかが必須
- 両方なしの場合はエラー

**詳細仕様**: `output/doc/rag_implementation_spec.md` を参照

---

## ディレクトリ構造

```
data_api/
├── main.py                                       # 全パイプライン実行スクリプト
├── templates/
│   ├── common/
│   │   └── intent_object_common.md               # 意図定義の共通部分
│   ├── intent_extraction_prompt.md               # メッセージ → 個別意図
│   ├── intent_grouping_prompt.md                 # 意図のグループ化（統一）
│   ├── intent_reassignment_prompt.md             # 意図の再割り当て
│   ├── goal_network_extraction_prompt.md         # ゴールネットワーク抽出
│   ├── ultra_sub_intent_relations_prompt.md      # Ultra配下の階層構造抽出
│   ├── rag_query_parser_prompt.md                # RAG: クエリパラメータ抽出
│   └── rag_answer_prompt.md                      # RAG: 回答生成
├── scripts/
│   ├── generate_intent_extraction_prompts.py     # 意図抽出・階層化
│   ├── run_clustering_with_report.py             # メッセージクラスタリング実行
│   ├── message_clustering.py                     # メッセージクラスタリングメイン
│   └── goal_network_builder.py                   # ゴールネットワーク構築
├── output/
│   ├── .cache/
│   │   └── intent_extraction/                    # Gemini APIレスポンスキャッシュ
│   ├── message_clustering/
│   │   ├── clustered_messages.csv                # クラスタリング結果
│   │   ├── clustering_report.html                # クラスタレポート
│   │   └── *.png                                 # 可視化画像
│   ├── intent_extraction/
│   │   ├── processed/                            # Level 0: 個別意図
│   │   │   └── cluster_XX_processed.json
│   │   ├── raw_responses/                        # 生レスポンス（--save-raw時）
│   │   │   └── cluster_XX_raw_response.txt
│   │   ├── aggregated/                           # Level 1: クラスタ別上位意図
│   │   │   └── cluster_XX_aggregated.json
│   │   ├── cross_cluster/                        # Level 2: 最上位意図
│   │   │   ├── super_intents.json                # 最上位意図
│   │   │   └── ultra_intents_enriched.json       # エンリッチ済み最上位意図
│   │   └── intent_review.html                    # レビュー用HTML
│   ├── goal_network/
│   │   ├── ultra_intent_goal_network.json        # Ultra モード出力
│   │   └── ultra_prompts_responses/              # Ultra モードプロンプト/レスポンス
│   │       ├── intent_relations_ultra_X_prompt.md        # プロンプト
│   │       ├── intent_relations_ultra_X_raw_response.md  # 生レスポンス
│   │       └── intent_relations_ultra_X_parsed.json      # パース済みJSON
│   ├── rag_index/                                # RAGインデックス
│   │   ├── unified_intents.jsonl                 # 統合ドキュメント
│   │   └── chroma_db/                            # Vector DBデータ
│   └── rag_queries/                              # RAGクエリ結果（--save_output時）
│       └── query_YYYYMMDD_HHMMSS.json
└── lib/
    ├── rag_models.py                             # RAG用データモデル（Pydantic）
    ├── pipelines/
    │   ├── rag_index_builder.py                  # RAG: 統合ドキュメント生成 + インデックス化
    │   ├── rag_query_executor.py                 # RAG: クエリ実行（パラメータ抽出→検索→回答）
    │   └── rag_graph_extractor.py                # RAG: グラフトラバーサル（部分グラフ抽出）
    └── gemini_client.py                          # Gemini APIクライアント
```

**注**: 入力ファイル `messages_with_hierarchy.csv` は chat-line アプリから別途エクスポートされます。

# Message Intent Analysis - 検証プログラム

メッセージデータから意図（Intent: 「〜したい」という目的）を抽出し、時系列・意味的類似度・因果関係で関連性を分析する処理フローの検証。

## 目的

散在するメッセージから意図を自動抽出し、時間的・意味的に関連する意図を発見し、因果関係を明らかにする。

## 処理フロー

### 2. メッセージクラスタリング

**目的**: 意味的に類似したメッセージをクラスタにグループ化

**実行方法**:
```bash
# レポート付きで実行（推奨）
uv run python scripts/run_clustering_with_report.py

# クラスタリング手法を指定
uv run python scripts/run_clustering_with_report.py --method kmeans_constrained --size-min 10 --size-max 50

# 重み調整
uv run python scripts/run_clustering_with_report.py --embedding-weight 0.7 --time-weight 0.15 --hierarchy-weight 0.15

# HTMLを自動で開かない
uv run python scripts/run_clustering_with_report.py --no-open

# 直接実行（詳細オプション指定時）
uv run python message_clustering.py --method hdbscan --min-cluster-size 5
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

### 3. 意図抽出プロンプト生成

**目的**: クラスタごとに意図抽出用のプロンプトを生成

**実行方法**:
```bash
# プロンプトのみ生成
uv run python scripts/generate_intent_extraction_prompts.py

# レビュー用HTMLインデックス
open output/intent_extraction/index.html
```

**出力先**:
- `output/intent_extraction/cluster_XX_prompt.md` - 各クラスタのプロンプト
- `output/intent_extraction/index.html` - レビュー用インデックス
- `output/intent_extraction/generation_summary.json` - サマリー情報

**プロンプト構造**:
- テンプレート: `templates/intent_extraction_prompt.md`
- クラスタ内の全メッセージを時系列順に配置
- Gemini APIに投げて意図オブジェクトを抽出

---

### 4. 意図抽出と階層化

意図の抽出は3つのレベルで実行されます：

```
Level 0: 個別意図 (individual intents)    ← メッセージから抽出
  ↓ 各クラスタ内でグループ化
Level 1: クラスタ別上位意図 (meta intents)  ← 個別意図をグループ化
  ↓ 全クラスタ横断でグループ化
Level 2: 最上位意図 (super intents)        ← 上位意図をさらにグループ化
```

#### 4-1. 個別意図の抽出

**目的**: 各クラスタのメッセージから個別の意図を抽出

**実行方法**:
```bash
# 全クラスタを処理
uv run python scripts/generate_intent_extraction_prompts.py --gemini

# 特定クラスタのみ処理
uv run python scripts/generate_intent_extraction_prompts.py --gemini --cluster 6

# 生レスポンスも保存（デバッグ用）
uv run python scripts/generate_intent_extraction_prompts.py --gemini --cluster 6 --save-raw
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
  "min_start_timestamp": "2025-09-24T00:33:00",
  "context": "今後コマンドが増えていっても自動で対応されるようにしたい。"
}
```

**statusの定義**:
- `idea`: アイデア・構想段階
- `todo`: 着手していないタスク
- `doing`: 進行中
- `done`: 完了

---

#### 4-2. クラスタ別上位意図の抽出

**目的**: 各クラスタ内の個別意図をグループ化し、上位の意図を生成

**実行方法**:
```bash
# 全クラスタで意図抽出+上位意図抽出
uv run python scripts/generate_intent_extraction_prompts.py --gemini --aggregate

# 特定クラスタのみ
uv run python scripts/generate_intent_extraction_prompts.py --gemini --aggregate --cluster 2
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

#### 4-3. 最上位意図の抽出（クラスタ横断）

**目的**: 全クラスタの上位意図をさらにグループ化し、最上位の意図を生成

**実行方法**:
```bash
# 全クラスタで3階層の意図抽出
uv run python scripts/generate_intent_extraction_prompts.py --gemini --aggregate --aggregate-all
```

**出力先**:
- `output/intent_extraction/cross_cluster/super_intents.json` - Level 2: 最上位意図

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

**注意**: `--aggregate-all`は全クラスタ処理が必要なため、`--cluster`オプションとは併用できません。

---

#### 4-4. 意図定義の共通化

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
│   └── intent_object_common.md           # 共通定義（全レベルで共有）
├── intent_extraction_prompt.md           # メッセージ → 個別意図
└── intent_grouping_prompt.md             # 意図のグループ化（統一テンプレート）
```

`intent_grouping_prompt.md`は以下の両方で使用:
- 個別意図 → 上位意図
- 上位意図 → 最上位意図

---

### 5. 次のステップ（予定）

- [ ] 意図間の時系列・意味的関連性分析
- [ ] 因果関係の推定
- [ ] 最上位意図の可視化（ネットワークグラフ）

---

## ディレクトリ構造

```
data_api/
├── templates/
│   ├── common/
│   │   └── intent_object_common.md           # 意図定義の共通部分
│   ├── intent_extraction_prompt.md           # メッセージ → 個別意図
│   └── intent_grouping_prompt.md             # 意図のグループ化（統一）
├── scripts/
│   └── generate_intent_extraction_prompts.py # 意図抽出・階層化メインスクリプト
├── output/
│   ├── .cache/
│   │   └── intent_extraction/                # Gemini APIレスポンスキャッシュ
│   ├── message_clustering/
│   │   ├── clustered_messages.csv            # クラスタリング結果
│   │   └── clustering_report.html            # クラスタレポート
│   └── intent_extraction/
│       ├── cluster_XX_prompt.md              # 各クラスタのプロンプト
│       ├── index.html                        # プロンプト一覧
│       ├── intent_review.html                # 意図抽出結果レビュー
│       ├── generation_summary.json           # サマリー情報
│       ├── processed/                        # Level 0: 個別意図
│       │   └── cluster_XX_processed.json
│       ├── aggregated/                       # Level 1: クラスタ別上位意図
│       │   └── cluster_XX_aggregated.json
│       ├── cross_cluster/                    # Level 2: 最上位意図
│       │   └── super_intents.json
│       └── raw_responses/                    # （オプション）生レスポンス
│           └── cluster_XX_raw_response.txt
└── data/
    └── messages_export.json                  # エクスポートされたメッセージ
```

---

## 環境設定

### 必要な環境変数

`.env`ファイルに以下を設定:
```bash
GEMINI_API_KEY=your_api_key_here
```

### インストール

```bash
uv sync
```

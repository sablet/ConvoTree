# Message Intent Analysis - 検証プログラム

メッセージデータから意図（Intent: 「〜したい」という目的）を抽出し、時系列・意味的類似度・因果関係で関連性を分析する処理フローの検証。

## 目的

散在するメッセージから意図を自動抽出し、時間的・意味的に関連する意図を発見し、因果関係を明らかにする。

## 処理フロー

### 1. データエクスポート（Firestore → JSON）

**目的**: Firestoreからメッセージデータを取得してローカルJSONに保存

**実行方法**:
```bash
# 実装予定
```

**出力先**:
- `data/messages_export.json` - エクスポートされたメッセージデータ

**データ構造**:
```json
{
  "message_id": "msg_00123",
  "full_path": "Inbox -> プロジェクト名",
  "start_time": "2025-11-10T10:00:00",
  "content": "メッセージ本文"
}
```

---

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

### 4. Gemini APIによる意図抽出（+ 後処理）

**目的**: 生成されたプロンプトをGemini APIに投げて意図オブジェクトを抽出し、メタデータを補完

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
- `output/intent_extraction/processed/cluster_XX_processed.json` - **後処理済みJSON（最終成果物）**
- `output/intent_extraction/raw_responses/cluster_XX_raw_response.txt` - 生レスポンス（オプション）
- `output/intent_extraction/intent_review.html` - レビュー用HTML

**処理の流れ**:

#### 4-1. 前処理（preprocess）
`preprocess_extract_json_from_response()`
- Gemini APIレスポンスから```json```ブロックを抽出
- JSONパースして意図オブジェクトのリストに変換

#### 4-2. API呼び出し（call）
`call_gemini_api_with_postprocess()`
- Gemini 2.5 Flashに意図抽出プロンプトを送信
- レスポンスをキャッシュ（`output/.cache/intent_extraction/`）

#### 4-3. 後処理（postprocess）
`postprocess_enrich_and_save_intents()`
- `cluster_id`を追加
- `source_message_ids`から以下を集約:
  - `source_full_paths`: ユニークなチャネルパスのリスト
  - `min_start_timestamp`: 全メッセージの最小タイムスタンプ
- 処理済みJSONとして保存

**最終的な意図オブジェクト構造**:
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

### 5. 次のステップ（予定）

- [ ] Firestoreへの保存スクリプト作成
- [ ] 意図間の時系列・意味的関連性分析
- [ ] 因果関係の推定

---

## ディレクトリ構造

```
data_api/
├── templates/
│   └── intent_extraction_prompt.md       # 意図抽出プロンプトテンプレート
├── scripts/
│   └── generate_intent_extraction_prompts.py  # 意図抽出メインスクリプト
├── output/
│   ├── .cache/
│   │   └── intent_extraction/            # Gemini APIレスポンスキャッシュ
│   ├── message_clustering/
│   │   ├── clustered_messages.csv        # クラスタリング結果
│   │   └── cluster_visualization.html    # クラスタ可視化
│   └── intent_extraction/
│       ├── cluster_XX_prompt.md          # 各クラスタのプロンプト
│       ├── index.html                    # プロンプト一覧
│       ├── intent_review.html            # 意図抽出結果レビュー
│       ├── generation_summary.json       # サマリー情報
│       ├── processed/
│       │   └── cluster_XX_processed.json # 【最終成果物】後処理済みJSON
│       └── raw_responses/                # （オプション）生レスポンス
│           └── cluster_XX_raw_response.txt
└── data/
    └── messages_export.json              # エクスポートされたメッセージ
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

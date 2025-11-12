# Goal Network 構築方針

## 1. 問題の定義

### 現状

- **総Intent数**: 606個
- **クラスタ数**: 16個（cluster_00 〜 cluster_15）
- **分布**: 7個（最小）〜 90個（最大）/ クラスタ

### 課題

既存の Pipeline 5 では：
- **クラスタ内の関係**は抽出可能
- **類似度 Top-k（k=3）による候補選定**でクラスタをまたぐことも可能
- しかし、**類似度が低いクラスタ間の関係は見逃される**

```
cluster_00: 14個  ━━━━━  部分ネットワーク
cluster_01: 61個  ━━━━━  部分ネットワーク
cluster_02: 14個  ━━━━━  部分ネットワーク
...
cluster_15: 13個  ━━━━━  部分ネットワーク

課題：これらをどう結合するか？
```

---

## 2. クラスタ間結合の手法

### 手法1: 全ペア評価（Brute Force）

**概要**:
```
全Intent × 全Intent のペアをLLMで評価
606 × 605 / 2 = 183,315 ペア
```

**メリット**: 完全・漏れなし
**デメリット**: コスト・時間が膨大（非現実的）

---

### 手法2: クラスタ代表Intent による階層的結合

**概要**:
```
Step 1: 各クラスタから代表Intent（1-3個）を選出
Step 2: 代表Intent間で全ペア評価（16クラスタ × 3代表 = 48個 → 1,128ペア）
Step 3: 関係が見つかったクラスタ間で詳細評価
```

**代表Intentの選び方**:
- **重心法**: クラスタの重心Embeddingに最も近いIntent
- **ハブ法**: クラスタ内で最も多くの関係を持つIntent（次数中心性）
- **優先度法**: status="todo" または "doing" の実行優先度が高いIntent

**メリット**: コスト削減、クラスタ間の大まかな関係を把握
**デメリット**: 代表に選ばれなかったIntent間の関係を見逃す可能性

**実装例**:
```python
# Step 1: 各クラスタの代表を選出
representatives = []
for cluster_id in clusters:
    intents = get_intents_by_cluster(cluster_id)
    # 重心との類似度でTop-1を選ぶ
    centroid = compute_centroid_embedding(intents)
    rep = find_most_similar_to_centroid(intents, centroid)
    representatives.append(rep)

# Step 2: 代表間で全ペア評価
cross_cluster_relations = []
for i, rep_i in enumerate(representatives):
    for j, rep_j in enumerate(representatives[i+1:]):
        relations = extract_relations([rep_i], [rep_j])
        if relations:
            cross_cluster_relations.append((i, j))

# Step 3: 関係があったクラスタ間で詳細評価
for (i, j) in cross_cluster_relations:
    intents_i = get_intents_by_cluster(i)
    intents_j = get_intents_by_cluster(j)
    detailed_relations = extract_relations_with_similarity(intents_i, intents_j, k=5)
```

---

### 手法3: Embedding類似度による段階的フィルタリング

**概要**:
```
Step 1: 全ペアでEmbedding類似度を計算（高速・安価）
Step 2: 類似度が閾値以上のペアのみLLMで評価
```

**類似度計算のコスト**:
- 606 × 605 / 2 = 183,315 ペア
- コサイン類似度計算は高速（NumPy行列演算でミリ秒単位）

**閾値の設定例**:
| 類似度範囲 | 評価方針 |
|-----------|---------|
| > 0.75 | 強い関連性 → 必ずLLM評価 |
| 0.60-0.75 | 中程度 → クラスタ間のみLLM評価 |
| < 0.60 | 関連性低い → スキップ |

**メリット**: コストと網羅性のバランス良い
**デメリット**: 類似度が低くても関係がある場合を見逃す

**実装例**:
```python
import numpy as np

# Step 1: 全ペアの類似度を計算（NumPy高速化）
embeddings = np.array([intent.embedding for intent in intents])  # (606, 768)
similarity_matrix = cosine_similarity_matrix(embeddings)  # (606, 606)

# Step 2: 閾値以上のペアを抽出
threshold = 0.75
candidates = []
for i in range(len(intents)):
    for j in range(i+1, len(intents)):
        if similarity_matrix[i, j] > threshold:
            # クラスタ間のペアのみ
            if intents[i].cluster_id != intents[j].cluster_id:
                candidates.append((intents[i], intents[j]))

# candidates が例えば3,000ペアに絞られる
# → LLMで評価（バッチ処理で効率化）
```

---

### 手法4: ブリッジIntent の特定

**概要**:
```
クラスタ間で高類似度のIntentペア（ブリッジ）を特定し、
そのIntentを経由してクラスタを接続
```

**ブリッジIntentの定義**:
- 異なるクラスタに属する
- 類似度が非常に高い（例: > 0.8）
- これらのIntent間の関係を優先的に評価

**メリット**: 自然なクラスタ間接続を発見
**デメリット**: ブリッジがない孤立クラスタが残る可能性

**実装例**:
```python
# 異なるクラスタ間で類似度Top-50のペアを抽出
bridges = []
for i, intent_i in enumerate(intents):
    for j, intent_j in enumerate(intents[i+1:], start=i+1):
        if intent_i.cluster_id != intent_j.cluster_id:
            sim = cosine_similarity(intent_i.embedding, intent_j.embedding)
            bridges.append((intent_i, intent_j, sim))

# 類似度でソートしてTop-50を評価
bridges.sort(key=lambda x: x[2], reverse=True)
top_bridges = bridges[:50]

# LLMで評価
for (intent_i, intent_j, sim) in top_bridges:
    relations = extract_relations([intent_i], [intent_j])
```

---

### 手法5: 2段階抽出（クラスタ内 → クラスタ間）

**概要**:
```
Step 1: クラスタ内の関係を抽出（既存Pipeline 5）
Step 2: クラスタ内で「ハブIntent」を特定
Step 3: ハブIntent間でクラスタ間関係を評価
```

**ハブIntentの定義**:
- クラスタ内で多くの関係を持つIntent（次数中心性が高い）
- 抽象度が高い（より一般的な目標）
- status="idea"（根本的な問題意識）

**メリット**: クラスタ内構造を活用、効率的
**デメリット**: ハブの定義に依存、見逃しの可能性

**実装例**:
```python
# Step 1: クラスタ内関係抽出（既存）
within_cluster_relations = []
for cluster_id in clusters:
    relations = run_pipeline5(intents, cluster_id)
    within_cluster_relations.extend(relations)

# Step 2: ハブIntentを特定（入次数+出次数が多い）
hub_intents = []
for cluster_id in clusters:
    intents_in_cluster = get_intents_by_cluster(cluster_id)
    degree = {intent.id: 0 for intent in intents_in_cluster}

    for rel in within_cluster_relations:
        if rel.source_intent_id in degree:
            degree[rel.source_intent_id] += 1
        if rel.target_intent_id in degree:
            degree[rel.target_intent_id] += 1

    # Top-3をハブとする
    sorted_intents = sorted(intents_in_cluster, key=lambda x: degree[x.id], reverse=True)
    hub_intents.extend(sorted_intents[:3])

# Step 3: ハブ間でクラスタ間関係評価
cross_cluster_relations = extract_relations(hub_intents, hub_intents)
```

---

## 3. 推奨アプローチ（3フェーズ戦略）

実用的には**手法3（類似度フィルタリング）+ 手法2（代表Intent）の組み合わせ**が最も効果的。

### フェーズ1: 高類似度ペアの直接結合

**目的**: 明確に関連するクラスタ間のIntentを確実に接続

**処理**:
```python
# 類似度 > 0.75 のクラスタ間ペアを直接LLM評価
high_similarity_pairs = []
for i in range(len(intents)):
    for j in range(i+1, len(intents)):
        if intents[i].cluster_id != intents[j].cluster_id:
            sim = cosine_similarity(intents[i].embedding, intents[j].embedding)
            if sim > 0.75:
                high_similarity_pairs.append((intents[i], intents[j]))

# LLMで関係抽出
phase1_relations = extract_relations_batch(high_similarity_pairs)
```

**期待される結果**: 推定 1,000-2,000 ペアの評価、精度重視

---

### フェーズ2: 代表Intentによる補完

**目的**: フェーズ1で繋がらなかったクラスタ間を補完

**処理**:
```python
# まだ繋がっていないクラスタペアを特定
connected_clusters = set()
for rel in phase1_relations:
    cluster_i = get_cluster_id(rel.source_intent_id)
    cluster_j = get_cluster_id(rel.target_intent_id)
    connected_clusters.add((cluster_i, cluster_j))

# 未接続クラスタの代表Intentを選出
unconnected_clusters = find_unconnected_clusters(connected_clusters)
representatives = []
for cluster_id in unconnected_clusters:
    intents = get_intents_by_cluster(cluster_id)
    rep = select_representative(intents)  # 重心法またはハブ法
    representatives.append(rep)

# 代表間で全ペア評価
phase2_relations = extract_relations(representatives, representatives)
```

**期待される結果**: 推定 500-1,000 ペアの評価、網羅性重視

---

### フェーズ3: 検証と詳細化

**目的**: フェーズ2で関係が見つかったクラスタ間を詳細評価

**処理**:
```python
# フェーズ2で関係が見つかったクラスタペアを詳細評価
newly_connected = []
for rel in phase2_relations:
    cluster_i = get_cluster_id(rel.source_intent_id)
    cluster_j = get_cluster_id(rel.target_intent_id)
    newly_connected.append((cluster_i, cluster_j))

# 各ペアについて、類似度Top-5で絞ってLLM評価
phase3_relations = []
for (cluster_i, cluster_j) in newly_connected:
    intents_i = get_intents_by_cluster(cluster_i)
    intents_j = get_intents_by_cluster(cluster_j)

    # 類似度Top-5で候補を絞る
    candidates = []
    for intent_i in intents_i:
        for intent_j in intents_j:
            sim = cosine_similarity(intent_i.embedding, intent_j.embedding)
            candidates.append((intent_i, intent_j, sim))

    candidates.sort(key=lambda x: x[2], reverse=True)
    top_candidates = [(i, j) for i, j, _ in candidates[:5]]

    # LLMで評価
    relations = extract_relations_batch(top_candidates)
    phase3_relations.extend(relations)
```

**期待される結果**: 推定 500-1,000 ペアの評価、精度向上

---

## 4. コスト試算

| 手法 | LLM評価ペア数 | 推定コスト | 網羅性 | 備考 |
|------|--------------|-----------|--------|------|
| 全ペア | 183,315 | 非現実的 | 100% | 参考値 |
| 代表Intent（3個/クラスタ） | 1,128 | 低 | 70% | 見逃しあり |
| 類似度>0.7 | ~5,000 | 中 | 90% | バランス良好 |
| ブリッジTop-50 | 50 | 極低 | 60% | 孤立クラスタあり |
| **推奨3フェーズ** | **~3,000** | **中** | **85-90%** | 最適解 |

### Gemini API コスト概算（2025年11月時点）

| モデル | 用途 | 単価 | 推定コスト（3,000ペア） |
|-------|------|------|----------------------|
| gemini-2.5-flash | Why/How関係抽出 | $0.30/1M tokens（入力）<br>$1.20/1M tokens（出力） | 入力: ~450K tokens → $0.14<br>出力: ~150K tokens → $0.18<br>**合計: $0.32** |

**計算根拠**:
- 1ペアあたりプロンプト: ~150 tokens
- 1ペアあたりレスポンス: ~50 tokens
- 3,000 ペア × 150 tokens = 450K tokens（入力）
- 3,000 ペア × 50 tokens = 150K tokens（出力）

---

## 5. 実装ステップ

### Step 1: 全IntentのEmbedding生成

```bash
# Pipeline 3 を実行して全Intentにembeddingを付与
python app/pipelines/pipeline3.py --input output/intent_extraction/processed/
```

### Step 2: クラスタ内関係抽出

```bash
# 既存Pipeline 5 で各クラスタ内の関係を抽出
for cluster_id in 00 01 02 ... 15; do
    python app/pipelines/pipeline5.py --cluster $cluster_id
done
```

### Step 3: フェーズ1実行（高類似度ペア）

```python
# scripts/goal_network_phase1.py を作成
python scripts/goal_network_phase1.py \
    --input output/intents_embedded.json \
    --threshold 0.75 \
    --output output/phase1_relations.json
```

### Step 4: フェーズ2実行（代表Intent）

```python
# scripts/goal_network_phase2.py を作成
python scripts/goal_network_phase2.py \
    --input output/intents_embedded.json \
    --phase1-relations output/phase1_relations.json \
    --output output/phase2_relations.json
```

### Step 5: フェーズ3実行（詳細化）

```python
# scripts/goal_network_phase3.py を作成
python scripts/goal_network_phase3.py \
    --input output/intents_embedded.json \
    --phase2-relations output/phase2_relations.json \
    --output output/phase3_relations.json
```

### Step 6: 結合と出力

```python
# scripts/merge_goal_network.py を作成
python scripts/merge_goal_network.py \
    --within-cluster output/within_cluster_relations.json \
    --cross-cluster output/phase1_relations.json output/phase2_relations.json output/phase3_relations.json \
    --output output/goal_network.json
```

---

## 6. 出力形式

### goal_network.json の構造

```json
{
  "nodes": [
    {
      "id": "cluster_00_intent_01",
      "summary": "旅行中の思考時間を確保したい",
      "cluster_id": 0,
      "status": "idea",
      "degree": 3
    }
  ],
  "edges": [
    {
      "source": "cluster_00_intent_02",
      "target": "cluster_00_intent_01",
      "type": "why",
      "within_cluster": false
    }
  ],
  "clusters": [
    {
      "id": 0,
      "intent_count": 14,
      "internal_edges": 8,
      "cross_cluster_edges": 5
    }
  ],
  "statistics": {
    "total_intents": 606,
    "total_relations": 450,
    "within_cluster_relations": 350,
    "cross_cluster_relations": 100,
    "isolated_intents": 12
  }
}
```

---

## 7. 今後の拡張

### 7-1. 動的優先度調整

時間経過や status 変更に応じて、Intent 間の関係の重み付けを動的に調整

### 7-2. インクリメンタル更新

新しいIntentが追加された際に、全体を再計算せず差分のみ評価

### 7-3. ユーザーフィードバック統合

LLM が判定した関係をユーザーが承認/拒否し、精度を向上

### 7-4. 可視化ダッシュボード

D3.js や Cytoscape.js でインタラクティブなgoal networkを表示

---

## 参考文献

- `doc/architecture.md` - 全体アーキテクチャ
- `app/pipelines/pipeline5.py` - Why/How関係抽出の既存実装
- `app/pipelines/pipeline3.py` - Embedding生成の既存実装

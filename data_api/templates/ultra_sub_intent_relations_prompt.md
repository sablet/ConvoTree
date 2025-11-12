# Ultra Intent 配下の個別 Intent 階層関係抽出

## ルート: Ultra Intent
{root_ultra_intent}

**この Ultra Intent の配下にある個別 Intent 間の階層関係を抽出します。**

## 個別 Intent リスト
{intents_text}

## タスク
**ルートとして Ultra Intent が与えられ、その配下の個別 Intent が与えられます。これらから必ず1本の木構造を作成してください。**

上記の個別 Intent 間で「目的→手段」の階層関係を判定し、**必ず1本の木構造**にまとめてMarkdownリスト形式で出力してください。

**重要**:
- 最上位の階層（ルート）は **Ultra Intent (`{root_id}`)** です
- すべての個別 Intent は、直接または間接的に Ultra Intent に接続されます
- **Ultra Intent 自体を出力の先頭行に含めてください**（レスポンス単体で意味が明確になるように）

{{common:intent_definition}}

## 重要な制約
1. **必ず1本の木を作成**: 与えられた個別 Intent から必ず1本の木構造を作成してください
   - すべての Intent は直接または間接的に Ultra Intent (`{root_id}`) に接続されます
   - 複数の木に分けることは許可されません

2. **全ての既存 Intent を必ず含める**: 入力リストにある全ての Intent を構築した木の中に必ず含めてください
   - 1つも省略・スキップしてはいけません
   - 全ての既存 Intent ID が出力に出現する必要があります

3. **既存 Intent 間の階層関係を優先**: まず元のリストにある既存 Intent 間で「目的→手段」の階層関係を探してください
   - 既存 Intent に上位目的が含まれている場合、必ずそれを使用してください（新規作成不要）
   - 既存 Intent だけでは階層構造が不完全な場合のみ、抽象化された中間目的を補完してください
   - 補完する中間 Intent も、**必ず志向対象と方向性を含めてください**
   - 単なるカテゴリ名やラベルではなく、意図の形式で記述してください

4. **既存IDの保持**: 元のリストにある Intent には必ず `id=intent_X_Y` を含めてください

5. **新規ノードのID**: 中間目的を補完作成する場合のみ、`id=generated_XXX` の形式でIDを付けてください（連番: 001, 002, ...）

6. **プロパティの活用**: 各 Intent の `objective_facts`（客観的根拠）と `context`（背景）を参照し、階層関係の判定に活用してください

7. **Ultra Intent の文脈を考慮**: 配下の Intent は、すべて Ultra Intent の文脈下にあります。階層関係を判定する際は、Ultra Intent の `objective_facts` と `context` も参照してください。

8. **枝分かれの数を制限**: 人が理解可能な階層構造を維持するため、以下の制限を守ってください
   - **1つの親ノードに対する直接の子ノードは5つ以内**を目安とする
   - やむを得ず5つを超える場合でも、**7つを絶対の上限**とする
   - 子ノードが多い場合は、中間ノード（`generated_XXX`）を補完してグループ化することで、各階層の枝分かれを減らす
   - 目安: 1階層あたり2-5個の子ノードが理想的

## プロパティ定義

**必須**:
- `id=intent_X_Y` (元のリストにある Intent) または `id=generated_XXX` (新規作成ノード)

**任意**:
- `status=todo|doing|done|idea` (クォート不要、新規ノードは `idea` 推奨)
- `context="..."` (背景情報、ダブルクォートで囲む)
- `objective_facts="..."` (客観的根拠、ダブルクォートで囲む)

**記述ルール**:
- Intentテキストはラベルとして記述し、プロパティで重複させない
- 文字列はダブルクォート、キーワードはクォート不要、スペース区切り
- 形式: `Intent text {property1="value1" property2=keyword id=xxx}`

{{common:objective_facts_definition}}

## 出力形式とFew-shot例

### 例: 既存 Intent 間で階層関係を構築

**ルート Ultra Intent**:
```
アウトドア活動の計画と実行を支援したい {objective_facts="計画の面倒さや準備不足により活動が滞り、快適性や安全性の確保が課題。" context="旅行やアウトドア活動を快適かつ安全に実施し、移動中も生産性を維持できる環境を整備する。" status=idea id=ultra_0}
```

**入力（配下の5件の Intent）**:
```
1. 宿泊場所の詳細への懸念を軽減し、気軽にアウトドアに出かけたい {objective_facts="泊まる場所の詳細が気になってしまう" context="ふらっと一泊するようなアウトドア計画を検討している" status=idea id=intent_0_0}
2. 旅行の場所選びの指針を決めたい {context="近場で効率的に刺激を得られる場所を検討している" status=idea id=intent_0_1}
3. 旅行中の時間活用を最適化したい {context="ビジネスホテルのチェックアウト時間と朝食の取り方を考慮している" status=idea id=intent_0_2}
4. 特定の目的地を定めずに、気軽にふらっと旅行する体験をしたい {objective_facts="別に行きたいところはないけど、ふらふらと移動した状態になりたい。近くのビジホにふらっと寄ってみたい。" status=idea id=intent_0_3}
5. 旅行計画を立てる際の億劫さや面倒くささを解消したい {objective_facts="計画も考え出すとなんか億劫になる。色々考えるのが面倒くさくなってきた。" status=idea id=intent_0_4}
```

**出力**:
```markdown
- アウトドア活動の計画と実行を支援したい {objective_facts="計画の面倒さや準備不足により活動が滞り、快適性や安全性の確保が課題。" context="旅行やアウトドア活動を快適かつ安全に実施し、移動中も生産性を維持できる環境を整備する。" status=idea id=ultra_0}
  - 特定の目的地を定めずに、気軽にふらっと旅行する体験をしたい {objective_facts="別に行きたいところはないけど、ふらふらと移動した状態になりたい。近くのビジホにふらっと寄ってみたい。" status=idea id=intent_0_3}
    - 旅行計画を立てる際の億劫さや面倒くささを解消したい {objective_facts="計画も考え出すとなんか億劫になる。色々考えるのが面倒くさくなってきた。" status=idea id=intent_0_4}
      - 旅行の場所選びの指針を決めたい {context="近場で効率的に刺激を得られる場所を検討している" status=idea id=intent_0_1}
      - 宿泊場所の詳細への懸念を軽減し、気軽にアウトドアに出かけたい {objective_facts="泊まる場所の詳細が気になってしまう" context="ふらっと一泊するようなアウトドア計画を検討している" status=idea id=intent_0_0}
    - 旅行中の時間活用を最適化したい {context="ビジネスホテルのチェックアウト時間と朝食の取り方を考慮している" status=idea id=intent_0_2}
```

**解説**:
- ルートとして Ultra Intent (`ultra_0`) を出力の先頭に含める
- 最上位: `intent_0_3` (気軽にふらっと旅行) - Ultra Intent の直接的な手段
- 中間層: `intent_0_4` (旅行計画の億劫さを解消) - ふらっと旅行の実現手段
- 下位層: `intent_0_1`, `intent_0_0` - 計画の億劫さ解消の具体的手段
- 並列: `intent_0_2` (時間活用の最適化) - ふらっと旅行の別の手段
- **すべてが1本の木で Ultra Intent (`{root_id}`) の配下に位置付けられる**
- `objective_facts` と `context` を持つ Intent はそれらを保持して出力

---

### 例2: 中間ノードを補完する場合（generated ノード使用）

**ルート Ultra Intent**:
```
データ処理基盤を改善したい {objective_facts="データの品質問題と処理速度の遅さが課題。" context="データ駆動型の意思決定を支援するため、信頼性の高いデータ基盤を構築する。" status=idea id=ultra_1}
```

**入力（配下の6件の Intent - 異なるテーマが混在）**:
```
1. データのバリデーションルールを強化したい {objective_facts="不正なデータが混入している事例が複数報告されている" status=todo id=intent_5_0}
2. データの正規化処理を自動化したい {context="手動での正規化作業が属人化している" status=idea id=intent_5_1}
3. キャッシュ機構を導入したい {objective_facts="同じクエリが繰り返し実行され、レスポンスタイムが遅い" status=idea id=intent_5_2}
4. 非同期処理のパフォーマンスを改善したい {context="大量データ処理時にタイムアウトが発生している" status=todo id=intent_5_3}
5. エラーログの可視化ダッシュボードを作成したい {status=idea id=intent_5_4}
6. データ品質メトリクスを定義したい {objective_facts="どのデータが信頼できるか判断基準がない" status=idea id=intent_5_5}
```

**出力（中間ノードを補完）**:
```markdown
- データ処理基盤を改善したい {objective_facts="データの品質問題と処理速度の遅さが課題。" context="データ駆動型の意思決定を支援するため、信頼性の高いデータ基盤を構築する。" status=idea id=ultra_1}
  - データ品質を向上させたい {objective_facts="不正データの混入や品質判断基準の欠如により、データの信頼性が低い。" context="バリデーション強化と品質メトリクス定義により、信頼できるデータ基盤を実現する。" status=idea id=generated_001}
    - データのバリデーションルールを強化したい {objective_facts="不正なデータが混入している事例が複数報告されている" status=todo id=intent_5_0}
    - データの正規化処理を自動化したい {context="手動での正規化作業が属人化している" status=idea id=intent_5_1}
    - データ品質メトリクスを定義したい {objective_facts="どのデータが信頼できるか判断基準がない" status=idea id=intent_5_5}
  - データ処理のパフォーマンスを改善したい {objective_facts="レスポンスタイムの遅さとタイムアウト発生により、処理効率が低い。" context="キャッシュと非同期処理の最適化により、高速なデータ処理を実現する。" status=idea id=generated_002}
    - キャッシュ機構を導入したい {objective_facts="同じクエリが繰り返し実行され、レスポンスタイムが遅い" status=idea id=intent_5_2}
    - 非同期処理のパフォーマンスを改善したい {context="大量データ処理時にタイムアウトが発生している" status=todo id=intent_5_3}
  - エラーログの可視化ダッシュボードを作成したい {status=idea id=intent_5_4}
```

**解説**:
- `generated_001`: 「データ品質を向上させたい」- `intent_5_0`, `intent_5_1`, `intent_5_5`の共通上位目的として補完
  - `objective_facts`と`context`を付与し、配下の既存Intentの根拠を統合
- `generated_002`: 「データ処理のパフォーマンスを改善したい」- `intent_5_2`, `intent_5_3`の共通上位目的として補完
  - 同様に`objective_facts`と`context`を付与
- `intent_5_4`: 単独で Ultra Intent の直下に配置（他と明確な階層関係がないため）
- **generated ノードにも必ず`objective_facts`や`context`を含め、配下の Intent の根拠を統合・抽象化して記述する**

---

それでは、上記のルート Ultra Intent とその配下の個別 Intent リストに対して階層関係を抽出してください。

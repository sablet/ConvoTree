# メッセージ群からのGoal抽出

# タスク概要

以下のメッセージ群を分析し、そこに含まれる目的・行動・対象・条件・課題をGoalItemスキーマに従って抽出してください。

# GoalItemスキーマ定義

各GoalItemオブジェクトは以下の構造を持つ:

```json
{{
  "subject": "客観的な主題。何の話か、どの対象についてかを表す。theme とセットで読むことで意味が完結する。",
  "theme": "主観的なテーマ・観点・問題意識。subject とセットで初めて意味を持つ。",
  "action": [
    "実際に行う行動1",
    "実際に行う行動2"
  ],
  "target": [
    "行動が作用する対象1",
    {{
      "name": "行動が作用する対象2",
      "outcome": ["Achievement", "Improvement"]
    }}
  ],
  "issue": [
    "達成に影響する課題・障害・依存1",
    "達成に影響する課題・障害・依存2"
  ],
  "conditions": [
    "背景・補足情報・制約・前提1",
    "背景・補足情報・制約・前提2"
  ],
  "abstraction_level": "L1: Life Purpose / 価値観・人生目的 | L2: Theme / 大目標・テーマ | L3: Project / プロジェクト | L4: Subgoal / サブゴール | L5: Task / タスク",
  "domain": [
    "Business: ビジネス/経営",
    "Engineering: 技術/開発"
  ],
  "meta": {{
    "任意のメタ情報": "文字列、数値、真偽値"
  }},
  "source_message_ids": ["msg_00123", "msg_00456"]
}}
```

## フィールド詳細説明

### subject と theme
- **subject**: 客観的な主題（例: "開発ツール", "タスク管理システム"）
- **theme**: 主観的なテーマ・観点（例: "効率化", "改善", "学習"）
- この2つをセットで読むことで、Goalの意味が完結します

### action (配列)
- 実際に行う行動のリスト
- 空配列も許可（行動が明示されていない場合）

### target (配列)
- 行動が作用する対象
- 文字列 または 詳細オブジェクト `{{"name": "対象名", "outcome": ["Achievement", ...]}}`
- outcomeは以下から選択可能: Achievement, Improvement, Learning, Efficiency, Maintenance, ProblemSolving, Emotional
- 空配列も許可

### issue (配列)
- 達成に影響する課題・障害・依存のリスト
- 空配列も許可

### conditions (配列)
- 背景・補足情報・制約・前提など（issue とは別に管理）
- 空配列も許可

### abstraction_level (文字列)
- 目的の抽象度レイヤー
- 以下から1つ選択:
  - `L1: Life Purpose / 価値観・人生目的`
  - `L2: Theme / 大目標・テーマ`
  - `L3: Project / プロジェクト`
  - `L4: Subgoal / サブゴール`
  - `L5: Task / タスク`

### domain (配列)
- 目的が属するドメイン（領域）、複数選択可
- 以下から選択:
  - `Business: ビジネス/経営`
  - `Marketing: マーケティング/営業`
  - `Engineering: 技術/開発`
  - `Operations: 生産性/オペレーション`
  - `HR: 人材/組織/コミュニケーション`
  - `Health: 健康/運動`
  - `Household: 家事/生活管理`
  - `Relationships: 人間関係`
  - `Finance: お金/資産`
  - `Hobby: 趣味/娯楽`
  - `Learning: 学習/知識`
  - `Meta: メタ推論/思考プロセス/価値観`
- 空配列も許可

### meta (オブジェクト)
- 任意のメタ情報（文字列、数値、真偽値）
- 空オブジェクト `{{}}` も許可

### source_message_ids (配列、必須)
- 元になったメッセージIDのリスト
- 必ず1つ以上のmsg_idを含めること

## 抽出ルール

1. メッセージ群から共通する目的・行動・対象を見つけ出す
2. 複数のgoalが存在する場合は、それぞれを個別に抽出する
3. goalが明確でない雑談・日常会話は抽出不要
4. source_message_idsにはgoalの根拠となったメッセージIDを必ず含める
5. 関連する複数のメッセージから1つのgoalを抽出することも、1つのメッセージから複数のgoalを抽出することもある
6. msg_id (msg_xxx) を source_message_ids 以外で含めてはならない
7. subject/theme は空文字列も許可（明示されていない場合）
8. action/target/issue/conditions/domain は空配列も許可
9. abstraction_level は必ず L1〜L5 のいずれかを選択

## メッセージ一覧

{messages}

---

# 抽出タスク

上記のメッセージ群を分析し、GoalItemオブジェクトのリストをJSON形式で抽出してください。

## 出力時の注意事項

**禁止事項**: 推測・補足・説明文・コメントを出力に含めない。出力は純粋なJSON配列のみ。

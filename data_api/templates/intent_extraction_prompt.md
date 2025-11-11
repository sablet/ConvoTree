# タスク

以下のメッセージ群を分析し、そこに含まれる意図・目的・タスクをJSON形式で抽出してください。


# 意図オブジェクトのスキーマ

各意図オブジェクトは以下の構造を持つ:

```json
{{
  "description": "意図の全体的な説明（必須）",
  "target": "何を対象としているか、志向対象（必須）",
  "status": "idea | todo | doing | done（必須）",
  "motivation": "なぜそうしたいのか、動機（任意、あれば記載）",
  "objective_facts": "根拠となった客観的な事実のみ（任意、あれば記載）",
  "source_message_ids": ["msg_00123", "msg_00456"]  // 元になったメッセージIDのリスト（必須）
}}
```

## statusの定義

- **idea**: まだ具体的な行動には至っていないアイデア・構想段階
- **todo**: やるべきこととして認識されているが、まだ着手していない
- **doing**: 現在進行中、作業中
- **done**: 完了している

## 抽出ルール

1. メッセージ群から共通する意図・目的を見つけ出す
2. 複数の意図が存在する場合は、それぞれを個別に抽出する
3. 意図が明確でない雑談・日常会話は抽出不要
4. source_message_idsには意図の根拠となったメッセージIDを必ず含める
5. objective_factsには、意図の根拠となる具体的な事実・状況を記載
6. 関連する複数のメッセージから1つの意図を抽出することも、1つのメッセージから複数の意図を抽出することもある


## メッセージ一覧

{messages}

---

# 出力形式

```json
{{
  "cluster_id": {cluster_id},
  "intents": [
    {{
      "description": "意図の全体的な説明",
      "target": "志向対象",
      "status": "idea",
      "motivation": "動機（任意）",
      "objective_facts": "根拠となる事実（任意）",
      "source_message_ids": ["msg_xxxxx", "msg_yyyyy"]
    }}
  ]
}}
```

## 出力ルール

- JSONのみ出力（説明文は不要）
- source_message_idsには実在するmessage_idのみを指定
- JSON構文を厳密に守る

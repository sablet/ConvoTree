# プロンプトテンプレート

## 概要

このディレクトリには、意図抽出などに使用するプロンプトテンプレートが格納されています。

## ファイル一覧

### intent_extraction_prompt.md

クラスタごとの意図抽出プロンプトのテンプレート。

**使用される変数:**
- `{cluster_id}` - クラスタID（数値）
- `{message_count}` - メッセージ数
- `{period_start}` - 期間の開始日（YYYY-MM-DD形式）
- `{period_end}` - 期間の終了日（YYYY-MM-DD形式）
- `{messages}` - メッセージ一覧（フォーマット済みテキスト）

**テンプレート編集時の注意:**
- JSON例内の `{` と `}` は `{{` と `}}` にエスケープする必要があります
- Pythonの `.format()` メソッドで変数が展開されます

## テンプレートの編集方法

1. テンプレートファイルを直接編集
2. `generate_intent_extraction_prompts.py` を実行して反映確認
3. 必要に応じて `test_intent_extraction_with_gemini.py` でテスト

## 使用例

```bash
# テンプレートを編集
vim templates/intent_extraction_prompt.md

# プロンプトを再生成
python generate_intent_extraction_prompts.py

# 結果を確認
open output/intent_extraction/index.html
```

## テンプレートのカスタマイズ例

### スキーマ定義の変更

意図オブジェクトに新しいフィールドを追加したい場合は、`intent_extraction_prompt.md`の「意図オブジェクトのスキーマ定義」セクションを編集してください。

### 抽出ルールの追加

「抽出ルール」セクションに新しいルールを追加することで、LLMの抽出動作を調整できます。

### 出力形式の変更

「出力形式」セクションでJSON構造を変更できます。

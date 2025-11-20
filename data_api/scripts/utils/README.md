# Message Deduplication Utilities

履歴パーサー（Gemini/ChatGPT/Claude）で共通利用する重複除去ユーティリティ。

## 機能概要

### メッセージフィルタリング・クリーニング

#### 1. メッセージのスキップ判定
**関数**: `should_skip_message()`

短いメッセージや除外コマンドをスキップすべきか判定する。

**パラメータ**:
- `message`: メッセージテキスト
- `min_length`: 最小文字数（デフォルト: 4）
- `excluded_commands`: 除外するコマンドのセット（Claude用）
- `exclude_file_paths`: ファイルパスを除外するか（Claude用）

**使用例**:
```python
from utils.message_deduplication import should_skip_message

# 基本的な使い方（4文字以下をスキップ）
if should_skip_message(message, min_length=5):
    continue

# Claude用（コマンドとファイルパスも除外）
from utils.message_deduplication import DEFAULT_EXCLUDED_COMMANDS
if should_skip_message(message, min_length=7, excluded_commands=DEFAULT_EXCLUDED_COMMANDS, exclude_file_paths=True):
    continue
```

#### 2. アシスタントメッセージのクリーニング
**関数**: `clean_assistant_message()`

アシスタントメッセージから情報量の薄い定型句を除去する。

**パラメータ**:
- `message`: アシスタントのメッセージ
- `prefix_patterns`: 除去するパターンのリスト（Noneの場合はデフォルト）
- `max_iterations`: パターン除去の最大繰り返し回数（デフォルト: 3）

**使用例**:
```python
from utils.message_deduplication import clean_assistant_message

# デフォルトパターンで除去
cleaned = clean_assistant_message(assistant_msg)

# カスタムパターンを指定
custom_patterns = [r"^こんにちは。?\s*", r"^はい[、。]\s*"]
cleaned = clean_assistant_message(assistant_msg, prefix_patterns=custom_patterns)
```

#### 3. メッセージの切り詰め
**関数**: `truncate_message()`

長いメッセージを指定行数に切り詰める。

**パラメータ**:
- `message`: メッセージテキスト
- `max_lines`: 保持する最大行数（デフォルト: 2）

**使用例**:
```python
from utils.message_deduplication import truncate_message

# 3行以上のメッセージを2行 + "..." に切り詰め
truncated = truncate_message(message)
```

### 重複除去

#### 1. タイムスタンプによる重複除去
**関数**: `deduplicate_by_timestamp()`

同じタイムスタンプのメッセージがある場合、最後のもののみを保持する。

**使用例**:
```python
from utils.message_deduplication import deduplicate_by_timestamp

dedup_rows = deduplicate_by_timestamp(rows)
```

### 2. 先頭テキストによる重複除去
**関数**: `deduplicate_by_prefix()`

先頭30文字が完全一致するメッセージがある場合、最新のもののみを保持する。

**使用例**:
```python
from utils.message_deduplication import deduplicate_by_prefix

dedup_rows = deduplicate_by_prefix(rows, prefix_length=30)
```

### 3. セッション内類似メッセージ除去
**関数**: `deduplicate_within_session()`

先頭N文字の類似度（Levenshtein距離）が閾値以上のメッセージを重複とみなし、最新のもののみを保持する。

**パラメータ**:
- `prefix_length`: 比較する先頭文字数（デフォルト: 20）
- `similarity_threshold`: 類似と判定する閾値（デフォルト: 0.7 = 70%）

**使用例**:
```python
from utils.message_deduplication import deduplicate_within_session

# セッション内の類似メッセージを除去
messages = ["[Q] 今回の場合、...", "[Q] 今回の場合、..."]
dedup_messages = deduplicate_within_session(messages, prefix_length=20, similarity_threshold=0.7)
```

### 4. 時間窓によるメッセージ統合（Geminiのみ）
**関数**: `merge_by_time_window()`

N分以内の連続メッセージを1つのセッションに統合する。統合時にセッション内の類似メッセージも自動的に除去される。

**パラメータ**:
- `time_window_minutes`: 統合する時間窓（分、デフォルト: 30）
- `prefix_length`: セッション内重複判定の先頭文字数（デフォルト: 20）
- `similarity_threshold`: セッション内重複判定の閾値（デフォルト: 0.7）

**使用例**:
```python
from utils.message_deduplication import merge_by_time_window

# 30分以内のメッセージを統合
merged_rows = merge_by_time_window(rows, time_window_minutes=30)
```

## 各パーサーでの使用状況

### Geminiパーサー
すべての機能を使用:
1. タイムスタンプ重複除去
2. 先頭テキスト重複除去
3. 時間窓統合（セッション内類似メッセージ除去を含む）

### ChatGPTパーサー
セッション情報があるため、時間窓統合は不要:
1. タイムスタンプ重複除去
2. 先頭テキスト重複除去

### Claudeパーサー
独自の重複削除機能を持つため、共通utilは使用しない:
- `remove_duplicates_from_session()` - セッション内重複削除
- `remove_cross_session_duplicates()` - セッション間重複削除

## 実装の詳細

### Levenshtein距離（編集距離）
2つの文字列を比較し、一方を他方に変換するために必要な最小編集操作（挿入、削除、置換）の回数を計算する。

**類似度の計算**:
```
similarity = 1.0 - (distance / max_length)
```

例:
- "今回の場合、大分類の下の、目的の" と "今回の場合、大分類の下の、活動領域の"
- 先頭20文字の編集距離が6の場合、類似度 = 1 - (6/20) = 0.7 = 70%

### 処理の順序

推奨される処理順序:
1. **タイムスタンプ重複除去** - 完全に同じタイムスタンプの重複を除去
2. **先頭テキスト重複除去** - 先頭が完全一致するメッセージの重複を除去
3. **時間窓統合**（Geminiのみ） - 時間的に近いメッセージを統合し、セッション内の類似メッセージも除去

この順序により、効率的かつ正確に重複を除去できます。

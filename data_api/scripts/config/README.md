# LINE マッピング設定

## 概要

Claude History Parser で生成されるCSVの `full_path` カラムに表示される LINE 名をカスタマイズできます。

## 設定ファイル

**ファイル**: `scripts/config/line_mapping.yaml`

プロジェクトパスから自動生成される `line_id` を、より意味のある階層的な名前にマッピングします。

## マッピング方式

**部分一致マッピング**: `line_id` にパターンが含まれていればマッチします。

### マッチング優先順位

より長い（具体的な）パターンが優先されます。

**例**:
```yaml
line_mapping:
  chat-line_data_api: "Inbox -> タスク開発アプリ -> claude_code -> data_api"
  chat-line: "Inbox -> タスク開発アプリ -> claude_code"
```

- `line_id` が `chat-line_data_api/data_api` の場合:
  - `chat-line_data_api` にマッチ → "Inbox -> タスク開発アプリ -> claude_code -> data_api"
- `line_id` が `chat-line/doc/tickets` の場合:
  - `chat-line` にマッチ → "Inbox -> タスク開発アプリ -> claude_code"

## 設定例

```yaml
line_mapping:
  # より具体的なパターンを先に記述（可読性のため）
  chat-line_data_api: "Inbox -> タスク開発アプリ -> claude_code -> data_api"
  chat-line: "Inbox -> タスク開発アプリ -> claude_code"
  spec2code: "開発ツール -> spec2code"
  trade_pipelines: "トレード -> パイプライン開発"
```

## 使い方

### 1. 設定ファイルを作成

```bash
# サンプルファイルをコピー
cp scripts/config/line_mapping.yaml.example scripts/config/line_mapping.yaml

# 設定を編集
vim scripts/config/line_mapping.yaml
```

### 2. パーサーを実行

```bash
# デフォルト設定（scripts/config/line_mapping.yaml）を使用
uv run python scripts/claude_history_parser.py parse

# Makefileから実行
make parse_claude_history

# カスタム設定ファイルを指定
uv run python scripts/claude_history_parser.py parse \
  --config_path=scripts/config/my_custom_mapping.yaml
```

## line_id の確認方法

マッピング前の `line_id` を確認するには、パーサー実行後に生成される `project_line_mapping.json` を参照してください：

```bash
cat output/claude-history/project_line_mapping.json
```

出力例：
```json
{
  "/Users/your-username/git_dir/chat-line": "chat-line",
  "/Users/your-username/git_dir/chat-line_data_api/data_api": "chat-line_data_api/data_api",
  "/Users/your-username/git_dir/spec2code": "spec2code"
}
```

右側の値（`"chat-line"` など）が設定ファイルで使用する `line_id` です。

## 階層表示

`full_path` は階層表示を想定しているため、` -> ` 区切りで階層を表現できます：

```yaml
line_mapping:
  chat-line: "Inbox -> タスク開発アプリ->claude_code"
  # ↓ CSVでは以下のように出力
  # Inbox -> タスク開発アプリ->claude_code,2025-09-30 19:40,...
```

## 注意事項

- **部分一致**: パターンが `line_id` に含まれていればマッチします
- **優先順位**: より長いパターンが優先されます（自動的にソートされます）
- マッピング設定がない `line_id` は、自動生成された名前がそのまま使用されます
- 設定ファイルが存在しない場合、すべてのプロジェクトが自動生成名で出力されます
- YAML の文法エラーがある場合、警告が表示され、マッピングなしで処理が続行されます

## マッピング設定のコツ

1. **汎用的なパターンと具体的なパターンを組み合わせる**
   ```yaml
   # "chat-line" を含む全てのプロジェクトに適用されるが、
   # "chat-line_data_api" を含むものはより具体的なマッピングが優先される
   chat-line_data_api: "Inbox -> タスク開発アプリ -> claude_code -> data_api"
   chat-line: "Inbox -> タスク開発アプリ -> claude_code"
   ```

2. **プロジェクト群を一括でマッピング**
   ```yaml
   # "trade_pipelines" を含む全てのプロジェクトに適用
   trade_pipelines: "トレード -> パイプライン開発"
   ```

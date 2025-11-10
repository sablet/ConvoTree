# 管理スクリプト

## Neon DB データ管理

### データバックアップ・リストア

**エクスポート（バックアップ）:**
```bash
# 全テーブルをCSVにエクスポート
npm run export:neon
# 出力先: output/db-exports/[タイムスタンプ]/
```

**インポート（リストア）:**
```bash
# 重複レコードはスキップ（デフォルト）
npm run import:neon <ディレクトリパス>

# 既存データを全削除してからインポート
npm run import:neon <ディレクトリパス> --clear

# 例
npm run import:neon output/db-exports/2025-01-01T00-00-00
```

**注意事項:**
- エクスポートには画像データは含まれません（サイズが大きいため）
- インポート時、画像データは既存のものが保持されます
- `--clear` オプション使用時も画像データは保持されます

### データベース接続テスト

```bash
npm run test:db
```

## Firestore データ管理（旧システム）

以下は旧Firestoreベースのシステム用スクリプトです。

### データ構造管理

**整合性チェック（新構造）:**
```bash
# データ整合性の確認
node scripts/check-new-data-integrity.js [conversationId]
```

**データクリーニング（新構造）:**
```bash
# ドライラン（確認のみ）
node scripts/clean-data-integrity-issues.js [conversationId] --dry-run

# 実際にクリーニング実行
node scripts/clean-data-integrity-issues.js [conversationId]
```

**データエクスポート:**
```bash
# Markdownノートとしてエクスポート
node scripts/export-firestore-to-markdown.js [conversationId]
# 出力先: output/reports/conversation-export-*.md
```

### データ移行スクリプト

**旧構造から新構造への移行:**
```bash
# ドライラン
node scripts/migrate-to-new-structure.js --dry-run

# 本番実行（新しい会話IDに移行）
node scripts/migrate-to-new-structure.js --new-conversation-id chat-minimal-conversation-2

# バックアップからリストア
node scripts/restore-from-backup.js [backupDir]
```

詳細: [doc/data-structure-migration.md](../doc/data-structure-migration.md)

### 旧データ構造用スクリプト（非推奨）

以下のスクリプトは旧データ構造専用です。新データ構造では使用しないでください：

- ❌ `check-firestore-integrity.js` - 旧構造の整合性チェック
- ❌ `check-line-message-consistency.js` - 旧構造の整合性チェック
- ❌ `fix-line-message-consistency.js` - 旧構造の修正

**新データ構造では代わりに以下を使用:**
- ✅ `check-new-data-integrity.js`
- ✅ `clean-data-integrity-issues.js`

### 許可リスト管理

既存の `firebase-service-account.json` を使用します（追加設定不要）。

**ユーザーの追加:**
```bash
# 1件追加
node scripts/add-allowed-user.mjs user@example.com

# 複数件同時追加
node scripts/add-allowed-user.mjs user1@example.com user2@example.com user3@example.com
```

**Firestore Rules のデプロイ:**

ユーザー追加後、必ず以下のコマンドで Rules をデプロイしてください:
```bash
firebase deploy --only firestore:rules
```

## セキュリティ

- `firebase-service-account.json` は絶対にコミットしないこと
- `.gitignore` に登録済みです
- `.env.local` は絶対にコミットしないこと（DATABASE_URL等の機密情報を含む）

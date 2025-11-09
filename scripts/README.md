# 管理スクリプト

## データ構造管理

### 新データ構造用スクリプト（推奨）

**整合性チェック:**
```bash
# データ整合性の確認
node scripts/check-new-data-integrity.js [conversationId]
```

**データクリーニング:**
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

## 許可リスト管理

既存の `firebase-service-account.json` を使用します（追加設定不要）。

### ユーザーの追加

```bash
# 1件追加
node scripts/add-allowed-user.mjs user@example.com

# 複数件同時追加
node scripts/add-allowed-user.mjs user1@example.com user2@example.com user3@example.com
```

### Firestore Rules のデプロイ

ユーザー追加後、必ず以下のコマンドで Rules をデプロイしてください:

```bash
firebase deploy --only firestore:rules
```

## セキュリティ

- `firebase-service-account.json` は絶対にコミットしないこと
- `.gitignore` に登録済みです

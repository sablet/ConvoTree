# 管理スクリプト

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

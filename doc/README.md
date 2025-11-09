# Chat Line ドキュメント

Firebase Firestore を使用した分岐型チャットアプリケーションの設定・開発ドキュメント集です。

## 📚 ドキュメント一覧

### 🚀 セットアップガイド
- **[firebase-setup-guide.md](firebase-setup-guide.md)** - Firebase Firestore の完全セットアップ手順
  - CLI インストールから本番デプロイまでの全手順
  - トラブルシューティング情報含む

### 🧪 テスト・開発
- **[firestore-test-component.md](firestore-test-component.md)** - Firestore 接続テストコンポーネント
  - 接続確認用Reactコンポーネントの仕様
  - デバッグ方法とエラー対応

### 🏗️ プロジェクト構造
- **[project-structure.md](project-structure.md)** - プロジェクト全体の構造とファイル説明
  - ディレクトリ構造
  - Firebase設定ファイル詳細
  - Firestoreデータ構造

### 📊 データ構造
- **[data-structure.md](data-structure.md)** - 現在のデータ構造リファレンス
  - Message / Line / Tag の詳細仕様
  - データアクセスパターン
  - ヘルパー関数の使い方
- **[data-structure-migration.md](data-structure-migration.md)** - データ構造移行ガイド
  - 旧構造から新構造への移行手順
  - 移行スクリプトの使い方

### 🔧 アーキテクチャ
- **[repository-pattern-guide.md](repository-pattern-guide.md)** - Repository パターンの実装ガイド
  - データアクセス層の設計
  - IDataSource インターフェース
- **[architecture-enforcement.md](architecture-enforcement.md)** - アーキテクチャ強制ガイド
  - コード品質基準
  - ESLint / SonarJS 設定

### 🔐 機密情報（ローカルのみ）
- **firebase-secrets-template.md** - 実際のプロジェクト設定値
  - ⚠️ このファイルはgitignoreに追加済み
  - プロジェクト固有の設定値を保存
  - チーム内で安全に共有

## 🚀 クイックスタート

### 1. 新規環境セットアップ
```bash
# リポジトリクローン後
git clone <repository>
cd chat-line

# Firebase設定（詳細は firebase-setup-guide.md 参照）
npm install firebase firebase-admin --legacy-peer-deps
firebase login
firebase init

# 環境変数設定（firebase-secrets-template.md 参照）
cp doc/firebase-secrets-template.md.example .env.local
# .env.local を編集

# データインポート
node scripts/import-to-firestore.js

# 開発サーバー起動
npx next dev
```

### 2. 既存環境での作業
```bash
# 依存関係インストール
npm install

# 開発サーバー起動
npx next dev

# Firebase Console でデータ確認
open "https://console.firebase.google.com/project/your-project-id/firestore"
```

## 🔧 開発コマンド

```bash
# 開発サーバー
npx next dev

# ビルドテスト
npx next build

# Firebase デプロイ
firebase deploy

# Firestore ルール適用
firebase deploy --only firestore:rules

# データ再インポート
node scripts/import-to-firestore.js
```

## 📋 チェックリスト

### セットアップ完了確認
- [ ] Firebase プロジェクト作成済み
- [ ] Firestore データベース作成済み（テストモード）
- [ ] `.env.local` 設定済み
- [ ] `firebase-service-account.json` 配置済み
- [ ] データインポート成功
- [ ] http://localhost:3000 でFirestore接続テスト成功

### セキュリティ確認
- [ ] `firebase-service-account.json` がgitignoreに追加済み
- [ ] `doc/firebase-secrets-template.md` がgitignoreに追加済み
- [ ] `.env.local` がgitignoreに追加済み
- [ ] 機密情報がgit履歴に含まれていない

## 🔍 トラブルシューティング

### よくある問題
1. **Firebase接続エラー** → `.env.local` の設定値確認
2. **Permission denied** → Firestoreセキュリティルール確認
3. **React バージョン競合** → `--legacy-peer-deps` フラグ使用
4. **データが表示されない** → インポート状況とconsole.logで確認

### デバッグ方法
- ブラウザ開発者ツールのConsoleタブでFirestore接続ログ確認
- Firebase Console でFirestoreデータ直接確認
- `components/firestore-test.tsx` コンポーネントで接続テスト

## 📖 関連リンク

- [Firebase Console](https://console.firebase.google.com/)
- [Firebase Documentation](https://firebase.google.com/docs)
- [Next.js Documentation](https://nextjs.org/docs)
- [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)

---

**注意**: 機密情報を含むファイルは適切に管理し、公開リポジトリにコミットしないよう注意してください。
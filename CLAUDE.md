# プロジェクト固有設定 - Chat Line

## 開発サーバーの起動

Next.jsの開発サーバーは以下のコマンドで起動します。

```bash
npx next dev
```

**注意:** サーバーを起動する前に、同じポート（デフォルトは3000）で別のプロセスが実行されていないか確認してください。

ポートを確認し、もしプロセスが存在すれば停止する手順は以下の通りです。

```bash
# ポート3000を使用しているプロセスを確認
lsof -i:3000

# プロセスが存在する場合、PIDを指定して停止 (例: PIDが12345の場合)
kill 12345
```

既存のプロセスがないことを確認してから、`npx next dev` を実行してください。

## 開発完了基準

### 必須チェック項目
**CRITICAL**: コード開発を完了する前に、必ず以下のコマンドが警告・エラーなしで通ることを確認してください。

```bash
# 必須: Next.js ビルドチェック
npm run build
```

**重要**: `npm run build` は必ず上記のコマンドそのままで実行してください。`NODE_ENV=development` などの環境変数を付けて実行してはいけません。

### 開発完了の条件
1. **ビルド成功**: `npm run build` がwarning・error無しで完了する
2. **型チェック**: TypeScript型エラーが0件
3. **リントチェック**: ESLintエラーが0件
4. **機能確認**: 実装した機能が正常に動作する

### 開発フロー
1. 機能実装
2. **`npm run build`** 実行 ← **必須**
3. 警告・エラーがある場合は修正
4. 再度ビルドテスト
5. 完了

## プロジェクト構造

### ディレクトリ構成
```
chat-line/
├── app/                # Next.js App Router
├── components/         # React コンポーネント
├── hooks/              # カスタムフック
├── lib/                # ユーティリティ・定数
├── public/             # 静的ファイル
├── data/               # サンプルデータ
├── project.config.mjs  # プロジェクト共通設定（ディレクトリ定義）
└── CLAUDE.md           # プロジェクト設定
```

### プロジェクト共通設定

**重要**: ソースディレクトリの定義は `project.config.mjs` で一元管理されています。

```javascript
// project.config.mjs
export const PROJECT_DIRS = {
  source: ['app', 'components', 'hooks', 'lib'],  // チェック対象
  output: ['out', 'output', '.next', 'node_modules', 'public'],  // 除外
  scripts: ['scripts'],
}
```

この設定は以下で自動的に使用されます:
- `next.config.mjs` - ESLintチェック対象
- `package.json` - jscpdコマンド
- `.eslintignore` - 除外ディレクトリ（手動同期）

**新しいディレクトリを追加する場合**: `project.config.mjs` を更新するだけで、すべての設定に反映されます。

### 主要コンポーネント
- `components/branching-chat-ui.tsx` - メインのチャットUI
- `components/ui/` - 再利用可能なUIコンポーネント

## 技術スタック
- **Next.js 14** (App Router)
- **React 18** (TypeScript)
- **Tailwind CSS** (スタイリング)
- **Lucide React** (アイコン)

## コーディング規約

### TypeScript
- `any` 型の使用禁止 → 適切な型定義を使用
- 全ての関数・コンポーネントに型注釈必須
- `prefer-const` ルールに従う

### React
- 関数コンポーネントのみ使用
- Hooks の dependency array を正しく設定
- `useCallback`, `useMemo` で適切にメモ化

### Next.js
- `<img>` タグ禁止 → `next/image` の `<Image>` コンポーネント使用
- Static generation 優先

### 定数管理
- **ハードコード禁止**: ID・文字列は必ず定数ファイルから参照する
- `lib/constants.ts` - メッセージタイプ、優先度、アプリメタデータ
- `lib/firestore-constants.ts` - Firestoreコレクション名
- `lib/routes.ts` - ルートパス
- `lib/ui-strings.ts` - UI表示文字列(日本語)

### 品質保証
- ESLint ルールに従う
- **開発完了前に必ず `npm run build` でエラー0を確認**

### コード品質メトリクス基準

#### 関数サイズ制限
- **150行以上**: Warning（リファクタリング推奨）
- **300行以上**: Error（必ず分割すること）
- 空行・コメント行は除外してカウント

#### 複雑度制限
- **循環的複雑度（complexity）**: 15以上で Warning
- **認知的複雑度（cognitive-complexity）**: 15以上で Warning
- **ネスト深さ（max-depth）**: 4以上で Warning

#### その他の制限
- **ファイルサイズ**: 500行以上で Warning
- **関数の文の数**: 50以上で Warning
- **関数パラメータ数**: 5以上で Warning
- **コールバックのネスト**: 3以上で Warning
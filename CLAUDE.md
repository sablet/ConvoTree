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

## データキャッシュアーキテクチャ

### 概要

Chat Lineアプリケーションは、**3層のキャッシュアーキテクチャ**を採用しており、高速なページロードとリアルタイムな差分更新を実現しています。

### Stale-While-Revalidate (SWR) パターン

このアプリケーションは、Next.jsのSWRパターンを実装しています：

1. **キャッシュから即座に表示** - IndexedDBに保存されたデータを即座に読み込んで表示
2. **バックグラウンドで再検証** - 並行してサーバーから差分データを取得
3. **UIを更新** - 新しいデータが取得できたら自動的にUIを更新

### 3層キャッシュアーキテクチャ

#### レイヤー1: IndexedDB永続ストレージ

**担当**: `lib/repositories/chat-repository.ts`

- ブラウザのIndexedDBに全データを永続化
- タイムスタンプベースの差分取得（`since` パラメータ）
- データのマージと削除フラグ処理
- 最終取得タイムスタンプの管理

```typescript
// ChatRepository の主要メソッド
async loadChatData(): Promise<LoadChatDataResult>
async createMessage(message): Promise<string>
async updateMessage(id, updates): Promise<void>
async deleteMessage(id): Promise<void>
async clearAllCache(): Promise<void>
```

**重要な挙動**:
- `currentData` - メモリ内の完全なデータセット（常にマージ済み）
- 差分取得時は `since` タイムスタンプ以降のデータのみ取得
- `deleted=true` のメッセージは自動的にフィルタされる
- 全操作後にIndexedDBとタイムスタンプを自動更新

#### レイヤー2: React State管理

**担当**: `hooks/use-chat-data.ts`

- ChatRepositoryから取得したデータをReact stateに変換
- `messages`, `lines`, `tags` の3つの状態を管理
- バックグラウンド再検証時の `onRevalidate` コールバック処理

```typescript
// useChatData が返すデータ
{
  messages: Record<string, Message>,
  lines: Record<string, Line>,
  tags: Record<string, Tag>,
  error: Error | null,
  loadChatData: (clearCache?: boolean) => Promise<void>,
  chatRepository: ChatRepository
}
```

**CRITICAL**: `applyLoadedData` は完全置き換え（マージではない）
- ChatRepositoryが既にマージ済みの完全なデータセットを返すため
- スプレッド演算子でのマージは**使用しない**

```typescript
// ❌ 誤った実装（過去の問題）
setMessages(prev => ({ ...prev, ...chatData.messages }))

// ✅ 正しい実装
setMessages(chatData.messages)
```

#### レイヤー3: タイムライン計算キャッシュ

**担当**: `hooks/use-branch-operations.ts`, `hooks/use-chat-state.ts`

- メッセージのタイムライン（表示順序）を計算してキャッシュ
- フィルタリング済みタイムラインを生成
- `completeTimeline` と `filteredTimeline` を分離管理

**CRITICAL**: Props変更時のキャッシュクリアが必須
- `ChatContainer.tsx` で `messages` または `lines` propsが変更されたら必ず `clearAllCaches()` を呼ぶ
- これを怠るとUIが更新されない（キャッシュが古いまま）

```typescript
// components/chat/ChatContainer.tsx での実装
useEffect(() => {
  chatState.setMessages(messages)
  chatState.clearAllCaches() // ← 必須！
}, [messages])

useEffect(() => {
  chatState.setLines(lines)
  chatState.clearAllCaches() // ← 必須！
}, [lines])
```

### データフロー完全図

```
ページロード
  ↓
[app/page.tsx] loadChatData()
  ↓
[hooks/use-chat-data.ts]
  ↓
[ChatRepository] loadChatData()
  ├→ IndexedDBから即座に復元 → キャッシュデータを返す (fromCache: true)
  └→ バックグラウンドで revalidateInBackground()
      ↓
      サーバーから差分取得 (since タイムスタンプ指定)
      ↓
      既存データとマージ
      ↓
      onRevalidate() コールバック → useChatData が受け取る
      ↓
      applyLoadedData() → React stateを完全置き換え
      ↓
      [ChatContainer] useEffect でprops変更を検知
      ↓
      chatState.clearAllCaches() でタイムラインキャッシュをクリア
      ↓
      タイムライン再計算 → 画面に新データ反映
```

### 差分データ取得の仕組み

**タイムスタンプベースの増分取得**:

1. `getLastFetchTimestamp()` で前回の取得時刻を取得
2. `dataSource.loadChatData(since)` で差分のみ取得
3. 既存データとマージ（`deleted=true` は除外）
4. マージ後のデータから最新タイムスタンプを計算
5. `setLastFetchTimestamp()` で次回の基準点を保存

```typescript
// lib/repositories/chat-repository.ts:200-280
private async loadFromSource(source: DataSource): Promise<LoadChatDataResult> {
  const since = await getLastFetchTimestamp(ChatRepository.CACHE_KEY);

  // since 以降のデータのみ取得（差分取得）
  const fetchedData = await dataSource.loadChatData(since ?? undefined);

  if (this.currentData) {
    // 既存データとマージ
    const mergedMessages = { ...this.currentData.messages, ...fetchedData.messages };

    // deleted=true を除外
    const filteredMessages = {};
    Object.entries(mergedMessages).forEach(([id, msg]) => {
      if (!msg.deleted) {
        filteredMessages[id] = msg;
      }
    });

    mergedData = {
      messages: filteredMessages,
      lines: mergedLinesArray,
      tags: { ...this.currentData.tags, ...fetchedData.tags }
    };
  }

  // 最新タイムスタンプを保存
  const latestTimestamp = this.getLatestTimestamp(mergedData);
  await setLastFetchTimestamp(ChatRepository.CACHE_KEY, latestTimestamp);
}
```

### ページ初期化フロー

**app/page.tsx での正しい実装パターン**:

```typescript
function HomeContent() {
  const [currentLineId, setCurrentLineId] = useState<string>('')
  const { messages, lines, tags, loadChatData } = useChatData({})

  // 1. 初期データロード
  useEffect(() => {
    loadChatData()
  }, [loadChatData])

  // 2. lines が読み込まれたら currentLineId を設定
  useEffect(() => {
    if (Object.keys(lines).length === 0) {
      return  // データ未ロードの場合はスキップ
    }

    // URLパラメータからライン名を取得して設定
    const targetLine = Object.values(lines).find(
      line => line.name === decodedLineName || line.id === decodedLineName
    )

    if (targetLine) {
      setCurrentLineId(targetLine.id)
    }
  }, [lines, searchParams])

  // 3. データが準備できるまでローディング表示
  const isDataReady = Object.keys(lines).length > 0
  if (!isDataReady) {
    return <LoadingScreen />
  }

  // 4. データ準備完了後にChatContainerをレンダリング
  return (
    <ChatContainer
      messages={messages}
      lines={lines}
      tags={tags}
      currentLineId={currentLineId}
      // ...
    />
  )
}
```

**重要ポイント**:
- `loadChatData()` は非同期だが await しない（SWRパターン）
- `lines` の長さで「データ準備完了」を判定
- データ未準備の間はローディング画面を表示
- ChatContainerは必ずデータ準備後にレンダリング

### キャッシュクリアのタイミング

#### 自動キャッシュクリア（必須）

**ChatContainer.tsx**:
```typescript
// Props変更時に必ずキャッシュクリア
useEffect(() => {
  chatState.setMessages(messages)
  chatState.clearAllCaches()  // タイムラインキャッシュをクリア
}, [messages])

useEffect(() => {
  chatState.setLines(lines)
  chatState.clearAllCaches()  // タイムラインキャッシュをクリア
}, [lines])
```

#### 手動キャッシュクリア（任意）

```typescript
// 全キャッシュを完全クリア（IndexedDB + タイムスタンプ）
await chatRepository.clearAllCache()
await loadChatData(true)  // clearCache = true で強制再取得
```

### デバッグ方法

#### コンソールログの読み方

キャッシュフローを追跡するための主要ログ:

```
[ChatRepository] Restored cached data from IndexedDB
→ IndexedDBからキャッシュ復元成功

[ChatRepository] Returning cached data immediately
→ キャッシュを即座に返却（SWRのStale部分）

[ChatRepository] Starting background revalidation
→ バックグラウンド再検証開始（SWRのRevalidate部分）

[ChatRepository] Fetching data since 2024-11-15T01:17:44.000Z
→ 差分取得実行（sinceタイムスタンプ指定）

[ChatRepository] Fetched 1 messages, 0 lines
→ 差分データ取得完了

[useChatData] Background revalidation completed, updating UI
→ バックグラウンド更新完了、UI更新開始

[ChatContainer] Messages prop changed: 1482
→ Propsが変更された（1482件のメッセージ）

[ChatContainer] Lines prop changed: 15
→ Propsが変更された（15本のライン）
```

#### トラブルシューティング

**症状**: データは取得できているがUIに反映されない

**原因と対処**:

1. **ChatContainerのキャッシュクリアが実行されていない**
   - `ChatContainer.tsx` の `useEffect` で `clearAllCaches()` が呼ばれているか確認
   - コンソールに `[ChatContainer] Messages prop changed` が出ているか確認

2. **onRevalidateコールバックが実行されていない**
   - `[useChatData] Background revalidation completed` が出ているか確認
   - `use-chat-data.ts` の `onRevalidate` コールバックが正しく設定されているか確認

3. **データがマージではなく上書きされている**
   - `applyLoadedData` が `setMessages(chatData.messages)` で完全置き換えしているか確認
   - `setMessages(prev => ({ ...prev, ... }))` のようなマージパターンになっていないか確認

4. **ローディング中にChatContainerがレンダリングされている**
   - `isDataReady = Object.keys(lines).length > 0` でガード条件を設定
   - データ未準備時は `<LoadingScreen />` を表示

### ベストプラクティス

1. **キャッシュは階層ごとに責務を分離**
   - IndexedDB層: 永続化とマージ
   - React State層: コンポーネント間のデータ共有
   - Timeline Cache層: 計算結果のメモ化

2. **Props変更時は必ずキャッシュクリア**
   - `ChatContainer` で `messages/lines` props変更時に `clearAllCaches()`

3. **データ完全準備後にレンダリング**
   - `isDataReady` でガード条件を設定
   - 非同期ロード中は `<LoadingScreen />` 表示

4. **完全置き換え、マージではない**
   - `applyLoadedData` は `setMessages(chatData.messages)`
   - ChatRepositoryが完全なデータセットを返すため

5. **デバッグログの活用**
   - 各層で詳細なログを出力
   - タイムスタンプとデータ件数を記録

### 関連ファイル

- `lib/repositories/chat-repository.ts` - IndexedDB層
- `hooks/use-chat-data.ts` - React State層
- `hooks/use-chat-state.ts` - Timeline Cache層
- `hooks/use-branch-operations.ts` - Timeline計算
- `components/chat/ChatContainer.tsx` - Props→State同期
- `app/page.tsx` - ページ初期化
- `lib/data-source/indexed-db-storage.ts` - IndexedDB操作
- `lib/data-source/indexed-db-timestamp-storage.ts` - タイムスタンプ管理
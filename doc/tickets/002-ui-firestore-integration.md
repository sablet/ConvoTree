# Ticket #002: 既存UI のFirestore連携実装

## 概要
既存のTag/TagGroup管理UIをFirestoreと連携させ、サンプルデータから実際のデータベース操作に移行する。

## 目的
- 高品質な既存UIを活用してFirestore連携を実現
- tag-context.tsx の TODO 部分を実装
- データの永続化を実現

## 実装内容

### 1. tag-context.tsx の修正
```typescript
// 修正対象箇所
const addTag = async (tagData: Omit<Tag, "id">) => {
  // TODO: 実際のAPIに保存 ← この部分を実装
}

const updateTag = async (tag: Tag) => {
  // TODO: 実際のAPIに保存 ← この部分を実装
}

const deleteTag = async (tagId: string) => {
  // TODO: 実際のAPIから削除 ← この部分を実装
}
```

### 2. DataSourceManager との統合
- data-source.ts のTag/TagGroup CRUD関数を呼び出し
- 既存のstate管理パターンを維持
- エラーハンドリングの統合

### 3. リアルタイム更新対応
- Firestore リアルタイムリスナーの追加
- 複数ユーザー間でのデータ同期
- 楽観的更新の実装

## 技術要件
- 既存のコンポーネント設計を変更しない
- TypeScript型定義の整合性維持
- エラー状態とローディング状態の一貫性

## 完了条件
- [ ] tag-context.tsx のTODO部分実装
- [ ] Firestore CRUD操作の動作確認
- [ ] エラーハンドリングの統合
- [ ] リアルタイム更新の動作確認
- [ ] 既存UI動作の回帰テスト

## 依存関係
- 前提: TagGroup CRUD Backend（Ticket #003）
- 前提: Message CRUD Backend（Ticket #001） - Tag付与機能用

## 見積り時間
2-3時間

## 備考
- 既存の優秀なUI設計を最大限活用
- 新規UIコンポーネント作成は不要
- データ移行戦略も検討
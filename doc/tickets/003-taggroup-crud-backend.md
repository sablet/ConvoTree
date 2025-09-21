# Ticket #003: TagGroup CRUD Backend Implementation

## 概要
Firestore上でTagGroupエンティティのCRUD操作を実装する。

## 目的
- タググループの作成・更新・削除機能をFirestoreで実現
- Tag作成の前提条件として必要

## 実装内容

### 1. DataSourceManagerクラスの拡張
- `createTagGroup(tagGroup: Omit<TagGroup, 'id'>): Promise<string>`
- `updateTagGroup(id: string, updates: Partial<TagGroup>): Promise<void>`
- `deleteTagGroup(id: string): Promise<void>`
- `reorderTagGroups(orderedIds: string[]): Promise<void>`

### 2. 制約チェック
- TagGroup削除時の関連Tag確認
- 順序（order）の重複チェック
- 名前の重複チェック

### 3. 特殊処理
- TagGroup削除時の関連Tag処理選択
  - 関連Tagも削除
  - 関連TagのgroupIdをnullに設定

## 技術要件
- Firebase Batch処理活用（順序変更時）
- トランザクション処理（削除時の整合性）

## 完了条件
- [ ] createTagGroup関数実装
- [ ] updateTagGroup関数実装
- [ ] deleteTagGroup関数実装
- [ ] reorderTagGroups関数実装
- [ ] 関連Tag処理実装
- [ ] エラーハンドリング実装

## 依存関係
- 前提: Firestore基本機能
- 後続: Tag CRUD Backend（Ticket #004）

## 見積り時間
2-3時間

## 備考
- orderフィールドの管理が重要
- Tag削除戦略はUI側で選択可能にする
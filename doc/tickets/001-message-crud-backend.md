# Ticket #001: Message CRUD Backend Implementation

## 概要
Firestore上でMessageエンティティのCRUD操作（Create, Update, Delete）を実装する。

## 目的
- メッセージの作成・更新・削除機能をFirestoreで実現
- 他のエンティティ（Branch, Tag）の基盤となる

## 実装内容

### 1. DataSourceManagerクラスの拡張
- `createMessage(message: Omit<Message, 'id'>): Promise<string>`
- `updateMessage(id: string, updates: Partial<Message>): Promise<void>`
- `deleteMessage(id: string): Promise<void>`

### 2. エラーハンドリング
- Firestoreエラーの適切な処理
- 存在しないメッセージIDの場合のエラー
- 権限エラーの処理

### 3. バリデーション
- 必須フィールドのチェック
- データ型の検証
- 関連性チェック（lineId存在確認等）

## 技術要件
- Firebase v9 modular SDK使用
- TypeScript型安全性確保
- エラーログ出力

## 完了条件
- [ ] createMessage関数実装
- [ ] updateMessage関数実装
- [ ] deleteMessage関数実装
- [ ] エラーハンドリング実装
- [ ] 型定義更新
- [ ] コンソールログ出力確認

## 依存関係
- 前提: Firestore読み取り機能（実装済み）
- 後続: Message CRUD UI実装（Ticket #002）

## 見積り時間
2-3時間

## 備考
- フロントエンド実装は別チケット（#002）で対応
- Lineとの整合性チェックは後続のBranch CRUD実装時に強化
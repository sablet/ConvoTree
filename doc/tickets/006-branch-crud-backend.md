# Ticket #006: Branch CRUD Backend Implementation

## 概要
最も複雑なBranch（Line, BranchPoint）のCRUD操作をFirestoreで実装する。

## 目的
- Line（会話の流れ）の作成・更新・削除
- BranchPoint（分岐点）の管理
- メッセージ間の連結関係の維持

## 実装内容

### 1. Line CRUD操作
```typescript
- createLine(line: Omit<Line, 'id'>): Promise<string>
- updateLine(id: string, updates: Partial<Line>): Promise<void>
- deleteLine(id: string): Promise<void>
```

### 2. BranchPoint CRUD操作
```typescript
- createBranchPoint(messageId: string): Promise<void>
- addLineToBranchPoint(messageId: string, lineId: string): Promise<void>
- removeLineFromBranchPoint(messageId: string, lineId: string): Promise<void>
- deleteBranchPoint(messageId: string): Promise<void>
```

### 3. メッセージ連結管理
```typescript
- linkMessages(prevMessageId: string, nextMessageId: string): Promise<void>
- unlinkMessages(messageId: string): Promise<void>
- moveMessageToLine(messageId: string, targetLineId: string, position?: number): Promise<void>
```

### 4. 複雑な制約処理
- Line削除時のメッセージ処理
- BranchPoint削除時のLine再配置
- メッセージ移動時の連結関係更新
- 循環参照の防止

## 技術要件
- Firestore Transaction使用（整合性保証）
- Batch処理での複数ドキュメント更新
- 複雑な制約チェック

## 完了条件
- [ ] Line CRUD実装
- [ ] BranchPoint CRUD実装
- [ ] メッセージ連結管理実装
- [ ] 制約チェック実装
- [ ] トランザクション処理実装
- [ ] エラーハンドリング強化

## 依存関係
- 前提: Message CRUD（Ticket #001）
- 後続: Branch CRUD Frontend（Ticket #007）

## 見積り時間
6-8時間

## 備考
- 最も複雑な実装
- データ整合性が最重要
- 十分なテストが必要
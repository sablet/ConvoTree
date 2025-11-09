# データ構造リファレンス

このドキュメントでは、Chat Lineアプリケーションの現在のデータ構造を説明します。

## 概要

Chat Lineは、メッセージとラインを階層的に管理するチャットアプリケーションです。データ構造は以下の3つのコレクションで構成されています：

- **Messages**: 個々のメッセージデータ
- **Lines**: メッセージを分類するライン（スレッド）
- **Tags / TagGroups**: メッセージのタグ付け（オプション）

## データモデル

### Message（メッセージ）

各メッセージは以下のフィールドを持ちます：

```typescript
interface Message {
  id: string                    // メッセージID（自動生成）
  lineId: string                // 所属するラインのID
  content: string               // メッセージ本文
  timestamp: Date               // 作成日時（順序決定に使用）
  type?: MessageType            // メッセージタイプ（'text', 'task', 'session'等）
  metadata?: Record<string, unknown>  // タイプ固有のメタデータ
  images?: string[]             // 画像URLの配列
  tagIds?: string[]             // 関連付けられたタグIDの配列
  deleted?: boolean             // 削除フラグ
  created_at: Timestamp         // Firestore作成タイムスタンプ
  updated_at: Timestamp         // Firestore更新タイムスタンプ
}
```

**重要なポイント:**

- **順序管理**: メッセージの順序は `timestamp` フィールドで決定されます
- **ライン参照**: `lineId` で所属するラインを参照します（必須）
- **タイプ**: `type` により異なる表示・動作が可能（デフォルト: 'text'）

### Line（ライン）

各ラインは以下のフィールドを持ちます：

```typescript
interface Line {
  id: string                    // ラインID（自動生成）
  name: string                  // ライン名（表示用）
  parent_line_id: string | null // 親ラインのID（null = ルートライン）
  created_at: Timestamp         // Firestore作成タイムスタンプ
  updated_at: Timestamp         // Firestore更新タイムスタンプ
}
```

**重要なポイント:**

- **階層構造**: `parent_line_id` により親子関係を表現します
- **ルートライン**: `parent_line_id` が `null` のラインがルートラインです
- **動的メッセージ取得**: メッセージは `Message.lineId` から動的に取得します

### Tag（タグ）

```typescript
interface Tag {
  id: string
  name: string
  color: string
  groupId?: string              // 所属するタググループのID
  created_at: Timestamp
  updated_at: Timestamp
}
```

### TagGroup（タググループ）

```typescript
interface TagGroup {
  id: string
  name: string
  order: number                 // 表示順序
  created_at: Timestamp
  updated_at: Timestamp
}
```

## データアクセスパターン

### メッセージの取得

特定のラインのメッセージを取得する場合：

```typescript
// Firestore クエリ
const messagesRef = collection(db, 'conversations', conversationId, 'messages');
const q = query(messagesRef, where('lineId', '==', targetLineId));
const snapshot = await getDocs(q);

// メモリ上でのフィルタリング（全データ取得済みの場合）
const lineMessages = Object.values(messages)
  .filter(msg => msg.lineId === lineId)
  .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
```

### ライン階層の取得

親ラインをたどる場合：

```typescript
function getLineAncestry(lineId: string, lines: Line[]): string[] {
  const line = lines.find(l => l.id === lineId);
  if (!line || !line.parent_line_id) {
    return [];
  }

  const parentAncestry = getLineAncestry(line.parent_line_id, lines);
  return [...parentAncestry, line.parent_line_id];
}
```

子ラインを取得する場合：

```typescript
function getChildLines(parentLineId: string, lines: Line[]): Line[] {
  return lines.filter(l => l.parent_line_id === parentLineId);
}
```

## ヘルパー関数

プロジェクトには便利なヘルパー関数が用意されています（`lib/data-helpers.ts`）：

```typescript
// ライン内のメッセージを取得（タイムスタンプ順ソート済み）
getLineMessages(messages: Record<string, Message>, lineId: string): Message[]

// ライン内のメッセージ数を取得
getLineMessageCount(messages: Record<string, Message>, lineId: string): number

// 子ラインを取得
getChildLines(lines: Line[], parentLineId: string): Line[]

// ルートラインを取得
getRootLines(lines: Line[]): Line[]
```

## Firestore コレクション構造

```
conversations/
  └─ {conversationId}/
      ├─ messages/
      │   └─ {messageId}
      ├─ lines/
      │   └─ {lineId}
      ├─ tags/
      │   └─ {tagId}
      └─ tagGroups/
          └─ {tagGroupId}
```

## データ整合性

以下のルールが保証されている必要があります：

1. **Message.lineId**: 参照先の Line が存在すること
2. **Line.parent_line_id**: 参照先の Line が存在すること（null は除く）
3. **循環参照**: Line の親子関係に循環がないこと
4. **タイムスタンプ**: すべての Message に有効な timestamp が存在すること

整合性チェックスクリプト: `scripts/check-new-data-integrity.js`

## 旧データ構造との違い

以前のデータ構造からの主な変更点：

| 項目 | 旧構造 | 新構造 |
|------|--------|--------|
| メッセージ順序 | `prevInLine`/`nextInLine` (双方向連結リスト) | `timestamp` (タイムスタンプソート) |
| ライン内メッセージ | `Line.messageIds[]` (配列) | `Message.lineId` で逆参照 |
| ライン階層 | `BranchPoint` コレクション | `Line.parent_line_id` (親参照) |
| 分岐管理 | `branchFromMessageId` | 廃止（parent_line_idで代替） |

詳細な移行手順は [data-structure-migration.md](./data-structure-migration.md) を参照してください。

## 関連ドキュメント

- [データ構造移行ガイド](./data-structure-migration.md) - 旧構造から新構造への移行手順
- [Repository パターンガイド](./repository-pattern-guide.md) - データアクセス層の実装
- [プロジェクト構造](./project-structure.md) - 全体的なアーキテクチャ

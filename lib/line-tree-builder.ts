import type { Line } from '@/lib/types'

export interface LineTreeNode {
  line: Line
  depth: number
  children: LineTreeNode[]
  isLastChild: boolean
  parentChain: boolean[] // 各深さレベルで親が最後の子かどうか
}

/**
 * Build a tree structure from lines based on parent_line_id relationships
 * Returns a flat array of nodes with depth information for rendering
 */
export function buildLineTree(
  lines: Record<string, Line>,
  _currentLineId?: string
): LineTreeNode[] {
  const lineArray = Object.values(lines)

  // currentLineId の除外処理を削除（UIで disabled にして表示する）
  const filteredLines = lineArray

  // ルートライン（parent_line_id が null）を見つける
  const rootLines = filteredLines.filter(line => !line.parent_line_id)

  // 親IDから子ラインへのマッピングを構築
  const childrenMap = new Map<string, Line[]>()
  filteredLines.forEach(line => {
    if (line.parent_line_id) {
      const existing = childrenMap.get(line.parent_line_id) || []
      childrenMap.set(line.parent_line_id, [...existing, line])
    }
  })

  const result: LineTreeNode[] = []
  const visited = new Set<string>()

  /**
   * Recursively build tree nodes
   */
  function buildNodes(
    line: Line,
    depth: number,
    parentChain: boolean[],
    isLastChild: boolean
  ): LineTreeNode {
    // 循環参照チェック: 既に訪問したラインの場合は処理をスキップ
    if (visited.has(line.id)) {
      console.error(`🔴 Circular reference detected in line tree: ${line.id}`)
      return {
        line,
        depth,
        children: [],
        isLastChild,
        parentChain: [...parentChain]
      }
    }

    visited.add(line.id)

    // このラインの子ラインを探す（親ラインIDで検索）
    const children = childrenMap.get(line.id) || []

    // 作成日時でソート
    const sortedChildren = [...children].sort((a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )

    // 子ノードを再帰的に構築
    const childNodes = sortedChildren.map((child, index) => {
      const isLast = index === sortedChildren.length - 1
      return buildNodes(child, depth + 1, [...parentChain, isLastChild], isLast)
    })

    const node: LineTreeNode = {
      line,
      depth,
      children: childNodes,
      isLastChild,
      parentChain: [...parentChain]
    }

    return node
  }

  // ルートラインをソートして処理
  const sortedRoots = [...rootLines].sort((a, b) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  sortedRoots.forEach((root, index) => {
    const isLast = index === sortedRoots.length - 1
    const node = buildNodes(root, 0, [], isLast)
    result.push(node)
  })

  return result
}

/**
 * Generate tree prefix characters for display
 * Returns string like "├─ " or "│  ├─ "
 * Uses Unicode box-drawing characters for cleaner display
 */
export function getTreePrefix(node: LineTreeNode): string {
  const { depth, isLastChild, parentChain } = node

  if (depth === 0) {
    return ''
  }

  let prefix = ''

  // 親の階層を表示
  for (let i = 0; i < depth - 1; i++) {
    // 最後の子の場合は空白、それ以外は縦線
    prefix += parentChain[i] ? '   ' : '│  '
  }

  // 現在のノードの接続文字
  prefix += isLastChild ? '└─ ' : '├─ '

  return prefix
}

import type { Line } from '@/lib/types'

export interface LineTreeNode {
  line: Line
  depth: number
  children: LineTreeNode[]
  isLastChild: boolean
  parentChain: boolean[] // 各深さレベルで親が最後の子かどうか
}

/**
 * Build a tree structure from lines based on branchFromMessageId relationships
 * Returns a flat array of nodes with depth information for rendering
 */
export function buildLineTree(
  lines: Record<string, Line>,
  currentLineId?: string
): LineTreeNode[] {
  const lineArray = Object.values(lines)

  // messageToLineMap はすべてのラインを対象に構築
  const messageToLineMap = new Map<string, string>()
  lineArray.forEach(line => {
    line.messageIds.forEach(msgId => {
      messageToLineMap.set(msgId, line.id)
    })
  })

  // currentLineIdが指定されている場合は除外
  const filteredLines = currentLineId
    ? lineArray.filter(line => line.id !== currentLineId)
    : lineArray

  // ルートライン（branchFromMessageIdがない）を見つける
  const rootLines = filteredLines.filter(line => !line.branchFromMessageId)

  const childrenMap = new Map<string, Line[]>()
  filteredLines.forEach(line => {
    if (line.branchFromMessageId) {
      const parentLineId = messageToLineMap.get(line.branchFromMessageId)
      if (parentLineId) {
        const existing = childrenMap.get(parentLineId) || []
        childrenMap.set(parentLineId, [...existing, line])
      }
    }
  })

  const result: LineTreeNode[] = []

  /**
   * Recursively build tree nodes
   */
  function buildNodes(
    line: Line,
    depth: number,
    parentChain: boolean[],
    isLastChild: boolean
  ): void {
    const node: LineTreeNode = {
      line,
      depth,
      children: [],
      isLastChild,
      parentChain: [...parentChain]
    }

    result.push(node)

    // このラインの子ラインを探す（親ラインIDで検索）
    const children = childrenMap.get(line.id) || []

    // 作成日時でソート
    const sortedChildren = [...children].sort((a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )

    sortedChildren.forEach((child, index) => {
      const isLast = index === sortedChildren.length - 1
      buildNodes(child, depth + 1, [...parentChain, isLastChild], isLast)
    })
  }

  // ルートラインをソートして処理
  const sortedRoots = [...rootLines].sort((a, b) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  sortedRoots.forEach((root, index) => {
    const isLast = index === sortedRoots.length - 1
    buildNodes(root, 0, [], isLast)
  })

  // rootLines が空でも、childrenMap のトップレベル（currentLineIdの子）を処理
  if (sortedRoots.length === 0 && currentLineId) {
    const topLevelChildren = childrenMap.get(currentLineId) || []
    const sortedTopLevelChildren = [...topLevelChildren].sort((a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
    sortedTopLevelChildren.forEach((child, index) => {
      const isLast = index === sortedTopLevelChildren.length - 1
      buildNodes(child, 0, [], isLast)
    })
  }

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

import { Message, Line } from "@/lib/types"
import { MAIN_LINE_ID } from "@/lib/constants"

export interface BranchNode {
  line: Line
  children: BranchNode[]
  depth: number
  messageCount: number
}

export class BranchTreeBuilder {
  /**
   * ツリー構造を構築し、深さ優先でフラットリストに変換
   */
  static buildTree(
    messages: Record<string, Message>,
    lines: Line[]
  ): BranchNode[] {
    const nodes: Record<string, BranchNode> = {}
    const roots: BranchNode[] = []

    // 1. すべてのラインをノードとして初期化
    lines.forEach(line => {
      nodes[line.id] = {
        line,
        children: [],
        depth: 0, // 走査中に深度を計算
        messageCount: line.messageIds.length,
      }
    })

    // 2. 親子関係を構築してツリーを形成
    lines.forEach(line => {
      const node = nodes[line.id]
      // 分岐元のメッセージIDがない場合はルートノードとする
      if (!line.branchFromMessageId) {
        roots.push(node)
        return
      }

      const branchFromMessage = messages[line.branchFromMessageId]
      if (branchFromMessage) {
        const parentLineId = branchFromMessage.lineId
        const parentNode = nodes[parentLineId]
        if (parentNode) {
          // 親ノードの子として追加
          parentNode.children.push(node)
        }
      } else {
        // 親メッセージが見つからない場合もルートとして扱う
        roots.push(node)
      }
    })

    // 'main'ラインを常に最初に表示
    roots.sort((a, b) => {
      if (a.line.id === MAIN_LINE_ID) return -1
      if (b.line.id === MAIN_LINE_ID) return 1
      return new Date(a.line.created_at).getTime() - new Date(b.line.created_at).getTime()
    })

    // 兄弟ノード間を作成日時でソートして表示順を安定させる
    Object.values(nodes).forEach(node => {
      node.children.sort((a, b) => new Date(a.line.created_at).getTime() - new Date(b.line.created_at).getTime())
    })

    // 3. 深さ優先探索でツリーをフラットなリストに変換
    const flattened: BranchNode[] = []
    const traverse = (node: BranchNode, depth: number) => {
      node.depth = depth
      flattened.push(node)
      node.children.forEach(child => traverse(child, depth + 1))
    }

    roots.forEach(root => traverse(root, 0))

    return flattened
  }

  /**
   * 特定のノードをツリーから検索
   */
  static findNodeById(tree: BranchNode[], lineId: string): BranchNode | null {
    for (const node of tree) {
      if (node.line.id === lineId) {
        return node
      }
    }
    return null
  }

  /**
   * ルートから特定ノードまでのパスを取得
   */
  static getPathToNode(tree: BranchNode[], lineId: string): BranchNode[] {
    const path: BranchNode[] = []

    const findPath = (nodes: BranchNode[], targetId: string, currentPath: BranchNode[]): boolean => {
      for (const node of nodes) {
        const newPath = [...currentPath, node]

        if (node.line.id === targetId) {
          path.push(...newPath)
          return true
        }

        if (findPath(node.children, targetId, newPath)) {
          return true
        }
      }
      return false
    }

    // ルートノードから検索開始
    const roots = tree.filter(node => node.depth === 0)
    findPath(roots, lineId, [])

    return path
  }
}

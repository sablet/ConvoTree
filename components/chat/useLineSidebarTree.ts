import { useMemo } from "react"
import type { Line } from "@/lib/types"
import { buildLineTree, type LineTreeNode } from "@/lib/line-tree-builder"
import { MAIN_LINE_ID } from "@/lib/constants"
import type { DeleteOption } from "./LineSidebarDeleteLineForm"

interface ParentOption {
  id: string
  label: string
  disabled: boolean
}

interface UseLineTreeDataResult {
  treeNodes: LineTreeNode[]
  parentOptions: ParentOption[]
  deleteOptions: DeleteOption[]
}

export function useLineTreeData(lines: Record<string, Line>): UseLineTreeDataResult {
  const treeNodes = useMemo(() => buildLineTree(lines, undefined), [lines])

  const parentOptions = useMemo<ParentOption[]>(() => {
    const options: ParentOption[] = []

    const traverse = (nodes: LineTreeNode[]) => {
      nodes.forEach(node => {
        const indentation = node.depth > 0 ? `${"\u00A0\u00A0".repeat(node.depth)}└ ` : ""
        options.push({
          id: node.line.id,
          label: `${indentation}${node.line.name}`,
          disabled: node.line.messageIds.length === 0
        })

        if (node.children && node.children.length > 0) {
          traverse(node.children)
        }
      })
    }

    traverse(treeNodes)
    return options
  }, [treeNodes])

  const deleteOptions = useMemo<DeleteOption[]>(() => {
    const options: DeleteOption[] = []

    const traverse = (nodes: LineTreeNode[]) => {
      nodes.forEach(node => {
        const indentation = node.depth > 0 ? `${"\u00A0\u00A0".repeat(node.depth)}└ ` : ""
        const messageSuffix = node.line.messageIds.length > 0 ? ` (${node.line.messageIds.length} msgs)` : ""
        const hasChildren = Boolean(node.children && node.children.length > 0)

        options.push({
          id: node.line.id,
          label: `${indentation}${node.line.name}${messageSuffix}`,
          disabled: node.line.id === MAIN_LINE_ID || hasChildren,
          messageCount: node.line.messageIds.length,
          hasChildren
        })

        if (node.children && node.children.length > 0) {
          traverse(node.children)
        }
      })
    }

    traverse(treeNodes)
    return options
  }, [treeNodes])

  return { treeNodes, parentOptions, deleteOptions }
}



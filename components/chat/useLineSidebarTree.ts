import { useMemo } from "react"
import type { Line, Message } from "@/lib/types"
import { buildLineTree, type LineTreeNode } from "@/lib/line-tree-builder"
import { MAIN_LINE_ID } from "@/lib/constants"
import type { DeleteOption } from "./LineSidebarDeleteLineForm"
import { getLineMessageCount } from "@/lib/data-helpers"

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

export function useLineTreeData(lines: Record<string, Line>, messages: Record<string, Message>): UseLineTreeDataResult {
  const treeNodes = useMemo(() => buildLineTree(lines, undefined), [lines])

  const parentOptions = useMemo<ParentOption[]>(() => {
    const options: ParentOption[] = []

    const traverse = (nodes: LineTreeNode[]) => {
      nodes.forEach(node => {
        const indentation = node.depth > 0 ? `${"\u00A0\u00A0".repeat(node.depth)}└ ` : ""
        const messageCount = getLineMessageCount(messages, node.line.id)
        options.push({
          id: node.line.id,
          label: `${indentation}${node.line.name}`,
          disabled: messageCount === 0
        })

        if (node.children && node.children.length > 0) {
          traverse(node.children)
        }
      })
    }

    traverse(treeNodes)
    return options
  }, [treeNodes, messages])

  const deleteOptions = useMemo<DeleteOption[]>(() => {
    const options: DeleteOption[] = []

    const traverse = (nodes: LineTreeNode[]) => {
      nodes.forEach(node => {
        const indentation = node.depth > 0 ? `${"\u00A0\u00A0".repeat(node.depth)}└ ` : ""
        const messageCount = getLineMessageCount(messages, node.line.id)
        const messageSuffix = messageCount > 0 ? ` (${messageCount} msgs)` : ""
        const hasChildren = Boolean(node.children && node.children.length > 0)

        options.push({
          id: node.line.id,
          label: `${indentation}${node.line.name}${messageSuffix}`,
          disabled: node.line.id === MAIN_LINE_ID || hasChildren,
          messageCount,
          hasChildren
        })

        if (node.children && node.children.length > 0) {
          traverse(node.children)
        }
      })
    }

    traverse(treeNodes)
    return options
  }, [treeNodes, messages])

  return { treeNodes, parentOptions, deleteOptions }
}



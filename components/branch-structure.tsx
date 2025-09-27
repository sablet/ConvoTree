"use client"

import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  GitBranch,
  Edit3,
  BarChart3,
  MessageSquare,
  Clock,
  X,
  Plus,
  Circle,
  Dot
} from "lucide-react"
import { Message, Line, Tag, BranchPoint, TagGroup } from "@/lib/types"
import { formatRelativeTime } from "@/lib/utils/date"

interface BranchStructureProps {
  messages: Record<string, Message>
  lines: Line[]
  branchPoints: Record<string, BranchPoint>
  tags: Record<string, Tag>
  tagGroups: Record<string, TagGroup>
  currentLineId: string
  onLineSwitch: (lineId: string) => void
  onLineEdit: (lineId: string, updates: Partial<Line>) => void
  onViewChange?: (view: 'chat' | 'management' | 'branches') => void
}

interface BranchNode {
  line: Line
  children: BranchNode[]
  depth: number
  messageCount: number
}

export function BranchStructure({
  messages,
  lines,
  branchPoints,
  tags,
  tagGroups,
  currentLineId,
  onLineSwitch,
  onLineEdit,
  onViewChange
}: BranchStructureProps) {
  const [editingLineId, setEditingLineId] = useState<string | null>(null)
  const [editData, setEditData] = useState<{
    name: string
    tagIds: string[]
    availableTags: string[]
  }>({
    name: "",
    tagIds: [],
    availableTags: []
  })
  const [showStatistics, setShowStatistics] = useState(false)
  const [sortByTag, setSortByTag] = useState<string | null>(null)

  // タググループごとのタグ一覧を生成
  const tagsByGroup = useMemo(() => {
    const grouped: Record<string, string[]> = {}

    Object.values(tagGroups).forEach(group => {
      grouped[group.name] = []
    })

    Object.values(tags).forEach(tag => {
      if (tag.groupId && tagGroups[tag.groupId]) {
        const groupName = tagGroups[tag.groupId].name
        if (!grouped[groupName]) {
          grouped[groupName] = []
        }
        grouped[groupName].push(tag.name)
      }
    })

    return grouped
  }, [tags, tagGroups])

  // ツリー構造を構築し、深さ優先でフラットリストに変換
  const allBranches = useMemo(() => {
    const nodes: Record<string, BranchNode> = {};
    const roots: BranchNode[] = [];

    // 1. すべてのラインをノードとして初期化
    lines.forEach(line => {
      nodes[line.id] = {
        line,
        children: [],
        depth: 0, // 走査中に深度を計算
        messageCount: line.messageIds.length,
      };
    });

    // 2. 親子関係を構築してツリーを形成
    lines.forEach(line => {
      const node = nodes[line.id];
      // 分岐元のメッセージIDがない場合はルートノードとする
      if (!line.branchFromMessageId) {
        roots.push(node);
        return;
      }
      
      const branchFromMessage = messages[line.branchFromMessageId];
      if (branchFromMessage) {
        const parentLineId = branchFromMessage.lineId;
        const parentNode = nodes[parentLineId];
        if (parentNode) {
          // 親ノードの子として追加
          parentNode.children.push(node);
        }
      } else {
        // 親メッセージが見つからない場合もルートとして扱う
        roots.push(node);
      }
    });

    // 'main'ラインを常に最初に表示
    roots.sort((a, b) => {
      if (a.line.id === 'main') return -1;
      if (b.line.id === 'main') return 1;
      return new Date(a.line.created_at).getTime() - new Date(b.line.created_at).getTime();
    });

    // 兄弟ノード間を作成日時でソートして表示順を安定させる
    Object.values(nodes).forEach(node => {
      node.children.sort((a, b) => new Date(a.line.created_at).getTime() - new Date(b.line.created_at).getTime());
    });

    // 3. 深さ優先探索でツリーをフラットなリストに変換
    const flattened: BranchNode[] = [];
    const traverse = (node: BranchNode, depth: number) => {
      node.depth = depth;
      flattened.push(node);
      node.children.forEach(child => traverse(child, depth + 1));
    };

    roots.forEach(root => traverse(root, 0));

    // タグによるソート機能
    if (sortByTag) {
      return flattened.filter(node => {
        const line = node.line;
        if (!line.tagIds || line.tagIds.length === 0) return false;
        return line.tagIds.some(tagId => {
          const tag = tags[tagId];
          return tag && tag.name === sortByTag;
        });
      });
    }

    return flattened;
  }, [lines, messages, sortByTag, tags]);

  // 統計データを計算
  const statistics = useMemo(() => {
    const totalLines = lines.length
    const totalMessages = Object.keys(messages).length
    const totalBranches = Object.keys(branchPoints).length

    const linesByDepth: Record<number, number> = {}
    const messagesByLine: Record<string, number> = {}

    allBranches.forEach(node => {
      linesByDepth[node.depth] = (linesByDepth[node.depth] || 0) + 1
      messagesByLine[node.line.id] = node.messageCount
    })

    const maxDepth = Math.max(...Object.keys(linesByDepth).map(Number), 0)
    const avgMessagesPerLine = totalMessages / totalLines || 0

    return {
      totalLines,
      totalMessages,
      totalBranches,
      maxDepth,
      avgMessagesPerLine,
      linesByDepth,
      messagesByLine
    }
  }, [allBranches, lines, messages, branchPoints])


  const handleEditStart = (line: Line) => {
    // 利用可能なタグ = 全てのタグ - 現在のラインに既に割り当てられているタグ
    const currentTagIds = line.tagIds || []
    const availableTags = Object.keys(tags).filter(tagId => !currentTagIds.includes(tagId))

    setEditData({
      name: line.name,
      tagIds: [...currentTagIds],
      availableTags
    })
    setEditingLineId(line.id)
  }

  const handleEditSave = () => {
    if (editingLineId) {
      onLineEdit(editingLineId, {
        name: editData.name,
        tagIds: editData.tagIds,
        updated_at: new Date().toISOString()
      })
      setEditingLineId(null)
    }
  }


  const handleAddExistingTag = (tagId: string) => {
    setEditData(prev => ({
      ...prev,
      tagIds: [...prev.tagIds, tagId],
      availableTags: prev.availableTags.filter(id => id !== tagId)
    }))
  }

  const handleRemoveTag = (tagId: string) => {
    setEditData(prev => ({
      ...prev,
      tagIds: prev.tagIds.filter(id => id !== tagId),
      availableTags: [...prev.availableTags, tagId]
    }))
  }



  const handleLineClick = (line: Line, event: React.MouseEvent) => {
    // 編集中の場合は何もしない
    if (editingLineId === line.id) {
      return
    }

    // 編集ボタンやフォーム要素がクリックされた場合は何もしない
    if ((event.target as HTMLElement).closest('button') ||
        (event.target as HTMLElement).closest('input') ||
        (event.target as HTMLElement).tagName.toLowerCase() === 'input') {
      return
    }

    // ラインを切り替えてチャット画面に遷移
    onLineSwitch(line.id)
    onViewChange?.('chat')
  }

  const renderBranchItem = (node: BranchNode): React.ReactNode => {
    const { line, depth, messageCount } = node
    const isActive = line.id === currentLineId
    const relativeTime = formatRelativeTime(line.updated_at, line.created_at)
    const isEditing = editingLineId === line.id

    return (
      <div key={line.id} className="w-full">
        {/* ライン表示 - 一行にまとめた表示 */}
        <div
          className={`flex items-center gap-3 p-3 rounded-lg border transition-all duration-200 cursor-pointer ${
            isActive
              ? 'border-blue-500 bg-blue-50 shadow-sm'
              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
          }`}
          style={{
            marginLeft: depth > 0 ? `${depth * 16}px` : '0px',
            paddingLeft: depth > 0 ? '12px' : '12px'
          }}
          onClick={(e) => handleLineClick(line, e)}
        >
          {/* 階層構造のインジケーター */}
          <div className="flex items-center flex-shrink-0">
            {depth > 0 && (
              <div className="flex items-center">
                {/* 階層線の表示 */}
                {Array.from({ length: depth }).map((_, i) => (
                  <Dot key={i} className="w-3 h-3 text-gray-400" />
                ))}
              </div>
            )}
            {/* ブランチアイコン */}
            <div className={`p-1 rounded-full flex-shrink-0 ${
              isActive ? 'bg-blue-100' : 'bg-gray-100'
            }`}>
              <GitBranch className={`w-4 h-4 ${
                isActive ? 'text-blue-600' : 'text-gray-600'
              }`} />
            </div>
          </div>

          {/* メイン情報 */}
          <div className="flex-1 min-w-0">
            {!isEditing ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <h3
                    className={`font-medium truncate ${
                      isActive ? 'text-blue-900' : 'text-gray-900'
                    }`}
                    style={{
                      wordWrap: 'break-word',
                      overflowWrap: 'anywhere',
                      wordBreak: 'break-word',
                      maxWidth: '100%'
                    }}
                  >
                    {line.name}
                  </h3>
                  {isActive && (
                    <Circle className="w-3 h-3 text-blue-500 fill-current flex-shrink-0" />
                  )}
                </div>

                {/* 統計情報を横並びに */}
                <div className="flex items-center gap-3 text-xs text-gray-500 flex-shrink-0">
                  <span className="flex items-center gap-1">
                    <MessageSquare className="w-3 h-3" />
                    {messageCount}
                  </span>
                  {relativeTime && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {relativeTime}
                    </span>
                  )}
                </div>

                {/* タグ */}
                {line.tagIds && line.tagIds.length > 0 && (
                  <div className="flex gap-1 flex-shrink-0">
                    {line.tagIds.slice(0, 2).map((tagId, index) => {
                      const tag = tags[tagId]
                      if (!tag) return null
                      return (
                        <Badge
                          key={index}
                          variant="secondary"
                          className="text-xs bg-emerald-100 text-emerald-700"
                          style={{
                            wordWrap: 'break-word',
                            overflowWrap: 'anywhere',
                            wordBreak: 'break-word',
                            maxWidth: '100%'
                          }}
                        >
                          {tag.name}
                        </Badge>
                      )
                    })}
                    {line.tagIds.length > 2 && (
                      <Badge variant="secondary" className="text-xs bg-gray-100 text-gray-600">
                        +{line.tagIds.length - 2}
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <Input
                  value={editData.name}
                  onChange={(e) => setEditData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="ライン名"
                  className="text-sm"
                  style={{
                    wordWrap: 'break-word',
                    overflowWrap: 'anywhere',
                    wordBreak: 'break-word',
                    maxWidth: '100%',
                    width: '100%',
                    boxSizing: 'border-box'
                  }}
                />

                {/* 現在割り当てられているタグ */}
                {editData.tagIds.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs text-gray-600">現在のタグ:</div>
                    <div className="flex flex-wrap gap-1">
                      {editData.tagIds.map((tagId) => {
                        const tag = tags[tagId]
                        if (!tag) return null
                        return (
                          <Badge
                            key={tagId}
                            variant="secondary"
                            className="text-xs bg-emerald-100 text-emerald-700 flex items-center gap-1"
                            style={{
                              wordWrap: 'break-word',
                              overflowWrap: 'anywhere',
                              wordBreak: 'break-word',
                              maxWidth: '100%'
                            }}
                          >
                            {tag.name}
                            <Button
                              onClick={() => handleRemoveTag(tagId)}
                              size="sm"
                              variant="ghost"
                              className="h-3 w-3 p-0 hover:bg-emerald-200"
                            >
                              <X className="h-2 w-2" />
                            </Button>
                          </Badge>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* 既存タグの選択（グループ別） */}
                {editData.availableTags.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs text-gray-600">既存タグから追加:</div>
                    <div className="space-y-3">
                      {Object.values(tagGroups)
                        .sort((a, b) => a.order - b.order)
                        .map(group => {
                          const groupTags = editData.availableTags.filter(tagId => {
                            const tag = tags[tagId]
                            return tag?.groupId === group.id
                          })

                          if (groupTags.length === 0) return null

                          return (
                            <div key={group.id} className="space-y-1">
                              <div className="text-xs font-medium text-gray-500">{group.name}</div>
                              <div className="flex flex-wrap gap-1">
                                {groupTags.map((tagId) => {
                                  const tag = tags[tagId]
                                  if (!tag) return null
                                  return (
                                    <Button
                                      key={tagId}
                                      onClick={() => handleAddExistingTag(tagId)}
                                      size="sm"
                                      variant="outline"
                                      className="text-xs h-6 px-2 border-gray-300 hover:border-emerald-400 hover:bg-emerald-50"
                                    >
                                      <Plus className="h-3 w-3 mr-1" />
                                      {tag.name}
                                    </Button>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        })}
                    </div>
                  </div>
                )}

                {/* タグ管理画面への案内 */}
                <div className="space-y-2">
                  <div className="text-xs text-gray-600">新しいタグを作成する場合は</div>
                  <button
                    onClick={() => onViewChange?.('management')}
                    className="text-xs text-blue-600 hover:text-blue-800 underline cursor-pointer"
                  >
                    タグ管理画面 (/management) をご利用ください
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* アクションボタン */}
          <div className="flex gap-1 flex-shrink-0">
            {!isEditing ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  handleEditStart(line)
                }}
                className="h-8 px-2 text-gray-400 hover:text-gray-600"
              >
                <Edit3 className="h-4 w-4" />
              </Button>
            ) : (
              <div className="flex gap-1">
                <Button
                  onClick={(e) => {
                    e.stopPropagation()
                    setEditingLineId(null)
                  }}
                  size="sm"
                  variant="outline"
                  className="text-xs h-8 px-2"
                >
                  キャンセル
                </Button>
                <Button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleEditSave()
                  }}
                  size="sm"
                  className="text-xs h-8 px-2 bg-emerald-500 hover:bg-emerald-600"
                >
                  保存
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (showStatistics) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">ブランチ統計</h2>
          <Button
            onClick={() => setShowStatistics(false)}
            variant="outline"
            size="sm"
          >
            <X className="w-4 h-4 mr-1" />
            閉じる
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-blue-50 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <GitBranch className="w-4 h-4 text-blue-600" />
              <span className="text-sm text-blue-600">総ライン数</span>
            </div>
            <span className="text-2xl font-bold text-blue-900">{statistics.totalLines}</span>
          </div>

          <div className="p-4 bg-green-50 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <MessageSquare className="w-4 h-4 text-green-600" />
              <span className="text-sm text-green-600">総メッセージ数</span>
            </div>
            <span className="text-2xl font-bold text-green-900">{statistics.totalMessages}</span>
          </div>

          <div className="p-4 bg-purple-50 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <GitBranch className="w-4 h-4 text-purple-600" />
              <span className="text-sm text-purple-600">分岐点数</span>
            </div>
            <span className="text-2xl font-bold text-purple-900">{statistics.totalBranches}</span>
          </div>

          <div className="p-4 bg-orange-50 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="w-4 h-4 text-orange-600" />
              <span className="text-sm text-orange-600">最大深度</span>
            </div>
            <span className="text-2xl font-bold text-orange-900">{statistics.maxDepth}</span>
          </div>
        </div>

        <div className="p-4 bg-gray-50 rounded-lg">
          <h3 className="font-medium text-gray-900 mb-3">平均メッセージ数/ライン</h3>
          <span className="text-xl font-bold text-gray-700">
            {statistics.avgMessagesPerLine.toFixed(1)}
          </span>
        </div>

        <div className="p-4 bg-gray-50 rounded-lg">
          <h3 className="font-medium text-gray-900 mb-3">深度別ライン数</h3>
          <div className="space-y-2">
            {Object.entries(statistics.linesByDepth).map(([depth, count]) => (
              <div key={depth} className="flex items-center justify-between">
                <span className="text-sm text-gray-600">深度 {depth}</span>
                <span className="font-medium">{count}ライン</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">ブランチ構造</h2>
        <div className="flex gap-2">
          {/* タグフィルター */}
          <select
            value={sortByTag || ""}
            onChange={(e) => setSortByTag(e.target.value || null)}
            className="text-xs border border-gray-300 rounded px-2 py-1"
          >
            <option value="">全て表示</option>
            {Object.entries(tagsByGroup).map(([groupName, tagNames]) => (
              <optgroup key={groupName} label={groupName}>
                {tagNames.map(tagName => (
                  <option key={tagName} value={tagName}>
                    {tagName}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <Button
            onClick={() => setShowStatistics(true)}
            variant="outline"
            size="sm"
          >
            <BarChart3 className="w-4 h-4 mr-1" />
            統計
          </Button>
        </div>
      </div>

      {/* ブランチリスト */}
      <div
        className="space-y-2 max-h-[70vh] overflow-y-auto"
        style={{
          wordWrap: 'break-word',
          overflowWrap: 'anywhere',
          maxWidth: '100%',
          width: '100%',
          boxSizing: 'border-box'
        }}
      >
        {allBranches.map(node => renderBranchItem(node))}
      </div>

      {allBranches.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <GitBranch className="w-8 h-8 mx-auto mb-2 text-gray-400" />
          <p>ブランチが見つかりません</p>
        </div>
      )}
    </div>
  )
}
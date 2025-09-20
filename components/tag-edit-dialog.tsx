"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog"
import { Tag, useTagContext } from "@/lib/tag-context"

interface TagEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tag: Tag | null
  onSave: (tag: Tag) => void
  parentTag?: Tag | null
}

const colorOptions = [
  { name: "グレー", value: "#e5e7eb" },
  { name: "グリーン", value: "#dcfce7" },
  { name: "イエロー", value: "#fef3c7" },
  { name: "ブルー", value: "#dbeafe" },
  { name: "レッド", value: "#fecaca" },
  { name: "パープル", value: "#e9d5ff" },
  { name: "ピンク", value: "#fce7f3" },
  { name: "オレンジ", value: "#fed7aa" },
]

export function TagEditDialog({ open, onOpenChange, tag, onSave, parentTag }: TagEditDialogProps) {
  const { state } = useTagContext()
  const [name, setName] = useState("")
  const [color, setColor] = useState("#e5e7eb")
  const [groupId, setGroupId] = useState("")
  const [useGroupColor, setUseGroupColor] = useState(true)

  useEffect(() => {
    if (tag) {
      setName(tag.name)
      setColor(tag.color)
      setGroupId(tag.groupId || "")
      setUseGroupColor(false)
    } else {
      setName("")
      setGroupId("")
      setUseGroupColor(true)
      // デフォルトで最初のグループを選択
      if (state.tagGroups.length > 0) {
        const firstGroup = state.tagGroups[0]
        setGroupId(firstGroup.id)
        setColor(firstGroup.color)
      } else {
        setColor("#e5e7eb")
      }
    }
  }, [tag, state.tagGroups])

  // グループが変更されたときの処理
  const handleGroupChange = (newGroupId: string) => {
    setGroupId(newGroupId)
    if (useGroupColor) {
      const selectedGroup = state.tagGroups.find(group => group.id === newGroupId)
      if (selectedGroup) {
        setColor(selectedGroup.color)
      }
    }
  }

  // グループカラー使用の切り替え
  const handleUseGroupColorChange = (use: boolean) => {
    setUseGroupColor(use)
    if (use && groupId) {
      const selectedGroup = state.tagGroups.find(group => group.id === groupId)
      if (selectedGroup) {
        setColor(selectedGroup.color)
      }
    }
  }

  const handleSave = () => {
    if (!name.trim()) return

    const tagToSave: Tag = {
      id: tag?.id || `tag_${Date.now()}`,
      name: name.trim(),
      color,
      groupId: groupId || undefined,
      count: tag?.count || 0,
      subtags: tag?.subtags,
    }

    onSave(tagToSave)
    onOpenChange(false)
  }

  const isEditing = !!tag
  const title = isEditing
    ? "タグを編集"
    : parentTag
      ? `サブタグを追加 (${parentTag.name})`
      : "新しいタグを追加"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogClose onClick={() => onOpenChange(false)} />
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label htmlFor="tag-name" className="block text-sm font-medium text-gray-700 mb-1">
              タグ名
            </label>
            <Input
              id="tag-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="タグ名を入力"
              className="w-full"
            />
          </div>

          {!parentTag && (
            <div>
              <label htmlFor="group-select" className="block text-sm font-medium text-gray-700 mb-1">
                グループ
              </label>
              <select
                id="group-select"
                value={groupId}
                onChange={(e) => handleGroupChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">グループなし</option>
                {state.tagGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                色
              </label>
              {!isEditing && groupId && (
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="use-group-color"
                    checked={useGroupColor}
                    onChange={(e) => handleUseGroupColorChange(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="use-group-color" className="text-xs text-gray-600">
                    グループ色を使用
                  </label>
                </div>
              )}
            </div>

            {useGroupColor && groupId ? (
              <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                <div
                  className="w-8 h-8 rounded-lg border border-gray-300"
                  style={{ backgroundColor: color }}
                />
                <div className="text-sm text-gray-600">
                  {state.tagGroups.find(g => g.id === groupId)?.name}の色を使用中
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {colorOptions.map((colorOption) => (
                  <button
                    key={colorOption.value}
                    type="button"
                    onClick={() => {
                      setColor(colorOption.value)
                      setUseGroupColor(false)
                    }}
                    className={`
                      w-12 h-12 rounded-lg border-2 transition-all
                      ${color === colorOption.value
                        ? "border-gray-900 ring-2 ring-blue-500"
                        : "border-gray-300 hover:border-gray-400"
                      }
                    `}
                    style={{ backgroundColor: colorOption.value }}
                    title={colorOption.name}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              キャンセル
            </Button>
            <Button
              onClick={handleSave}
              disabled={!name.trim()}
            >
              {isEditing ? "更新" : "追加"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
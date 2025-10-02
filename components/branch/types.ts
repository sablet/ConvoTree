import { Line, Tag, TagGroup } from "@/lib/types"

export interface BranchEditData {
  name: string
  tagIds: string[]
  availableTags: string[]
}

export interface BranchNodeHandlers {
  onLineClick: (line: Line, event: React.MouseEvent) => void
  onEditStart: (line: Line) => void
  onEditSave: () => void
  onEditCancel: () => void
  onEditDataChange: (data: BranchEditData) => void
  onAddExistingTag: (tagId: string) => void
  onRemoveTag: (tagId: string) => void
  onDeleteConfirm: (lineId: string) => void
  onViewChange?: (view: 'chat' | 'management' | 'branches') => void
}

export interface BranchDisplayData {
  tags: Record<string, Tag>
  tagGroups: Record<string, TagGroup>
  editData: BranchEditData
}

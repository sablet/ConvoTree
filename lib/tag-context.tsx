"use client"

import { createContext, useContext, useReducer, useEffect, ReactNode } from "react"
import { dataSourceManager } from "@/lib/data-source"
import { collection, onSnapshot } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { config } from "@/lib/config"

export interface Tag {
  id: string
  name: string
  color: string
  count?: number
  groupId?: string
  subtags?: Tag[]
}

export interface TagGroup {
  id: string
  name: string
  color: string
  order: number
}

export interface TagState {
  tags: Tag[]
  tagGroups: TagGroup[]
  isLoading: boolean
  error: string | null
}

type TagAction =
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "SET_TAGS_AND_GROUPS"; payload: { tags: Tag[]; tagGroups: TagGroup[] } }
  | { type: "ADD_TAG"; payload: Tag }
  | { type: "UPDATE_TAG"; payload: Tag }
  | { type: "DELETE_TAG"; payload: string }
  | { type: "ADD_SUBTAG"; payload: { parentId: string; subtag: Tag } }

const initialState: TagState = {
  tags: [],
  tagGroups: [],
  isLoading: false,
  error: null,
}

function tagReducer(state: TagState, action: TagAction): TagState {
  switch (action.type) {
    case "SET_LOADING":
      return { ...state, isLoading: action.payload }
    case "SET_ERROR":
      return { ...state, error: action.payload }
    case "SET_TAGS_AND_GROUPS":
      return {
        ...state,
        tags: action.payload.tags,
        tagGroups: action.payload.tagGroups,
        isLoading: false,
        error: null
      }
    case "ADD_TAG":
      return { ...state, tags: [...state.tags, action.payload] }
    case "UPDATE_TAG":
      return {
        ...state,
        tags: updateTagInArray(state.tags, action.payload),
      }
    case "DELETE_TAG":
      return {
        ...state,
        tags: deleteTagFromArray(state.tags, action.payload),
      }
    case "ADD_SUBTAG":
      return {
        ...state,
        tags: addSubtagToArray(state.tags, action.payload.parentId, action.payload.subtag),
      }
    default:
      return state
  }
}

function updateTagInArray(tags: Tag[], updatedTag: Tag): Tag[] {
  return tags.map(tag => {
    if (tag.id === updatedTag.id) {
      return updatedTag
    }
    if (tag.subtags) {
      return { ...tag, subtags: updateTagInArray(tag.subtags, updatedTag) }
    }
    return tag
  })
}

function deleteTagFromArray(tags: Tag[], tagId: string): Tag[] {
  return tags.filter(tag => {
    if (tag.id === tagId) {
      return false
    }
    if (tag.subtags) {
      tag.subtags = deleteTagFromArray(tag.subtags, tagId)
    }
    return true
  })
}

function addSubtagToArray(tags: Tag[], parentId: string, subtag: Tag): Tag[] {
  return tags.map(tag => {
    if (tag.id === parentId) {
      return {
        ...tag,
        subtags: [...(tag.subtags || []), subtag],
      }
    }
    if (tag.subtags) {
      return { ...tag, subtags: addSubtagToArray(tag.subtags, parentId, subtag) }
    }
    return tag
  })
}

interface TagContextType {
  state: TagState
  actions: {
    loadTags: () => Promise<void>
    addTag: (tag: Omit<Tag, "id">) => Promise<void>
    updateTag: (tag: Tag) => Promise<void>
    deleteTag: (tagId: string) => Promise<void>
    addSubtag: (parentId: string, subtag: Omit<Tag, "id">) => Promise<void>
  }
}


const TagContext = createContext<TagContextType | undefined>(undefined)

export function useTagContext() {
  const context = useContext(TagContext)
  if (!context) {
    throw new Error("useTagContext must be used within a TagProvider")
  }
  return context
}

interface TagProviderProps {
  children: ReactNode
}

export function TagProvider({ children }: TagProviderProps) {
  const [state, dispatch] = useReducer(tagReducer, initialState)

  const loadTags = async () => {
    dispatch({ type: "SET_LOADING", payload: true })
    try {
      // DataSourceManagerからFirestoreデータを取得
      const chatData = await dataSourceManager.loadChatData()

      // 実際のタグデータとグループデータを取得
      const actualTags = chatData.tags || {}
      const actualTagGroups = chatData.tagGroups || {}
      const tagCountMap = new Map<string, number>()

      // 各ラインのtagIdsからタグの使用回数を計算
      chatData.lines?.forEach((line) => {
        line.tagIds?.forEach((tagId: string) => {
          tagCountMap.set(tagId, (tagCountMap.get(tagId) || 0) + 1)
        })
      })

      // Firestoreから実際のタグデータを読み込み
      const tagsArray: Tag[] = Object.values(actualTags).map((tag) => {
        return {
          id: tag.id,
          name: tag.name,
          color: tag.color || "#e5e7eb",
          groupId: tag.groupId,
          count: tagCountMap.get(tag.id) || 0,
        }
      })

      // Firestoreからタググループデータを読み込み
      const tagGroupsArray: TagGroup[] = Object.values(actualTagGroups)
        .sort((a, b) => a.order - b.order)

      // グループ別にタグを整理して階層構造を作成
      const hierarchicalTags: Tag[] = tagGroupsArray.map(group => {
        const groupTags = tagsArray.filter(tag => tag.groupId === group.id)
        const groupCount = groupTags.reduce((sum, tag) => sum + (tag.count || 0), 0)

        return {
          id: group.id,
          name: group.name,
          color: group.color,
          count: groupCount,
          subtags: groupTags
        }
      })

      // グループに属さないタグを個別に追加
      const groupedTagIds = new Set(tagsArray.filter(tag => tag.groupId).map(tag => tag.id))
      const ungroupedTags = tagsArray.filter(tag => !groupedTagIds.has(tag.id))

      ungroupedTags.forEach(tag => {
        hierarchicalTags.push({
          ...tag,
          color: tag.color || "#e5e7eb"
        })
      })

      dispatch({
        type: "SET_TAGS_AND_GROUPS",
        payload: { tags: hierarchicalTags, tagGroups: tagGroupsArray }
      })
    } catch (error) {
      dispatch({ type: "SET_ERROR", payload: error instanceof Error ? error.message : "タグの読み込みに失敗しました" })
    }
  }

  const addTag = async (tagData: Omit<Tag, "id">) => {
    try {
      // Firestoreに保存
      const tagId = await dataSourceManager.createTag({
        name: tagData.name,
        color: tagData.color,
        groupId: tagData.groupId
      })

      const newTag: Tag = {
        ...tagData,
        id: tagId,
        count: 0,
      }
      dispatch({ type: "ADD_TAG", payload: newTag })
    } catch (error) {
      dispatch({ type: "SET_ERROR", payload: error instanceof Error ? error.message : "タグの追加に失敗しました" })
    }
  }

  const updateTag = async (tag: Tag) => {
    try {
      // Firestoreを更新
      await dataSourceManager.updateTag(tag.id, {
        name: tag.name,
        color: tag.color,
        groupId: tag.groupId
      })

      dispatch({ type: "UPDATE_TAG", payload: tag })
    } catch (error) {
      dispatch({ type: "SET_ERROR", payload: error instanceof Error ? error.message : "タグの更新に失敗しました" })
    }
  }

  const deleteTag = async (tagId: string) => {
    try {
      // Firestoreから削除
      await dataSourceManager.deleteTag(tagId)

      dispatch({ type: "DELETE_TAG", payload: tagId })
    } catch (error) {
      dispatch({ type: "SET_ERROR", payload: error instanceof Error ? error.message : "タグの削除に失敗しました" })
    }
  }

  const addSubtag = async (parentId: string, subtagData: Omit<Tag, "id">) => {
    try {
      // Firestoreに保存（サブタグは親IDをgroupIdとして設定）
      const tagId = await dataSourceManager.createTag({
        name: subtagData.name,
        color: subtagData.color,
        groupId: parentId
      })

      const newSubtag: Tag = {
        ...subtagData,
        id: tagId,
        count: 0,
      }
      dispatch({ type: "ADD_SUBTAG", payload: { parentId, subtag: newSubtag } })
    } catch (error) {
      dispatch({ type: "SET_ERROR", payload: error instanceof Error ? error.message : "サブタグの追加に失敗しました" })
    }
  }

  useEffect(() => {
    // 初回ロード
    loadTags()

    // リアルタイムリスナーの設定
    const conversationId = config.conversationId

    if (!conversationId) {
      dispatch({ type: "SET_ERROR", payload: "NEXT_PUBLIC_CONVERSATION_ID環境変数が設定されていません" })
      return
    }

    // Tagsのリアルタイムリスナー
    const tagsRef = collection(db, 'conversations', conversationId, 'tags')
    const unsubscribeTags = onSnapshot(tagsRef, (snapshot) => {
      console.log('🔄 Tags updated in real-time')
      // 変更があった場合のみリロード
      if (!snapshot.metadata.fromCache) {
        loadTags()
      }
    }, (error) => {
      console.error('❌ Tags listener error:', error)
      dispatch({ type: "SET_ERROR", payload: "リアルタイム更新でエラーが発生しました" })
    })

    // TagGroupsのリアルタイムリスナー
    const tagGroupsRef = collection(db, 'conversations', conversationId, 'tagGroups')
    const unsubscribeTagGroups = onSnapshot(tagGroupsRef, (snapshot) => {
      console.log('🔄 TagGroups updated in real-time')
      // 変更があった場合のみリロード
      if (!snapshot.metadata.fromCache) {
        loadTags()
      }
    }, (error) => {
      console.error('❌ TagGroups listener error:', error)
      dispatch({ type: "SET_ERROR", payload: "リアルタイム更新でエラーが発生しました" })
    })

    // Linesのリアルタイムリスナー（タグカウント更新用）
    const linesRef = collection(db, 'conversations', conversationId, 'lines')
    const unsubscribeLines = onSnapshot(linesRef, (snapshot) => {
      console.log('🔄 Lines updated in real-time (for tag counts)')
      // 変更があった場合のみリロード
      if (!snapshot.metadata.fromCache) {
        loadTags()
      }
    }, (error) => {
      console.error('❌ Lines listener error:', error)
    })

    // クリーンアップ関数
    return () => {
      unsubscribeTags()
      unsubscribeTagGroups()
      unsubscribeLines()
    }
  }, [])

  const actions = {
    loadTags,
    addTag,
    updateTag,
    deleteTag,
    addSubtag,
  }

  return (
    <TagContext.Provider value={{ state, actions }}>
      {children}
    </TagContext.Provider>
  )
}
"""RAGシステムのデータモデル定義"""

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, field_validator


class IntentStatus(str, Enum):
    """意図のステータス"""

    IDEA = "idea"
    TODO = "todo"
    DOING = "doing"
    DONE = "done"


class UnifiedIntent(BaseModel):
    """統合ドキュメント（Vector DB格納用）"""

    # === 識別情報 ===
    id: str = Field(..., description="意図ID（intent_クラスタID_インデックス）")
    type: str = Field(default="individual_intent", description="ドキュメントタイプ")

    # === 内容（embedding対象） ===
    intent: str = Field(..., min_length=1, description="意図の本文")
    context: str = Field(default="", description="意図の詳細文脈")
    combined_content: str = Field(default="", description="元メッセージ全文")

    # === メタデータ（filter対象） ===
    timestamps: list[datetime] = Field(
        default_factory=list, description="開始時刻のリスト（ソート済み）"
    )
    status: IntentStatus = Field(..., description="進捗ステータス")
    cluster_id: int = Field(..., ge=-1, description="クラスタID（generated_nodeは-1）")
    source_message_ids: list[str] = Field(
        default_factory=list, description="元メッセージID"
    )
    source_full_paths: list[str] = Field(
        default_factory=list, description="チャネル階層パス"
    )

    # === 階層情報 ===
    ultra_intent_id: str = Field(default="", description="最上位意図ID")
    ultra_intent_text: str = Field(default="", description="最上位意図テキスト")
    meta_intent_id: str = Field(default="", description="上位意図ID")
    meta_intent_text: str = Field(default="", description="上位意図テキスト")

    # === Embedding用テキスト ===
    embedding_text: str = Field(
        ..., min_length=1, description="埋め込み生成用の結合テキスト"
    )

    @field_validator("timestamps", mode="before")
    @classmethod
    def parse_timestamps(cls, v: Any) -> list[datetime]:
        """タイムスタンプ文字列リストをdatetimeリストに変換"""
        if isinstance(v, list):
            result = []
            for item in v:
                if isinstance(item, str):
                    result.append(datetime.fromisoformat(item.replace("Z", "+00:00")))
                elif isinstance(item, datetime):
                    result.append(item)
                else:
                    raise ValueError(f"Invalid timestamp format: {item}")
            return result
        if isinstance(v, str):
            # 単一の文字列の場合はリストに変換
            return [datetime.fromisoformat(v.replace("Z", "+00:00"))]
        if isinstance(v, datetime):
            # 単一のdatetimeの場合はリストに変換
            return [v]
        raise ValueError(f"Invalid timestamps format: {v}")

    @field_validator("status", mode="before")
    @classmethod
    def normalize_status(cls, v: Any) -> str:
        """ステータス文字列を小文字に正規化"""
        if isinstance(v, str):
            return v.lower()
        return v


class GoalNode(BaseModel):
    """ゴールネットワークのノード"""

    id: str = Field(..., description="ノードID")
    intent: str = Field(..., min_length=1, description="意図の文章")
    status: IntentStatus = Field(..., description="ステータス")
    node_type: str = Field(
        ..., description="ノードタイプ (individual/meta/ultra/generated)"
    )

    @field_validator("status", mode="before")
    @classmethod
    def normalize_status(cls, v: Any) -> str:
        """ステータス文字列を小文字に正規化"""
        if isinstance(v, str):
            return v.lower()
        return v


class GoalEdge(BaseModel):
    """ゴールネットワークのエッジ（目的→手段の関係）"""

    from_id: str = Field(..., description="目的ノードID（親）")
    to_id: str = Field(..., description="手段ノードID（子）")
    relation: str = Field(default="means", description="関係タイプ")


class GoalNetwork(BaseModel):
    """ゴールネットワーク全体"""

    nodes: list[GoalNode] = Field(default_factory=list, description="ノードのリスト")
    edges: list[GoalEdge] = Field(default_factory=list, description="エッジのリスト")


class QueryParams(BaseModel):
    """LLMが抽出したクエリパラメータ"""

    period_days: int | None = Field(None, description="期間（日数）", ge=1)
    topic: str | None = Field(None, description="トピック（検索キーワード）")
    status_filter: list[IntentStatus] = Field(
        default_factory=lambda: [IntentStatus.TODO, IntentStatus.IDEA],
        description="ステータスフィルタ",
    )

    @field_validator("status_filter", mode="before")
    @classmethod
    def parse_status_list(cls, v: Any) -> list[IntentStatus]:
        """ステータスリストをパース"""
        if isinstance(v, list):
            return [IntentStatus(s.lower()) if isinstance(s, str) else s for s in v]
        return v


class SearchResult(BaseModel):
    """検索結果"""

    query: str = Field(..., description="元のクエリ文")
    params: QueryParams = Field(..., description="抽出されたパラメータ")
    intents: list[UnifiedIntent] = Field(
        default_factory=list, description="検索結果の意図リスト"
    )
    subgraph: GoalNetwork | None = Field(
        default=None, description="抽出された部分グラフ"
    )
    answer: str | None = Field(None, description="LLM生成の最終回答")
    metadata: dict[str, Any] = Field(default_factory=dict, description="検索メタデータ")

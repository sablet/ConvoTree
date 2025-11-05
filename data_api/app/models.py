"""Data models for message intent analysis"""
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


@dataclass
class Message:
    """元のメッセージ"""
    id: str
    timestamp: datetime
    text: str
    message_type: str

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "timestamp": self.timestamp.isoformat(),
            "text": self.text,
            "message_type": self.message_type,
        }


@dataclass
class MessageGroup:
    """時系列グループ"""
    id: str
    message_ids: list[str]
    start_time: datetime
    end_time: datetime

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "message_ids": self.message_ids,
            "start_time": self.start_time.isoformat(),
            "end_time": self.end_time.isoformat(),
        }


@dataclass
class Intent:
    """抽出された意図"""
    id: str
    group_id: str
    summary: str
    embedding: Optional[list[float]] = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "group_id": self.group_id,
            "summary": self.summary,
            "embedding": self.embedding,
        }


@dataclass
class IntentRelation:
    """意図間の関係"""
    source_intent_id: str
    target_intent_id: str
    relation_type: str  # "why" or "how"

    def to_dict(self) -> dict:
        return {
            "source_intent_id": self.source_intent_id,
            "target_intent_id": self.target_intent_id,
            "relation_type": self.relation_type,
        }


@dataclass
class SimilarIntents:
    """類似Intent検索結果"""
    source_intent_id: str
    temporal_neighbors: list[str] = field(default_factory=list)
    similarity_neighbors: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "source_intent_id": self.source_intent_id,
            "temporal_neighbors": self.temporal_neighbors,
            "similarity_neighbors": self.similarity_neighbors,
        }

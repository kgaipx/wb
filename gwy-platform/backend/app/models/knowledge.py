"""知识库模型（方案 c5 方向1 RAG 底座 / WBS 3.1）。

公考法规 / 时政 / 真题解析以「知识片段」形式入库，带来源标注，供 RAG 检索增强生成。
MVP 阶段用关系库存文本 + 词项检索；规模化接入向量库（Milvus / Tencent Cloud VectorDB）后
只需替换 KnowledgeRetriever.retrieve 实现，模型层不变。
"""
from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class KnowledgeChunk(Base):
    __tablename__ = "knowledge_chunks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    kp: Mapped[str] = mapped_column(
        String(128), index=True, comment="知识点标签（与题目 knowledge_point 对齐）"
    )
    title: Mapped[str] = mapped_column(String(255), comment="片段标题")
    content: Mapped[str] = mapped_column(Text, comment="知识正文（RAG 检索对象）")
    source: Mapped[str] = mapped_column(
        String(255), comment="来源标注（政策出处 / 真题年份），用于合规性溯源"
    )
    source_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    is_verified: Mapped[bool] = mapped_column(default=False, comment="双签校验通过")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

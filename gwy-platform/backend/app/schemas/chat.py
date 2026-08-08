"""AI 私教对话历史接口契约（WBS 3.1 持久化）。

会话与消息分离：会话负责分组与排序，消息负责逐条内容（含来源与降级标记），
前端以 DB 为真相源，刷新/切换设备均可恢复历史。
"""
from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.ai import CitationOut


class ChatMessageOut(BaseModel):
    id: int
    role: str  # user | assistant
    content: str
    citations: list[CitationOut] = []
    model: str | None = None
    offline: bool = False
    created_at: datetime


class ChatSessionOut(BaseModel):
    id: int
    title: str
    created_at: datetime
    updated_at: datetime
    message_count: int = 0
    last_message: str | None = None  # 末条消息预览（截断），便于快速识别会话


class ChatSendIn(BaseModel):
    content: str  # 用户本条消息
    kp_hint: str | None = None  # 可选知识点提示，用于更精准检索


class ChatSessionRenameIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=50)  # 用户自定义会话标题，限长便于归档


class ChatSendOut(BaseModel):
    session_id: int
    message: ChatMessageOut
    title: str  # 会话最新标题（首条消息自动生成）

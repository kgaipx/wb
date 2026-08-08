"""通知相关 Schema。"""
from pydantic import BaseModel


class NotificationOut(BaseModel):
    id: int
    type: str
    title: str
    body: str
    link: str | None = None
    is_read: bool
    created_at: str


class NotificationList(BaseModel):
    items: list[NotificationOut]
    unread_count: int

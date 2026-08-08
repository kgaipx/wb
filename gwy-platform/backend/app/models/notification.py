"""站内通知（Notification Center，v1 动作触发型）。

Notification：系统主动推送的会员/测评类消息，用户可见、可标记已读、可深链跳转。
触发点分布在 billing（会员开通）、auth（会员到期降级）、assessment（测评完成）等动作处。
"""
from datetime import datetime, timezone

from sqlalchemy import Boolean, ForeignKey, Integer, String, DateTime
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    type: Mapped[str] = mapped_column(
        String(32),
        index=True,
        comment="membership_activated / membership_expired / assessment_done / system",
    )
    title: Mapped[str] = mapped_column(String(120))
    body: Mapped[str] = mapped_column(String(500))
    link: Mapped[str | None] = mapped_column(
        String(255), nullable=True, comment="深链，如 /assessment/history/{id}"
    )
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

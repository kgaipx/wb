"""收藏夹模型（WBS 2.2 衍生 / 用户学习管理）。

用户可把题目加入收藏，用于重点复盘与制定个人学习计划。
与 UserAnswer 解耦，独立维护收藏关系。
字段：note（私人笔记，云端同步）、tags（自定义标签，如 ['易错','重点']）。
"""
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Favorite(Base):
    __tablename__ = "favorites"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    question_id: Mapped[int] = mapped_column(
        ForeignKey("questions.id", ondelete="CASCADE"), index=True
    )
    note: Mapped[str] = mapped_column(Text, default="", comment="私人笔记（云端同步）")
    tags: Mapped[list] = mapped_column(
        JSON, default=list, comment="自定义标签，如 ['易错','重点']"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    user: Mapped["User"] = relationship("User")
    question: Mapped["Question"] = relationship("Question")

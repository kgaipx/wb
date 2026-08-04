"""学情 / 能力图谱模型（方案 c4 方向1 / WBS 3.2 能力图谱 v1）。

- UserAnswer：每次作答记录，是复错率、进步曲线的原始数据（方案 c12 信号）。
- AbilityProfile：按知识点聚合的掌握度，自适应推送（SM-2 简化）的输入。
"""
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class UserAnswer(Base):
    __tablename__ = "user_answers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    question_id: Mapped[int] = mapped_column(
        ForeignKey("questions.id", ondelete="CASCADE"), index=True
    )
    selected: Mapped[str | None] = mapped_column(
        Text, nullable=True, comment="用户选择（选项标签拼接 / essay 要点）"
    )
    is_correct: Mapped[bool] = mapped_column(Boolean, default=False)
    time_spent_ms: Mapped[int] = mapped_column(Integer, default=0, comment="作答耗时")
    submitted_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    user: Mapped["User"] = relationship(back_populates="answers")
    question: Mapped["Question"] = relationship(back_populates="answers")


class AbilityProfile(Base):
    __tablename__ = "ability_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    knowledge_point: Mapped[str] = mapped_column(String(128), index=True)
    mastery: Mapped[float] = mapped_column(Float, default=0.0, comment="掌握度 0-1")
    attempts: Mapped[int] = mapped_column(Integer, default=0, comment="累计作答次数")
    correct: Mapped[int] = mapped_column(Integer, default=0, comment="累计答对次数")
    last_practiced: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)

    user: Mapped["User"] = relationship(back_populates="abilities")

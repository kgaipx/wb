"""内容审核台账模型（方案 c5 方向5 / WBS 5.2 / c11 P0 风险）。

所有入库内容（题库 / 时政 / 政策 / 申论范文）须经双签复核，审批留痕可追溯。
版本字段支撑「更正并通知」——内容变更产生新版本并通知受影响学员（回应华图教材事故）。
"""
from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class ContentReview(Base):
    __tablename__ = "content_reviews"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    item_type: Mapped[str] = mapped_column(
        String(32), index=True, comment="question / knowledge / essay_policy"
    )
    item_id: Mapped[str] = mapped_column(String(64), index=True, comment="被审核内容标识")
    body: Mapped[str] = mapped_column(Text, comment="待审内容正文")
    version: Mapped[int] = mapped_column(Integer, default=1, comment="内容版本")
    status: Mapped[str] = mapped_column(
        String(16), default="pending", comment="pending/approved/rejected/corrected"
    )
    reviewer_1: Mapped[str | None] = mapped_column(String(64), nullable=True)
    reviewer_2: Mapped[str | None] = mapped_column(String(64), nullable=True)
    reviewer_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)

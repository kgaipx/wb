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
    reviewer_1_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, comment="甲签时间（双签留痕）")
    reviewer_2_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, comment="乙签时间（双签留痕）")
    reviewer_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)


class ContentReviewLog(Base):
    """双签复核操作日志（append-only 留痕）。

    每一次 submit / approve / reject / correct 都写入一条，
    支持前端展示完整审计轨迹与回溯任一时刻的审核员/动作/备注。
    """

    __tablename__ = "content_review_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    review_id: Mapped[int] = mapped_column(Integer, index=True, comment="所属审核单")
    action: Mapped[str] = mapped_column(
        String(16), comment="submit / approve / reject / correct"
    )
    actor: Mapped[str] = mapped_column(String(64), comment="操作人（昵称或邮箱）")
    note: Mapped[str | None] = mapped_column(Text, nullable=True, comment="备注/驳回理由/更正说明")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

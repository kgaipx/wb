"""模考历史模型（WBS 4.2 在线模考 + 提分报告复盘）。

每次交卷生成一条 ExamRecord，持久化正确率、薄弱点、逐题快照，
支持学员回头复盘历史模考（驱动「复错率下降」闭环）。
"""
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class ExamRecord(Base):
    __tablename__ = "exam_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    subject: Mapped[str] = mapped_column(String(32), default="全部")
    total: Mapped[int] = mapped_column(Integer, default=0)
    correct: Mapped[int] = mapped_column(Integer, default=0)
    correct_rate: Mapped[float] = mapped_column(Float, default=0.0)
    # 薄弱知识点列表（top5）
    weak_points: Mapped[list] = mapped_column(JSON, default=list)
    # 逐题快照：[{question_id, is_correct, correct_answer, selected, stem, knowledge_point}]
    details: Mapped[list] = mapped_column(JSON, default=list)
    # 各知识点「模考前 → 模考后」掌握度变化：[{knowledge_point, before, after, delta}]，
    # 用于历史报告回看进步轨迹（与 submit_exam 返回 kp_mastery 同源）。
    kp_mastery: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    user: Mapped["User"] = relationship(back_populates="exam_records")

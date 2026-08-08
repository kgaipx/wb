"""能力测评记录（WBS 3.2 自适应诊断）。

AssessmentRecord：每次测评的能力快照（总体掌握度 + 各维度 mastery + 弱项 + 建议），
是「首次测评 → 自适应引擎生成能力图谱与弱项」的数据落点，也是能力成长轨迹的来源。
"""
from datetime import datetime, timezone

from sqlalchemy import Float, ForeignKey, Integer, String, Text, DateTime
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class AssessmentRecord(Base):
    __tablename__ = "assessment_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    overall: Mapped[float] = mapped_column(Float, default=0.0, comment="总体掌握度 0-1")
    mastery_json: Mapped[str] = mapped_column(
        Text, default="[]", comment="JSON: [{kp, mastery}] 各维度本次正确率（雷达图数据）"
    )
    weak_json: Mapped[str] = mapped_column(
        Text, default="[]", comment="JSON: 弱项知识点列表"
    )
    suggestions_json: Mapped[str] = mapped_column(
        Text, default="[]", comment="JSON: 提升建议列表"
    )
    questions_total: Mapped[int] = mapped_column(Integer, default=0, comment="本次测评题量")
    correct_count: Mapped[int | None] = mapped_column(
        Integer, nullable=True, comment="本次答对题数（历史详情正确展示用）"
    )
    details_json: Mapped[str | None] = mapped_column(
        Text, nullable=True, comment="JSON: 逐题回顾明细（题面/作答/正误/正确答案）"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

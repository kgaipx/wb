"""申论题库与批改记录模型（方案 c5 方向2 / WBS 4.1 申论 AI 批改）。

- EssayPrompt：申论题目（材料 + 作答要求 + 满分），供前端『申论批改』页直接取用。
- EssayGradeRecord：每次 AI 批改留痕（维度分、总分、是否转人工、总评），支撑复看与一致性回溯。
"""

from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class EssayPrompt(Base):
    __tablename__ = "essay_prompts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(255), comment="题目标题")
    kp: Mapped[str | None] = mapped_column(String(128), nullable=True, comment="知识点标签")
    material: Mapped[str] = mapped_column(Text, comment="给定资料/材料")
    requirement: Mapped[str] = mapped_column(Text, comment="作答要求")
    max_score: Mapped[int] = mapped_column(Integer, default=100, comment="满分")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class EssayGradeRecord(Base):
    __tablename__ = "essay_grade_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    prompt_id: Mapped[int | None] = mapped_column(
        ForeignKey("essay_prompts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    essay_text: Mapped[str] = mapped_column(Text, comment="考生作答")
    total: Mapped[float] = mapped_column(default=0.0, comment="总分")
    dimensions: Mapped[dict] = mapped_column(JSON, default=dict, comment="维度分 {立意:..,结构:..}")
    needs_human_review: Mapped[bool] = mapped_column(default=False, comment="是否转人工复核")
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True, comment="总评")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    user: Mapped["User"] = relationship("User", back_populates="essay_grades")

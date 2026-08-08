"""题库模型（方案 c4 方向2 / WBS 2.2 结构化题库）。

结构化字段支持按 科目 / 题型 / 知识点 / 难度 检索；is_verified 支撑 WBS 5.2 双签内容校验。
copyright_owner 与 source 字段构成版权台账（合规要求，方案 c10）。
"""
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    subject: Mapped[str] = mapped_column(
        String(32), index=True, comment="考试科目：行测 / 申论"
    )
    category: Mapped[str] = mapped_column(
        String(64), index=True, comment="细分：言语 / 数量 / 判断 / 资料 / 常识 / 申论写作"
    )
    qtype: Mapped[str] = mapped_column(
        String(16), default="single", comment="single / multiple / essay"
    )
    stem: Mapped[str] = mapped_column(Text, comment="题干")
    difficulty: Mapped[int] = mapped_column(Integer, default=3, comment="难度 1-5")
    knowledge_point: Mapped[str] = mapped_column(
        String(128), index=True, comment="知识点标签（能力图谱维度）"
    )
    answer: Mapped[str | None] = mapped_column(
        Text, nullable=True, comment="标准答案 / 评分要点"
    )
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True, comment="解析")

    # 内容来源与版权台账（合规）
    source: Mapped[str | None] = mapped_column(
        String(255), nullable=True, comment="来源，如 2024国考地市级"
    )
    source_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    copyright_owner: Mapped[str | None] = mapped_column(
        String(255), nullable=True, comment="版权方（台账）"
    )
    is_verified: Mapped[bool] = mapped_column(
        Boolean, default=False, comment="双签校验通过（WBS 5.2）"
    )

    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    options: Mapped[list["QuestionOption"]] = relationship(
        back_populates="question", cascade="all, delete-orphan"
    )
    answers: Mapped[list["UserAnswer"]] = relationship(
        back_populates="question", cascade="all, delete-orphan"
    )


class QuestionOption(Base):
    __tablename__ = "question_options"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    question_id: Mapped[int] = mapped_column(
        ForeignKey("questions.id", ondelete="CASCADE"), index=True
    )
    label: Mapped[str] = mapped_column(String(8), comment="A / B / C / D")
    content: Mapped[str] = mapped_column(Text, comment="选项内容")
    is_correct: Mapped[bool] = mapped_column(Boolean, default=False, comment="是否为正确项")

    question: Mapped["Question"] = relationship(back_populates="options")

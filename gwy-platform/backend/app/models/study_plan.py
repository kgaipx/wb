"""学习计划与打卡模型（方案 c3 私教大脑 / 执行-复盘闭环）。

- StudyPlan：每次生成的个性化计划（覆盖 1~N 天），含总述与生成来源（LLM 模型 / 离线）。
- PlanTask：计划内的可执行任务，可打卡（done）以驱动执行与复盘；
  任务自带其所属「日」的上下文（focus/summary/knowledge_points），便于从扁平任务重建日视图。
"""
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class StudyPlan(Base):
    __tablename__ = "study_plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    days: Mapped[int] = mapped_column(Integer, default=7, comment="计划天数")
    target: Mapped[str | None] = mapped_column(String(64), nullable=True, comment="目标考试")
    summary: Mapped[str | None] = mapped_column(Text, nullable=True, comment="计划总述")
    model: Mapped[str | None] = mapped_column(String(64), nullable=True, comment="生成所用 LLM")
    offline: Mapped[bool] = mapped_column(
        Boolean, default=False, comment="True 表示 LLM 不可用走了规则降级"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    tasks: Mapped[list["PlanTask"]] = relationship(
        back_populates="plan",
        cascade="all, delete-orphan",
        order_by="PlanTask.day, PlanTask.id",
    )


class PlanTask(Base):
    __tablename__ = "plan_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    plan_id: Mapped[int] = mapped_column(
        ForeignKey("study_plans.id", ondelete="CASCADE"), index=True
    )
    day: Mapped[int] = mapped_column(Integer, default=1, comment="计划第几天")
    # 日级上下文（同一 day 的任务共享，便于重建日视图）
    focus: Mapped[str] = mapped_column(String(128), default="", comment="当日主攻知识点")
    summary: Mapped[str] = mapped_column(String(255), default="", comment="当日概述")
    knowledge_points: Mapped[str] = mapped_column(
        Text, default="[]", comment="当日知识点 JSON 数组"
    )
    # 任务级
    kind: Mapped[str] = mapped_column(
        String(24), comment="practice|review_wrong|favorite|mock|explain|read"
    )
    title: Mapped[str] = mapped_column(String(255))
    target: Mapped[str | None] = mapped_column(String(128), nullable=True)
    ref_id: Mapped[int | None] = mapped_column(
        Integer, nullable=True, comment="关联题目 id（用于跳转刷题）"
    )
    done: Mapped[bool] = mapped_column(Boolean, default=False, comment="是否已打卡完成")
    checked_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, comment="打卡时间（取消则清空）"
    )

    plan: Mapped["StudyPlan"] = relationship(back_populates="tasks")

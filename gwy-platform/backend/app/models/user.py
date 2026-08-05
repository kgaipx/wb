"""用户模型（方案 c4 学员中心 / WBS 2.1）。

承载账号、报考画像（省份 / 目标考试 / 会员等级），是学情看板与个性化推送的基础。
PIPL 合规：仅收集教学必需字段，密码以 bcrypt 哈希存储，绝不明文落库。
"""
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(32), unique=True, nullable=True, index=True)
    nickname: Mapped[str | None] = mapped_column(String(64), nullable=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # 角色权限：user（学员）/ reviewer（内容审核员）/ admin（管理员）
    # 审核双签与支付手动激活等敏感操作需 reviewer / admin。
    role: Mapped[str] = mapped_column(
        String(16), default="user", comment="角色：user / reviewer / admin"
    )

    # 报考画像（个性化诊断 / 自适应推送的基础，WBS 3.2）
    province: Mapped[str | None] = mapped_column(String(32), nullable=True, comment="报考省份")
    target_exam: Mapped[str] = mapped_column(
        String(32), default="国考", comment="目标考试：国考 / 省考 / 事业单位"
    )
    plan: Mapped[str] = mapped_column(
        String(32), default="free", comment="会员等级：free / pro / pro_year（WBS 7.1）"
    )
    plan_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, default=None,
        comment="会员到期时间（pro/pro_year 有效；free 为 NULL）",
    )
    # 免费版每日 AI 讲解配额（防止滥用；pro 不限），按自然日重置
    ai_quota_used: Mapped[int] = mapped_column(Integer, default=0, comment="今日已用 AI 讲解次数")
    ai_quota_date: Mapped[str] = mapped_column(String(10), default="", comment="配额计数所属日期 YYYY-MM-DD")

    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    answers: Mapped[list["UserAnswer"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    abilities: Mapped[list["AbilityProfile"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    essay_grades: Mapped[list["EssayGradeRecord"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    exam_records: Mapped[list["ExamRecord"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )

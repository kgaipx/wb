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

    # 报考画像（个性化诊断 / 自适应推送的基础，WBS 3.2）
    province: Mapped[str | None] = mapped_column(String(32), nullable=True, comment="报考省份")
    target_exam: Mapped[str] = mapped_column(
        String(32), default="国考", comment="目标考试：国考 / 省考 / 事业单位"
    )
    plan: Mapped[str] = mapped_column(
        String(32), default="free", comment="会员等级：free / pro（WBS 7.1）"
    )

    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    answers: Mapped[list["UserAnswer"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    abilities: Mapped[list["AbilityProfile"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )

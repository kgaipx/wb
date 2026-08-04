"""计费 / 退费模型（方案 c4 方向4 透明定价 / WBS 5.1 无忧退费）。

订单与退费申请分离，退费进度可查、到账时限明确，直接回应中公退费灾难痛点。
退费规则透明（见 services/billing.py），不玩文字游戏。
"""
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    plan: Mapped[str] = mapped_column(String(32), comment="free / pro / pro_year")
    amount: Mapped[int] = mapped_column(Integer, comment="金额（分），避免浮点误差")
    currency: Mapped[str] = mapped_column(String(8), default="CNY")
    status: Mapped[str] = mapped_column(
        String(16), default="paid", comment="paid / refunding / refunded"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class RefundRequest(Base):
    __tablename__ = "refund_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), index=True
    )
    amount: Mapped[int] = mapped_column(Integer, comment="退费金额（分）")
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(16), default="pending", comment="pending / approved / rejected / refunded"
    )
    requested_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # 透明承诺：提交后 3 个工作日内到账
    eta_arrive_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

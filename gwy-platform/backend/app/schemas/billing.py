"""计费 / 退费接口契约（WBS 5.1 无忧退费 / WBS 7.1 会员）。"""
from datetime import datetime
from pydantic import BaseModel


class OrderIn(BaseModel):
    plan: str = "pro"  # pro / pro_year


class OrderOut(BaseModel):
    id: int
    user_id: int
    plan: str
    amount: int  # 分
    currency: str
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class RefundIn(BaseModel):
    order_id: int
    reason: str | None = None


class RefundOut(BaseModel):
    id: int
    order_id: int
    amount: int  # 分
    status: str
    reason: str | None
    requested_at: datetime
    eta_arrive_at: datetime | None

    model_config = {"from_attributes": True}

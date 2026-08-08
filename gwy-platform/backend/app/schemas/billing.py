"""计费 / 退费接口契约（WBS 5.1 无忧退费 / WBS 7.1 会员）。"""
from datetime import datetime
from pydantic import BaseModel


class OrderIn(BaseModel):
    plan: str = "pro"  # pro / pro_year
    payment_method: str = "sandbox"  # sandbox / wechat / alipay / manual


class OrderOut(BaseModel):
    id: int
    user_id: int
    plan: str
    amount: int  # 分
    currency: str
    status: str
    payment_method: str = "sandbox"
    out_trade_no: str | None = None
    pay_url: str | None = None  # 沙箱/收银台支付入口（仅创建时返回）
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
    decided_at: datetime | None = None
    eta_arrive_at: datetime | None

    model_config = {"from_attributes": True}

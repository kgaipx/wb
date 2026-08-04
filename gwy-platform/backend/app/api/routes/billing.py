"""计费 / 退费路由（WBS 5.1 无忧退费 / WBS 7.1 会员体系）。

下单即标记已支付（演示，未接真实支付）；退费走透明规则（services.billing.compute_refund），
进度可查、到账时限明确（3 个工作日，见 content_validator.eta_arrive）。
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.routes.auth import get_current_user
from app.db.session import get_db
from app.models import Order, RefundRequest, User
from app.schemas.billing import OrderIn, OrderOut, RefundIn, RefundOut
from app.services.billing import compute_refund

router = APIRouter()

_PRICE = {"pro": 9900, "pro_year": 99000}  # 单位：分（¥99 / ¥990）


@router.post("/orders", response_model=OrderOut, status_code=201)
def create_order(
    payload: OrderIn, current: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    if payload.plan not in _PRICE:
        raise HTTPException(status_code=400, detail="未知套餐")
    order = Order(
        user_id=current.id,
        plan=payload.plan,
        amount=_PRICE[payload.plan],
        currency="CNY",
        status="paid",
        paid_at=datetime.now(timezone.utc),
    )
    db.add(order)
    current.plan = payload.plan  # 开通会员
    db.commit()
    db.refresh(order)
    return order


@router.post("/refund", response_model=RefundOut, status_code=201)
def request_refund(
    payload: RefundIn, current: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    order = db.get(Order, payload.order_id)
    if order is None or order.user_id != current.id:
        raise HTTPException(status_code=404, detail="订单不存在")
    if order.status != "paid":
        raise HTTPException(status_code=400, detail=f"当前订单状态不可退：{order.status}")

    amount, _note = compute_refund(order)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="超出可自动退费期限，需人工评估")

    refund = RefundRequest(
        user_id=current.id,
        order_id=order.id,
        amount=amount,
        reason=payload.reason,
        status="refunded",  # 演示：透明即时退（真实场景走 pending → 审批 → refunded）
        eta_arrive_at=datetime.now(timezone.utc),
    )
    order.status = "refunded"
    db.add(refund)
    db.commit()
    db.refresh(refund)
    return refund


@router.get("/me", tags=["billing"])
def my_billing(current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    orders = db.query(Order).filter(Order.user_id == current.id).all()
    refunds = db.query(RefundRequest).filter(RefundRequest.user_id == current.id).all()
    return {
        "plan": current.plan,
        "orders": [OrderOut.model_validate(o).model_dump() for o in orders],
        "refunds": [RefundOut.model_validate(r).model_dump() for r in refunds],
    }

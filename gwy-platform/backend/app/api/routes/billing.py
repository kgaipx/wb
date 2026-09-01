"""计费 / 退费路由（WBS 5.1 无忧退费 / WBS 7.1 会员体系）。

支付生命周期（生产形态）：
- 下单：创建 pending 订单，返回收银台/沙箱支付入口，此时尚未开通会员。
- 支付成功：由支付回调 /notify（微信、支付宝等）、沙箱模拟 /pay/sandbox、或管理员手动激活
  /admin/activate 触发，订单置 paid 并开通会员权益（plan + 到期时间）。
- 退费：request_refund 进入 refunding → 审批（admin decide）→ refunded，会员权益同步收回。

沙箱模式（PAYMENT_SANDBOX=True，默认）下，/pay/sandbox 可模拟成功支付、退费即时审批，
便于自托管演示；接真实支付时置 PAYMENT_SANDBOX=False 并配置 PAYMENT_NOTIFY_SECRET。
"""
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.routes.auth import get_current_user, require_admin
from app.core.config import settings
from app.db.session import get_db
from app.models import Order, RefundRequest, User
from app.schemas.billing import OrderIn, OrderOut, RefundIn, RefundOut
from app.services.billing import compute_refund
from app.services.notification_service import create_notification, NOTIF_MEMBERSHIP_ACTIVATED

router = APIRouter()

_PRICE = {"pro": 9900, "pro_year": 99000}  # 单位：分（¥99 / ¥990）
_MEMBER_DAYS = {"pro": 30, "pro_year": 365}


def _grant_membership(user: User, plan: str) -> None:
    """开通 / 续费会员：设置等级与到期时间（不提交，由调用方统一 commit）。

    续费逻辑：若当前仍在会员有效期内，则在现有到期日基础上顺延；
    若已过期（或首次开通），从当前时间起算，避免损失剩余天数。
    """
    days = _MEMBER_DAYS[plan]
    now = datetime.now(timezone.utc)
    base = now
    if user.plan_expires_at is not None:
        exp = user.plan_expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp > now:
            base = exp  # 未过期：在现有到期日上顺延
    user.plan = plan
    user.plan_expires_at = base + timedelta(days=days)


def _revoke_membership(user: User) -> None:
    """收回会员：降级为 free 并清空到期时间（不提交）。"""
    user.plan = "free"
    user.plan_expires_at = None


def _mark_paid(order: Order, db: Session, method: str | None = None) -> None:
    """订单置 paid 并开通会员（幂等）。"""
    if order.status == "paid":
        return
    order.status = "paid"
    order.paid_at = datetime.now(timezone.utc)
    if method:
        order.payment_method = method
    user = db.get(User, order.user_id)
    _grant_membership(user, order.plan)
    create_notification(
        db, user.id, NOTIF_MEMBERSHIP_ACTIVATED,
        "🎉 会员已开通", "会员权益已生效，去解锁全部功能", None,
    )
    db.commit()


# 会员套餐目录（WBS 7.1）：透明定价 + 权益清单，供会员中心页直接渲染
_PLANS = [
    {
        "id": "free",
        "name": "免费版",
        "price": 0,
        "period": "永久",
        "tagline": "先体验核心能力",
        "benefits": [
            "题库刷题与错题本",
            "AI 逐题讲解（每日限量）",
            "生成 7 天学习计划",
            "内容双签可信保障",
        ],
        "highlight": False,
    },
    {
        "id": "pro",
        "name": "会员月卡",
        "price": 9900,
        "period": "月",
        "tagline": "私教全程陪跑",
        "benefits": [
            "无限次 AI 私教对话（历史可回溯）",
            "申论 AI 批改 + 人工复核兜底",
            "自适应弱项推送与复错率追踪",
            "学习计划打卡与连续打卡激励",
            "全部免费版权益",
        ],
        "highlight": True,
    },
    {
        "id": "pro_year",
        "name": "会员年卡",
        "price": 99000,
        "period": "年",
        "tagline": "折合 ¥82.5/月，立省 ¥198",
        "benefits": [
            "会员月卡全部权益",
            "折合每月仅 ¥82.5，较月卡省 16.7%",
            "优先客服与功能抢先体验",
        ],
        "highlight": False,
    },
]

_REFUND_POLICY = (
    "无忧退费：开通后 7 日内全额退；8–30 日内退 50%；超期转人工评估。"
    "退费申请通过后 3 个工作日内到账，进度全程可查。"
)


@router.post("/orders", response_model=OrderOut, status_code=201)
def create_order(
    payload: OrderIn, current: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """创建订单（pending）。返回收银台/沙箱支付入口；支付成功后才开通会员。"""
    if payload.plan not in _PRICE:
        raise HTTPException(status_code=400, detail="未知套餐")
    method = payload.payment_method or ("sandbox" if settings.PAYMENT_SANDBOX else "manual")
    order = Order(
        user_id=current.id,
        plan=payload.plan,
        amount=_PRICE[payload.plan],
        currency="CNY",
        status="pending",
        payment_method=method,
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    # 支付入口：沙箱模式下提供可点击的模拟支付链接；非沙箱需配置真实网关
    # PAYMENT_GATEWAY_URL/MCH_ID/KEY，否则返回 503 避免前端拿到一个坏链接。
    if settings.PAYMENT_SANDBOX:
        pay_url = f"/api/billing/pay/sandbox/{order.id}"
    else:
        if not (settings.PAYMENT_GATEWAY_URL and settings.PAYMENT_MCH_ID and settings.PAYMENT_KEY):
            raise HTTPException(
                status_code=503,
                detail="真实支付网关未配置（PAYMENT_GATEWAY_URL / PAYMENT_MCH_ID / PAYMENT_KEY），请先在 .env 配齐或临时开启 PAYMENT_SANDBOX 演示模式。",
            )
        pay_url = _build_gateway_pay_url(order, current)
    out = OrderOut.model_validate(order, from_attributes=True)
    out.pay_url = pay_url
    return out


def _build_gateway_pay_url(order: Order, user: User) -> str:
    """拼接带 HMAC-SHA256 签名的真实网关支付跳转 URL。

    签名规范：按 mch_id + out_trade_no + amount + plan + user_id 字典序拼串后用 PAYMENT_KEY
    做 HMAC-SHA256。不同 provider（微信、支付宝、银联）签名要素各异；接入时按 provider 文档
    替换 canonical 串的字段顺序与命名即可，骨架一致。"""
    params = {
        "mch_id": settings.PAYMENT_MCH_ID,
        "out_trade_no": str(order.id),
        "amount": str(order.amount),
        "plan": order.plan,
        "user_id": str(user.id),
    }
    canonical = "&".join(f"{k}={params[k]}" for k in sorted(params))
    sign = hmac.new(settings.PAYMENT_KEY.encode("utf-8"), canonical.encode("utf-8"), hashlib.sha256).hexdigest()
    qs = "&".join(f"{k}={v}" for k, v in params.items()) + f"&sign={sign}"
    sep = "&" if "?" in settings.PAYMENT_GATEWAY_URL else "?"
    logging.getLogger(__name__).info("create_order: build pay_url for order=%s user=%s", order.id, user.id)
    return f"{settings.PAYMENT_GATEWAY_URL}{sep}{qs}"


@router.post("/pay/sandbox/{order_id}", response_model=OrderOut)
def pay_sandbox(
    order_id: int,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """沙箱模拟支付成功：仅 PAYMENT_SANDBOX=True 时可用，订单置 paid 并开通会员。

    生产接入真实支付后此端点应禁用（配置置 False），由 provider 回调 /pay/notify 触发。
    """
    if not settings.PAYMENT_SANDBOX:
        raise HTTPException(status_code=400, detail="当前未开启沙箱支付")
    order = db.get(Order, order_id)
    if order is None or order.user_id != current.id:
        raise HTTPException(status_code=404, detail="订单不存在")
    _mark_paid(order, db, method="sandbox")
    return OrderOut.model_validate(order, from_attributes=True)


@router.post("/pay/notify", response_model=OrderOut)
def pay_notify(
    payload: dict,
    db: Session = Depends(get_db),
):
    """支付成功回调（微信/支付宝 provider 调用）。

    安全（fail-closed）：本端点无登录态，任何人都能 POST 一个 order_id 把订单置为已支付，
    因此必须验真：
    - 配置了 PAYMENT_NOTIFY_SECRET：要求请求体 notify_token 与之匹配，否则 403；
    - 非沙箱（真实支付）却未配置该令牌：**直接拒绝**（503），而不是放行 ——
      否则任何人都能伪造支付成功白嫖会员（此前正是这个漏洞）。
    沙箱演示模式未配置令牌时保持可用，便于本地/自托管联调。
    """
    if settings.PAYMENT_NOTIFY_SECRET:
        token = (payload or {}).get("notify_token")
        if token != settings.PAYMENT_NOTIFY_SECRET:
            raise HTTPException(status_code=403, detail="通知令牌无效")
    elif not settings.PAYMENT_SANDBOX:
        raise HTTPException(
            status_code=503,
            detail="支付回调未配置 PAYMENT_NOTIFY_SECRET，已拒绝（防伪造支付成功白嫖会员）。请在 .env 配置该令牌后重试。",
        )
    out_trade_no = (payload or {}).get("out_trade_no") or (payload or {}).get("order_id")
    if not out_trade_no:
        raise HTTPException(status_code=400, detail="缺少订单标识")
    q = db.query(Order)
    if str(out_trade_no).isdigit():
        q = q.filter(
            (Order.out_trade_no == str(out_trade_no)) | (Order.id == int(out_trade_no))
        )
    else:
        q = q.filter(Order.out_trade_no == str(out_trade_no))
    order = q.first()
    if order is None:
        raise HTTPException(status_code=404, detail="订单不存在")
    _mark_paid(order, db, method=payload.get("method", "wechat"))
    return OrderOut.model_validate(order, from_attributes=True)


@router.post("/admin/activate/{order_id}", response_model=OrderOut)
def admin_activate(
    order_id: int,
    current: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """管理员手动激活订单（兜底）：订单置 paid 并开通会员。需 admin 角色。"""
    order = db.get(Order, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="订单不存在")
    _mark_paid(order, db, method="manual")
    return OrderOut.model_validate(order, from_attributes=True)


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
    refund = RefundRequest(
        user_id=current.id,
        order_id=order.id,
        amount=amount,
        reason=payload.reason,
        status="pending",  # refunding → 审批 → refunded
    )
    order.status = "refunding"
    db.add(refund)
    db.commit()
    db.refresh(refund)

    # 沙箱模式：退费即时审批通过（便于演示）；生产环境由管理员在后台决定。
    if settings.PAYMENT_SANDBOX:
        refund.status = "refunded"
        refund.decided_at = datetime.now(timezone.utc)
        order.status = "refunded"
        user = db.get(User, order.user_id)
        _revoke_membership(user)
        db.commit()
        db.refresh(refund)
    return RefundOut.model_validate(refund)


@router.post("/admin/refund/{refund_id}", response_model=RefundOut)
def admin_refund_decide(
    refund_id: int,
    payload: dict,
    current: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """管理员审批退费：approved 退费并收回会员；rejected 驳回。需 admin 角色。"""
    refund = db.get(RefundRequest, refund_id)
    if refund is None:
        raise HTTPException(status_code=404, detail="退费申请不存在")
    if refund.status != "pending":
        raise HTTPException(status_code=400, detail=f"已处理：{refund.status}")
    approved = bool(payload.get("approved"))
    refund.status = "refunded" if approved else "rejected"
    refund.decided_at = datetime.now(timezone.utc)
    order = db.get(Order, refund.order_id)
    if approved and order is not None:
        order.status = "refunded"
        user = db.get(User, order.user_id)
        _revoke_membership(user)
    elif order is not None:
        order.status = "paid"  # 驳回则维持已支付
    db.commit()
    db.refresh(refund)
    return RefundOut.model_validate(refund)


@router.get("/me", tags=["billing"])
def my_billing(current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    orders = db.query(Order).filter(Order.user_id == current.id).all()
    refunds = db.query(RefundRequest).filter(RefundRequest.user_id == current.id).all()
    return {
        "plan": current.plan,
        "plan_expires_at": current.plan_expires_at.isoformat() if current.plan_expires_at else None,
        "orders": [OrderOut.model_validate(o).model_dump() for o in orders],
        "refunds": [RefundOut.model_validate(r).model_dump() for r in refunds],
    }


@router.get("/plans", tags=["billing"])
def plan_catalog():
    """会员套餐目录（透明定价 + 权益清单 + 退费规则），供会员中心页渲染。"""
    return {
        "plans": _PLANS,
        "currency": "CNY",
        "refund_policy": _REFUND_POLICY,
    }

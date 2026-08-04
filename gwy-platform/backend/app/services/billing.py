"""退费规则服务（WBS 5.1 无忧退费 / WBS 7.1 透明定价）。

规则透明、可解释，不玩文字游戏（直接回应中公退费灾难）：
- 付款后 7 个自然日内：全额退。
- 8–30 日内：退未消耗部分的 50%（演示按订单金额计）。
- 超过 30 日：不予自动退，转人工评估。
返回 (退款金额分, 规则说明)。
"""
from datetime import datetime, timezone


def compute_refund(order, now: datetime | None = None) -> tuple[int, str]:
    # 统一为 naive UTC：库读出的 DateTime 在 SQLite/无时区列下会丢失 tzinfo
    if now is None:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
    paid = order.paid_at or order.created_at
    if paid.tzinfo is not None:
        paid = paid.replace(tzinfo=None)
    days = (now - paid).days

    if days <= 7:
        return order.amount, "付款后 7 日内，全额退款。"
    if days <= 30:
        half = order.amount // 2
        return half, "付款后 8–30 日，退还未消耗部分的 50%。"
    return 0, "超过 30 日，需人工评估，暂不支持自动退。"

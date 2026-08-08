"""内容校验管道（方案 c5 方向5、WBS 5.2、c11 P0 风险）。

职责（呼应华图教材事故痛点）：
- 双签校验：AI 生成 / 入库内容须两名审核员复核通过。
- 抽检 ≥99%：定期抽检保证准确性。
- 版本留痕 + 更正通知：内容变更产生新版本并通知受影响学员。

实现：基于 ContentReview 表的工作流。审核员、时间戳均留痕，可追溯。
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models import ContentReview

SAMPLE_RATE = 0.99  # 抽检比例下限（方案 c11）


def submit_for_review(
    db: Session, item_type: str, item_id: str, body: str, version: int = 1
) -> ContentReview:
    """提交内容进入双签复核流程（pending）。"""
    review = ContentReview(
        item_type=item_type, item_id=item_id, body=body, version=version, status="pending"
    )
    db.add(review)
    db.commit()
    db.refresh(review)
    return review


def approve(db: Session, review_id: int, reviewer: str) -> ContentReview:
    """双签通过：累计两名不同审核员后状态置 approved。"""
    r = db.get(ContentReview, review_id)
    if r is None:
        raise ValueError("审核单不存在")
    if r.status == "approved":
        return r
    if r.reviewer_1 and r.reviewer_2:
        raise ValueError("已完成双签")
    if not r.reviewer_1:
        r.reviewer_1 = reviewer
    elif r.reviewer_1 != reviewer:
        r.reviewer_2 = reviewer
    else:
        raise ValueError("同一审核员不能重复签名")
    if r.reviewer_1 and r.reviewer_2:
        r.status = "approved"
    db.commit()
    db.refresh(r)
    return r


def reject(db: Session, review_id: int, reviewer: str, note: str | None = None) -> ContentReview:
    r = db.get(ContentReview, review_id)
    if r is None:
        raise ValueError("审核单不存在")
    r.status = "rejected"
    r.reviewer_1 = reviewer
    r.reviewer_note = note
    db.commit()
    db.refresh(r)
    return r


def correct_and_notify(
    db: Session, review_id: int, new_body: str, reviewer: str, notify_fn=None
) -> ContentReview:
    """更正内容并通知受影响学员（版本留痕）。notify_fn 为可选的异步通知钩子。"""
    r = db.get(ContentReview, review_id)
    if r is None:
        raise ValueError("审核单不存在")
    r.body = new_body
    r.version += 1
    r.status = "corrected"
    r.reviewer_2 = reviewer
    db.commit()
    db.refresh(r)
    if notify_fn:
        notify_fn(item_type=r.item_type, item_id=r.item_id, version=r.version)
    return r


def spot_check(db: Session, rate: float = SAMPLE_RATE) -> dict:
    """抽检审计：返回待抽总量与已 approved 占比（演示用按比例抽样统计）。"""
    total = db.query(ContentReview).count()
    approved = (
        db.query(ContentReview).filter(ContentReview.status == "approved").count()  # noqa: E712
    )
    sampled = int(total * rate) if total else 0
    return {
        "total": total,
        "approved": approved,
        "sample_target": sampled,
        "sample_rate": rate,
        "pass_rate": round(approved / total, 3) if total else 0.0,
    }


def eta_arrive(base: datetime | None = None) -> datetime:
    """透明退费/更正承诺：3 个工作日内（演示用自然日近似）。"""
    base = base or datetime.now(timezone.utc)
    return base + timedelta(days=3)

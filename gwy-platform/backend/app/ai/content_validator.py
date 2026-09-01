"""内容校验管道（方案 c5 方向5、WBS 5.2、c11 P0 风险）。

职责（呼应华图教材事故痛点）：
- 双签校验：AI 生成 / 入库内容须两名审核员复核通过。
- 抽检 ≥99%：定期抽检保证准确性。
- 版本留痕 + 更正通知：内容变更产生新版本并通知受影响学员。

实现：基于 ContentReview 表的工作流 + ContentReviewLog append-only 日志表。
每一步操作（submit/approve/reject/correct）均记录审核员、时间、备注，可追溯。
reject / correct 永不覆盖已有 reviewer_1 / reviewer_2 —— 保留甲/乙签原始署名。
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models import ContentReview, ContentReviewLog

SAMPLE_RATE = 0.99  # 抽检比例下限（方案 c11）


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _append_log(db: Session, review_id: int, action: str, actor: str, note: str | None = None) -> None:
    """append-only 操作日志：每一步审核动作留痕，绝不修改既有记录。"""
    db.add(ContentReviewLog(review_id=review_id, action=action, actor=actor, note=note))


def submit_for_review(
    db: Session, item_type: str, item_id: str, body: str, version: int = 1
) -> ContentReview:
    """提交内容进入双签复核流程（pending）。"""
    review = ContentReview(
        item_type=item_type, item_id=item_id, body=body, version=version, status="pending"
    )
    db.add(review)
    db.flush()
    _append_log(db, review.id, "submit", actor=item_id, note=None)
    db.commit()
    db.refresh(review)
    return review


def approve(db: Session, review_id: int, reviewer: str) -> ContentReview:
    """双签通过：累计两名不同审核员后状态置 approved；同时记录甲/乙签时间戳。"""
    r = db.get(ContentReview, review_id)
    if r is None:
        raise ValueError("审核单不存在")
    if r.status == "approved":
        return r
    if r.reviewer_1 and r.reviewer_2:
        raise ValueError("已完成双签")
    if not r.reviewer_1:
        r.reviewer_1 = reviewer
        r.reviewer_1_at = _now()
    elif r.reviewer_1 != reviewer:
        r.reviewer_2 = reviewer
        r.reviewer_2_at = _now()
    else:
        raise ValueError("同一审核员不能重复签名")
    if r.reviewer_1 and r.reviewer_2:
        r.status = "approved"
    _append_log(db, r.id, "approve", actor=reviewer)
    db.commit()
    db.refresh(r)
    return r


def reject(db: Session, review_id: int, reviewer: str, note: str | None = None) -> ContentReview:
    """驳回：仅追加日志 + 写入 reviewer_note，绝不覆盖已有 reviewer_1/reviewer_2。

    这是修复的关键 —— 旧实现会 r.reviewer_1 = reviewer 覆盖甲签，破坏双签留痕。
    现在驳回人通过日志 + note 留痕，原甲/乙签原样保留以备回溯。
    """
    r = db.get(ContentReview, review_id)
    if r is None:
        raise ValueError("审核单不存在")
    r.status = "rejected"
    r.reviewer_note = note
    _append_log(db, r.id, "reject", actor=reviewer, note=note)
    db.commit()
    db.refresh(r)
    return r


def correct_and_notify(
    db: Session, review_id: int, new_body: str, reviewer: str, notify_fn=None
) -> ContentReview:
    """更正内容并通知受影响学员（版本留痕）。

    绝不再 r.reviewer_2 = reviewer 覆盖乙签；更正人通过日志 + version 自增留痕。
    notify_fn 为可选的异步通知钩子。
    """
    r = db.get(ContentReview, review_id)
    if r is None:
        raise ValueError("审核单不存在")
    r.body = new_body
    r.version += 1
    r.status = "corrected"
    _append_log(db, r.id, "correct", actor=reviewer, note=f"v{r.version}")
    db.commit()
    db.refresh(r)
    if notify_fn:
        notify_fn(item_type=r.item_type, item_id=r.item_id, version=r.version)
    return r


def spot_check(db: Session, rate: float = SAMPLE_RATE, sample_size: int = 5) -> dict:
    """抽检审计：返回待抽总量与已 approved 占比 + 随机样本（可操作的抽检队列）。

    旧版只返回统计数字（pass_rate），新版附加随机 N 条已通过项作为实际复检对象，
    支撑审核员的二次抽样核验（c11 风险："看似通过实则漏检"的可操作闭环）。
    """
    import random

    total = db.query(ContentReview).count()
    approved = (
        db.query(ContentReview).filter(ContentReview.status == "approved").count()  # noqa: E712
    )
    sampled = int(total * rate) if total else 0
    # 抽取 sample_size 条供二次复检；总数不足时全量返回
    rows = (
        db.query(ContentReview)
        .filter(ContentReview.status == "approved")
        .all()
    )
    pool = list(rows)
    random.shuffle(pool)
    picked = pool[: max(1, min(sample_size, len(pool))) ] if pool else []
    samples = [
        {
            "review_id": x.id,
            "item_type": x.item_type,
            "item_id": x.item_id,
            "reviewer_1": x.reviewer_1,
            "reviewer_2": x.reviewer_2,
            "reviewer_1_at": x.reviewer_1_at.isoformat() if x.reviewer_1_at else None,
            "reviewer_2_at": x.reviewer_2_at.isoformat() if x.reviewer_2_at else None,
            "created_at": x.created_at.isoformat() if x.created_at else None,
        }
        for x in picked
    ]
    return {
        "total": total,
        "approved": approved,
        "sample_target": sampled,
        "sample_rate": rate,
        "pass_rate": round(approved / total, 3) if total else 0.0,
        "sample_size": len(samples),
        "samples": samples,
    }


def eta_arrive(base: datetime | None = None) -> datetime:
    """透明退费/更正承诺：3 个工作日内（演示用自然日近似）。"""
    base = base or datetime.now(timezone.utc)
    return base + timedelta(days=3)

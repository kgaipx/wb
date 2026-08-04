"""内容审核路由（WBS 5.2 双签校验 / c11 P0 风险）。

提交审核 → 双签通过 / 驳回 / 更正通知。所有操作留痕，支撑「信任保障」方向。
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.ai.content_validator import (
    approve,
    correct_and_notify,
    reject,
    spot_check,
    submit_for_review,
)
from app.api.routes.auth import get_current_user
from app.db.session import get_db
from app.models import ContentReview, User
from app.schemas.content import (
    ReviewApproveIn,
    ReviewCorrectIn,
    ReviewOut,
    ReviewRejectIn,
    ReviewSubmitIn,
)

router = APIRouter()


@router.post("/review/submit", response_model=ReviewOut, status_code=201)
def submit(payload: ReviewSubmitIn, current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = submit_for_review(db, payload.item_type, payload.item_id, payload.body, payload.version)
    return r


@router.post("/review/{review_id}/approve", response_model=ReviewOut)
def do_approve(review_id: int, payload: ReviewApproveIn, db: Session = Depends(get_db)):
    try:
        r = approve(db, review_id, payload.reviewer)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return r


@router.post("/review/{review_id}/reject", response_model=ReviewOut)
def do_reject(review_id: int, payload: ReviewRejectIn, db: Session = Depends(get_db)):
    try:
        r = reject(db, review_id, payload.reviewer, payload.note)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return r


@router.post("/review/{review_id}/correct", response_model=ReviewOut)
def do_correct(review_id: int, payload: ReviewCorrectIn, db: Session = Depends(get_db)):
    try:
        r = correct_and_notify(db, review_id, payload.new_body, payload.reviewer)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return r


@router.get("/review/pending", response_model=list[ReviewOut])
def pending(db: Session = Depends(get_db)):
    return db.query(ContentReview).filter(ContentReview.status == "pending").all()  # noqa: E712


@router.get("/review/spot-check", tags=["content"])
def spotcheck(db: Session = Depends(get_db)):
    return spot_check(db)

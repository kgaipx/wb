"""内容审核路由（WBS 5.2 双签校验 / c11 P0 风险）。

提交审核 → 双签通过 / 驳回 / 更正通知。所有操作留痕，支撑「信任保障」方向。

安全：送审任意登录用户可操作；approve / reject / correct / pending / spot-check
等敏感审核动作须 reviewer / admin 角色（服务端以登录用户身份签名，杜绝伪造）。
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.ai.content_validator import (
    approve,
    correct_and_notify,
    reject,
    spot_check,
    submit_for_review,
)
from app.api.routes.auth import get_current_user, require_reviewer
from app.db.session import get_db
from app.models import (
    ContentReview,
    ContentReviewLog,
    Question,
    QuestionAuditAction,
    User,
)
from app.services.auto_review import auto_scan
from app.schemas.content import (
    AuditActionOut,
    AutoActionIn,
    QuestionOptionOut,
    QuestionReviewOut,
    QuestionReviewStats,
    ReviewApproveIn,
    ReviewCorrectIn,
    ReviewLogOut,
    ReviewOut,
    ReviewRejectIn,
    ReviewSubmitIn,
)

router = APIRouter()


def _reviewer_name(user: User) -> str:
    """审核员身份以服务端登录用户为准，杜绝请求体伪造签名。"""
    return user.nickname or user.email


@router.post("/review/submit", response_model=ReviewOut, status_code=201)
def submit(payload: ReviewSubmitIn, current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """学员/编辑报送新内容进入双签复核（信任保障闭环的入口；任意登录用户可报送）。"""
    item_id = payload.item_id or f"draft-{current.id}-{int(__import__('time').time() * 1000)}"
    r = submit_for_review(db, payload.item_type, item_id, payload.body, payload.version)
    return r


@router.post("/review/{review_id}/approve", response_model=ReviewOut)
def do_approve(
    review_id: int,
    payload: ReviewApproveIn,
    current: User = Depends(require_reviewer),
    db: Session = Depends(get_db),
):
    try:
        r = approve(db, review_id, _reviewer_name(current))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return r


@router.post("/review/{review_id}/reject", response_model=ReviewOut)
def do_reject(
    review_id: int,
    payload: ReviewRejectIn,
    current: User = Depends(require_reviewer),
    db: Session = Depends(get_db),
):
    try:
        r = reject(db, review_id, _reviewer_name(current), payload.note)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return r


@router.post("/review/{review_id}/correct", response_model=ReviewOut)
def do_correct(
    review_id: int,
    payload: ReviewCorrectIn,
    current: User = Depends(require_reviewer),
    db: Session = Depends(get_db),
):
    try:
        r = correct_and_notify(db, review_id, payload.new_body, _reviewer_name(current))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return r


@router.get("/review/pending", response_model=list[ReviewOut])
def pending(current: User = Depends(require_reviewer), db: Session = Depends(get_db)):
    return db.query(ContentReview).filter(ContentReview.status == "pending").all()  # noqa: E712


@router.get("/review/spot-check", tags=["content"])
def spotcheck(current: User = Depends(require_reviewer), db: Session = Depends(get_db)):
    return spot_check(db)


@router.get("/review/auto-scan", tags=["content"])
def auto_scan_endpoint(
    subject: str | None = None,
    source: str | None = None,
    limit: int = 200,
    current: User = Depends(require_reviewer),
    db: Session = Depends(get_db),
):
    """程序自动识别审核：对题库做规则初筛，输出可疑题清单与类型统计。

    不自动改库/不自动置 verified —— 识别结果只用于给管理员排序待审队列，
    可疑题优先人工双签复核（信任保障闭环的自动化前置）。
    """
    return auto_scan(db, subject=subject, source=source, limit=max(1, min(limit, 1000)))


@router.post("/review/auto-action", tags=["content"])
def auto_action(
    payload: AutoActionIn,
    current: User = Depends(require_reviewer),
    db: Session = Depends(get_db),
):
    """可疑题处置（工作台）：对一批题目执行 fixed / voided / ignored。

    - 每条处置写入 question_audit_actions 留痕（谁、何时、处置了什么、备注）
    - 题目 audit_status 置为对应状态；扫描器将自动跳过已处置题
    - action=fixed 且传 answer 时，同时修正题目的答案字段
    """
    if not payload.question_ids:
        raise HTTPException(status_code=400, detail="question_ids 不能为空")
    ids = list(set(payload.question_ids))
    qs = db.query(Question).filter(Question.id.in_(ids)).all()
    if len(qs) != len(ids):
        raise HTTPException(status_code=400, detail="部分题目不存在")

    actor = current.email or current.nickname or str(current.id)
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    for q in qs:
        db.add(
            QuestionAuditAction(
                question_id=q.id,
                action=payload.action,
                note=payload.note,
                actor=actor,
                created_at=now,
            )
        )
        q.audit_status = payload.action
        if payload.action == "fixed" and payload.answer is not None:
            q.answer = payload.answer
    db.commit()
    return {"processed": len(qs), "action": payload.action}


class AiFillExplanationsIn(BaseModel):
    limit: int = 10  # 单批题数（后端上限 100，并发下约 30~60s/批）
    subject: str | None = None  # 可选：限定科目
    concurrency: int = 4  # LLM 并发数（上限 8）


@router.post("/review/ai-fill-explanations", tags=["content"])
def ai_fill_explanations_endpoint(
    payload: AiFillExplanationsIn,
    current: User = Depends(require_reviewer),
    db: Session = Depends(get_db),
):
    """AI 批量补解析（P2 内容质量）：对缺解析题调 LLM 生成解析并写库。

    - 只处理 explanation 为空且未作废的题；每题写入 question_audit_actions（ai_filled）留痕
    - LLM 调用并发（concurrency，默认 4），写库串行逐题提交：单题失败不丢前面成果
    - 单批上限 100；前端循环调用直到 remaining=0 即可完成全量补齐
    """
    from app.services.auto_review import ai_fill_explanations

    actor = current.email or current.nickname or str(current.id)
    return ai_fill_explanations(
        db,
        limit=payload.limit,
        subject=payload.subject,
        actor=actor,
        concurrency=payload.concurrency,
    )


@router.get("/review/audit-actions", response_model=list[AuditActionOut], tags=["content"])
def audit_actions(
    limit: int = 50,
    current: User = Depends(require_reviewer),
    db: Session = Depends(get_db),
):
    """最近处置留痕（工作台右侧历史列表）。"""
    rows = (
        db.query(QuestionAuditAction)
        .order_by(QuestionAuditAction.id.desc())
        .limit(max(1, min(limit, 200)))
        .all()
    )
    return rows


@router.get("/review/{review_id}/logs", response_model=list[ReviewLogOut])
def review_logs(
    review_id: int,
    current: User = Depends(require_reviewer),
    db: Session = Depends(get_db),
):
    """双签复核完整审计日志：按时间正序返回 submit/approve/reject/correct 全部动作。

    替代旧实现中只能从 ContentReview 单行倒推的局面 —— 现在每次动作都被单独记录，
    含操作人 / 备注 / 时间戳，回溯任一时刻都不会丢信息。
    """
    rows = (
        db.query(ContentReviewLog)
        .filter(ContentReviewLog.review_id == review_id)
        .order_by(ContentReviewLog.id.asc())
        .all()
    )
    return rows


# ---------------------------------------------------------------------------
# 题库审核：把 is_verified=False 的导入题接入双签闭环（信任保障链路补全）。
# 复用 ContentReview 双签状态机（item_type='question'）；双签通过时翻转
# Question.is_verified=True —— 此前 approve() 只改审核单、未翻转题目，是缺口。
# ---------------------------------------------------------------------------


def _q_review_or_create(db: Session, q: Question) -> ContentReview:
    r = (
        db.query(ContentReview)
        .filter(ContentReview.item_type == "question", ContentReview.item_id == str(q.id))
        .first()
    )
    if r is None:
        r = ContentReview(
            item_type="question", item_id=str(q.id), body=q.stem or "", version=1, status="pending"
        )
        db.add(r)
        db.flush()
    return r


def _to_qreview(q: Question, r: ContentReview | None) -> QuestionReviewOut:
    status = r.status if r is not None else "none"
    return QuestionReviewOut(
        review_id=r.id if r is not None else None,
        question_id=q.id,
        subject=q.subject,
        category=q.category,
        qtype=q.qtype,
        stem=q.stem,
        options=[
            QuestionOptionOut(label=o.label, content=o.content, is_correct=o.is_correct)
            for o in q.options
        ],
        answer=q.answer,
        knowledge_point=q.knowledge_point,
        source=q.source,
        copyright_owner=q.copyright_owner,
        is_verified=q.is_verified,
        review_status=status,
        reviewer_1=r.reviewer_1 if r is not None else None,
        reviewer_2=r.reviewer_2 if r is not None else None,
    )


@router.get("/review/questions/pending", response_model=list[QuestionReviewOut])
def questions_pending(
    limit: int = 20,
    offset: int = 0,
    current: User = Depends(require_reviewer),
    db: Session = Depends(get_db),
):
    """待核实题库队列（is_verified=False），附带已存在的双签进度。"""
    qs = (
        db.query(Question)
        .filter(Question.is_verified == False)  # noqa: E712
        .order_by(Question.id)
        .limit(limit)
        .offset(offset)
        .all()
    )
    ids = [str(q.id) for q in qs]
    reviews = {
        r.item_id: r
        for r in db.query(ContentReview).filter(
            ContentReview.item_type == "question", ContentReview.item_id.in_(ids)
        )
    }
    return [_to_qreview(q, reviews.get(str(q.id))) for q in qs]


@router.get("/review/questions/stats", response_model=QuestionReviewStats)
def questions_stats(current: User = Depends(require_reviewer), db: Session = Depends(get_db)):
    total = db.query(Question).count()
    verified = db.query(Question).filter(Question.is_verified == True).count()  # noqa: E712
    pending = total - verified
    awaiting_second = (
        db.query(ContentReview)
        .filter(
            ContentReview.item_type == "question",
            ContentReview.status == "pending",
            ContentReview.reviewer_1.isnot(None),
            ContentReview.reviewer_2.is_(None),
        )
        .count()
    )
    return QuestionReviewStats(
        total=total, verified=verified, pending=pending, awaiting_second=awaiting_second
    )


@router.post("/review/questions/{question_id}/sign", response_model=QuestionReviewOut)
def sign_question(
    question_id: int,
    current: User = Depends(require_reviewer),
    db: Session = Depends(get_db),
):
    """甲签 / 乙签：累计两名不同审核员后翻转 Question.is_verified=True。"""
    q = db.get(Question, question_id)
    if q is None:
        raise HTTPException(status_code=404, detail="题目不存在")
    r = _q_review_or_create(db, q)
    try:
        r = approve(db, r.id, _reviewer_name(current))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    # 双签通过 → 题目转正（信任保障闭环的关键一步，此前缺失）
    if r.status == "approved":
        q.is_verified = True
        db.add(q)
    db.commit()
    db.refresh(r)
    return _to_qreview(q, r)


@router.post("/review/questions/{question_id}/reject", response_model=QuestionReviewOut)
def reject_question(
    question_id: int,
    payload: ReviewRejectIn,
    current: User = Depends(require_reviewer),
    db: Session = Depends(get_db),
):
    """驳回：题目保持未核实（is_verified=False），留痕待修正后重报。"""
    q = db.get(Question, question_id)
    if q is None:
        raise HTTPException(status_code=404, detail="题目不存在")
    r = _q_review_or_create(db, q)
    r = reject(db, r.id, _reviewer_name(current), payload.note)
    db.commit()
    db.refresh(r)
    return _to_qreview(q, r)

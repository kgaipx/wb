"""在线模考路由（WBS 4.2 在线模考 + 提分报告）。

/exam/start：按科目组卷（隐藏答案与解析）。
/exam/submit：自动判分、记录作答、更新能力图谱，返回提分报告（正确率 + 薄弱点）。
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.routes.auth import get_current_user
from app.db.session import get_db
from app.models import AbilityProfile, ExamRecord, Question, User, UserAnswer
from app.schemas.exam import ExamRecordDetail, ExamRecordOut
from app.schemas.question import OptionOut
from app.services.scoring import has_correct_option_filter, score_selection

router = APIRouter()


class ExamAnswerItem(BaseModel):
    question_id: int
    selected: str = ""


class ExamSubmit(BaseModel):
    answers: list[ExamAnswerItem]


class ExamStartIn(BaseModel):
    subject: str | None = None
    count: int = 20


@router.post("/start", tags=["exam"])
def start_exam(
    payload: ExamStartIn,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    count = max(1, min(100, payload.count))
    q = db.query(Question).filter(Question.is_verified == True)  # noqa: E712
    q = q.filter(has_correct_option_filter())  # 移出无标准答案的题，避免组到不可判分的卷
    if payload.subject:
        q = q.filter(Question.subject == payload.subject)
    available = q.count()
    questions = q.order_by(Question.id).limit(count).all()
    if not questions:
        raise HTTPException(
            status_code=404,
            detail="该科目暂无可组卷题目，请尝试「全部科目」或选择其他科目",
        )
    # 限时：按题量估算（90 秒/题），作为「限时组卷」的倒计时依据（前端据此自动交卷）
    duration_seconds = count * 90
    return {
        "subject": payload.subject or "全部",
        "count": len(questions),
        "requested": count,
        "available": available,
        "duration_seconds": duration_seconds,
        "paper": [
            {
                "id": q_.id,
                "subject": q_.subject,
                "category": q_.category,
                "qtype": q_.qtype,
                "stem": q_.stem,
                "difficulty": q_.difficulty,
                "knowledge_point": q_.knowledge_point,
                "options": [OptionOut.model_validate(o).model_dump() for o in q_.options],
            }
            for q_ in questions
        ],
    }


@router.post("/submit", tags=["exam"])
def submit_exam(
    payload: ExamSubmit, current: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    total = len(payload.answers)
    correct = 0
    skipped_count = 0
    weak: dict[str, int] = {}
    # 记录各知识点「本次模考前 → 模考后」掌握度，用于报告展示能力变化
    kp_before: dict[str, float] = {}
    kp_after: dict[str, float] = {}
    details = []

    for item in payload.answers:
        q = db.get(Question, item.question_id)
        if q is None:
            continue
        # 未作答（留空）：不写 UserAnswer、不污染能力图谱，仅作"未答"跳过，与 practice 对齐
        if not item.selected:
            skipped_count += 1
            details.append(
                {
                    "question_id": q.id,
                    "is_correct": False,
                    "correct_answer": None,
                    "selected": "",
                    "stem": q.stem,
                    "knowledge_point": q.knowledge_point,
                    "options": [{"label": o.label, "content": o.content} for o in q.options],
                    "skipped": True,
                }
            )
            continue
        correct_labels, is_correct, scorable = score_selection(
            item.selected, q.options, q.qtype
        )
        # 无标准答案：跳过，不计入正确率、不污染薄弱点与能力图谱
        if not scorable:
            skipped_count += 1
            details.append(
                {
                    "question_id": q.id,
                    "is_correct": False,
                    "correct_answer": None,
                    "selected": item.selected,
                    "stem": q.stem,
                    "knowledge_point": q.knowledge_point,
                    "options": [{"label": o.label, "content": o.content} for o in q.options],
                    "skipped": True,
                }
            )
            continue

        db.add(
            UserAnswer(
                user_id=current.id,
                question_id=q.id,
                selected=item.selected,
                is_correct=is_correct,
            )
        )
        if is_correct:
            correct += 1
        else:
            weak[q.knowledge_point] = weak.get(q.knowledge_point, 0) + 1

        # 更新能力图谱（与 practice 一致：掌握度 = 累计正确 / 累计尝试）
        ab = (
            db.query(AbilityProfile)
            .filter(
                AbilityProfile.user_id == current.id,
                AbilityProfile.knowledge_point == q.knowledge_point,
            )
            .first()
        )
        if ab is None:
            ab = AbilityProfile(
                user_id=current.id,
                knowledge_point=q.knowledge_point,
                attempts=0,
                correct=0,
                mastery=0.0,
            )
            db.add(ab)
        # 首次遇到该知识点时，记录模考前的掌握度（即本次模考尚未改动的值）
        if q.knowledge_point not in kp_before:
            kp_before[q.knowledge_point] = ab.mastery
        ab.attempts += 1
        if is_correct:
            ab.correct += 1
        ab.mastery = round(ab.correct / ab.attempts, 3)
        ab.last_practiced = datetime.now(timezone.utc)
        # 每次更新后覆盖记录，循环结束时即为模考后的掌握度
        kp_after[q.knowledge_point] = ab.mastery

        details.append(
            {
                "question_id": q.id,
                "is_correct": is_correct,
                "correct_answer": "".join(correct_labels),
                "selected": item.selected,
                "stem": q.stem,
                "knowledge_point": q.knowledge_point,
                "options": [{"label": o.label, "content": o.content} for o in q.options],
                "skipped": False,
            }
        )

    # 正确率只按"可判分题"计算，跳过的题不计入分母，避免虚低
    scored_total = total - skipped_count
    rate = round(correct / scored_total, 3) if scored_total else 0.0
    top_weak = sorted(weak.items(), key=lambda x: x[1], reverse=True)[:5]
    # 模考科目：取首题科目，混合则记为「全部」
    _subjects = {q.subject for q in (db.get(Question, it.question_id) for it in payload.answers) if q}
    record_subject = next(iter(_subjects)) if len(_subjects) == 1 else "全部"
    kp_mastery = [
        {
            "knowledge_point": kp,
            "before": kp_before[kp],
            "after": kp_after[kp],
            "delta": round(kp_after[kp] - kp_before[kp], 3),
        }
        for kp in kp_before
    ]
    record = ExamRecord(
        user_id=current.id,
        subject=record_subject,
        total=total,
        correct=correct,
        correct_rate=rate,
        weak_points=[k for k, _ in top_weak],
        details=details,
        kp_mastery=kp_mastery,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return {
        "id": record.id,
        "total": total,
        "correct": correct,
        "correct_rate": rate,
        "skipped": skipped_count,
        "weak_points": [k for k, _ in top_weak],
        "details": details,
        "kp_mastery": kp_mastery,
    }


@router.get("/history", response_model=list[ExamRecordOut], tags=["exam"])
def exam_history(
    limit: int = 20, offset: int = 0, current: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """模考历史列表（按时间倒序），支持分页用于复盘与进步追踪。"""
    return (
        db.query(ExamRecord)
        .filter(ExamRecord.user_id == current.id)
        .order_by(ExamRecord.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


@router.get("/history/{record_id}", response_model=ExamRecordDetail, tags=["exam"])
def exam_history_detail(
    record_id: int, current: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """某次模考的逐题明细（含正确答案），支持离线复盘。"""
    rec = db.get(ExamRecord, record_id)
    if rec is None or rec.user_id != current.id:
        raise HTTPException(status_code=404, detail="模考记录不存在")
    return rec


class PredictRecordIn(BaseModel):
    """真题套卷模考（/predict）交卷后写入历史所需的汇总载荷。

    注意：不写 UserAnswer、不更新 AbilityProfile——逐题判分已由前端
    api.practice 完成，这里只落一条汇总 + 逐题快照，使其进入统一
    的「模考历史与趋势」。details 复用 ExamRecordDetail 契约（缺省字段容忍）。
    """

    subject: str = "全部"
    total: int
    correct: int
    correct_rate: float
    weak_points: list[str] = []
    details: list = []


@router.post("/predict-record", tags=["exam"])
def save_predict_record(
    payload: PredictRecordIn,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """真题套卷模考（/predict）交卷后写入模考历史（仅记录汇总与逐题快照，
    不重复写 UserAnswer / 不更新能力图谱），汇入统一的「模考历史与趋势」。"""
    rec = ExamRecord(
        user_id=current.id,
        subject=payload.subject,
        total=payload.total,
        correct=payload.correct,
        correct_rate=payload.correct_rate,
        weak_points=payload.weak_points,
        details=payload.details,
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return {"id": rec.id}


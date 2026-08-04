"""在线模考路由（WBS 4.2 在线模考 + 提分报告）。

/exam/start：按科目组卷（隐藏答案与解析）。
/exam/submit：自动判分、记录作答、更新能力图谱，返回提分报告（正确率 + 薄弱点）。
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.routes.auth import get_current_user
from app.db.session import get_db
from app.models import AbilityProfile, Question, User, UserAnswer
from app.schemas.question import OptionOut

router = APIRouter()


class ExamAnswerItem(BaseModel):
    question_id: int
    selected: str = ""


class ExamSubmit(BaseModel):
    answers: list[ExamAnswerItem]


@router.post("/start", tags=["exam"])
def start_exam(
    subject: str | None = None,
    count: int = Query(20, le=100, ge=1),
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Question).filter(Question.is_verified == True)  # noqa: E712
    if subject:
        q = q.filter(Question.subject == subject)
    questions = q.order_by(Question.id).limit(count).all()
    if not questions:
        raise HTTPException(status_code=404, detail="暂无可组卷题目")
    return {
        "subject": subject or "全部",
        "count": len(questions),
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
    weak: dict[str, int] = {}
    details = []

    for item in payload.answers:
        q = db.get(Question, item.question_id)
        if q is None:
            continue
        correct_labels = [o.label for o in q.options if o.is_correct]
        is_correct = (
            set(item.selected.split()) == set(correct_labels) if q.qtype != "essay" else False
        )
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
            ab = AbilityProfile(user_id=current.id, knowledge_point=q.knowledge_point)
            db.add(ab)
        ab.attempts += 1
        if is_correct:
            ab.correct += 1
        ab.mastery = round(ab.correct / ab.attempts, 3)
        ab.last_practiced = datetime.now(timezone.utc)

        details.append(
            {"question_id": q.id, "is_correct": is_correct, "correct_answer": "".join(correct_labels)}
        )

    db.commit()
    rate = round(correct / total, 3) if total else 0.0
    top_weak = sorted(weak.items(), key=lambda x: x[1], reverse=True)[:5]
    return {
        "total": total,
        "correct": correct,
        "correct_rate": rate,
        "weak_points": [k for k, _ in top_weak],
        "details": details,
    }

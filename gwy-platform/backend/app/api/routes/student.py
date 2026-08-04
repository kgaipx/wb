"""学员中心 / 学情看板路由（方案 c4 方向1 / WBS 2.1）。

/student/me 返回用户画像 + 答题统计 + 能力图谱，是"AI 私教"诊断面板的数据来源。
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.routes.auth import get_current_user
from app.db.session import get_db
from app.models import AbilityProfile, Question, User, UserAnswer
from app.schemas.progress import AbilityOut, StudentDashboard
from app.schemas.question import QuestionOut, WrongItem
from app.schemas.user import UserOut

router = APIRouter()


@router.get("/me", response_model=StudentDashboard)
def dashboard(current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    total = db.query(UserAnswer).filter(UserAnswer.user_id == current.id).count()
    correct = (
        db.query(UserAnswer)
        .filter(UserAnswer.user_id == current.id, UserAnswer.is_correct == True)
        .count()
    )
    rate = round(correct / total, 3) if total else 0.0
    abilities = (
        db.query(AbilityProfile)
        .filter(AbilityProfile.user_id == current.id)
        .order_by(AbilityProfile.mastery)
        .all()
    )
    return StudentDashboard(
        user=UserOut.model_validate(current),
        total_answers=total,
        correct_rate=rate,
        ability=[AbilityOut.model_validate(a) for a in abilities],
    )


@router.get("/ability", response_model=list[AbilityOut])
def ability(current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return (
        db.query(AbilityProfile)
        .filter(AbilityProfile.user_id == current.id)
        .order_by(AbilityProfile.mastery)
        .all()
    )


@router.get("/wrong", response_model=list[WrongItem])
def wrong_questions(current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """待复盘错题列表：仅取尚未复盘（reviewed=False）的错答，且组卷不泄漏正确答案。"""
    sub = (
        db.query(
            UserAnswer.question_id,
            func.count(UserAnswer.id).label("cnt"),
        )
        .filter(
            UserAnswer.user_id == current.id,
            UserAnswer.is_correct == False,  # noqa: E712
            UserAnswer.reviewed == False,  # noqa: E712
        )
        .group_by(UserAnswer.question_id)
        .subquery()
    )
    joined = (
        db.query(Question, sub.c.cnt)
        .join(sub, Question.id == sub.c.question_id)
        .order_by(sub.c.cnt.desc())
        .all()
    )
    items: list[WrongItem] = []
    for q, cnt in joined:
        last = (
            db.query(UserAnswer.selected)
            .filter(
                UserAnswer.user_id == current.id,
                UserAnswer.question_id == q.id,
                UserAnswer.is_correct == False,  # noqa: E712
                UserAnswer.reviewed == False,  # noqa: E712
            )
            .order_by(UserAnswer.submitted_at.desc())
            .first()
        )
        items.append(
            WrongItem(
                question=QuestionOut.model_validate(q),
                wrong_count=cnt,
                last_selected=last.selected if last else None,
            )
        )
    return items


@router.post("/wrong/{qid}/review", response_model=dict)
def review_wrong(qid: int, current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """标记某题最近一次错答为已复盘（错题本移除，驱动复错率下降）。"""
    ans = (
        db.query(UserAnswer)
        .filter(
            UserAnswer.user_id == current.id,
            UserAnswer.question_id == qid,
            UserAnswer.is_correct == False,  # noqa: E712
            UserAnswer.reviewed == False,  # noqa: E712
        )
        .order_by(UserAnswer.submitted_at.desc())
        .first()
    )
    if ans is None:
        raise HTTPException(status_code=404, detail="无待复盘错题")
    ans.reviewed = True
    db.commit()
    return {"ok": True}

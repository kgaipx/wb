"""题库 / 刷题路由（方案 c4 方向2 / WBS 2.2）。

/practice 提交作答后会：①记录 UserAnswer ②更新能力图谱（掌握度 SM-2 简化）③返回判分与解析。
错题复错率、正确率等方案 c12 信号均可由这些数据派生。
"""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.routes.auth import get_current_user
from app.db.session import get_db
from app.models import AbilityProfile, Question, QuestionOption, User, UserAnswer
from app.schemas.question import (
    PracticeResult,
    PracticeSubmit,
    QuestionListItem,
    QuestionOut,
)

router = APIRouter()


@router.get("/questions", response_model=list[QuestionListItem])
def list_questions(
    subject: str | None = None,
    category: str | None = None,
    limit: int = Query(20, le=100, ge=1),
    db: Session = Depends(get_db),
):
    q = db.query(Question)
    if subject:
        q = q.filter(Question.subject == subject)
    if category:
        q = q.filter(Question.category == category)
    return q.order_by(Question.id).limit(limit).all()


@router.get("/questions/{qid}", response_model=QuestionOut)
def get_question(qid: int, db: Session = Depends(get_db)):
    q = db.get(Question, qid)
    if q is None:
        raise HTTPException(status_code=404, detail="题目不存在")
    return q


@router.post("/practice", response_model=PracticeResult)
def practice(
    payload: PracticeSubmit,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.get(Question, payload.question_id)
    if q is None:
        raise HTTPException(status_code=404, detail="题目不存在")

    # 客观题判分：用户选择集合 vs 正确选项标签集合
    correct_labels = [o.label for o in q.options if o.is_correct]
    if q.qtype == "essay":
        is_correct = False  # essay 由 WBS 4.1 申论批改引擎判分
    else:
        is_correct = set(payload.selected.split()) == set(correct_labels)

    db.add(
        UserAnswer(
            user_id=current.id,
            question_id=q.id,
            selected=payload.selected,
            is_correct=is_correct,
        )
    )

    # 更新能力图谱（SM-2 简化：掌握度 = 累计正确 / 累计尝试）
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
    ab.attempts += 1
    if is_correct:
        ab.correct += 1
    ab.mastery = round(ab.correct / ab.attempts, 3)
    ab.last_practiced = datetime.now(timezone.utc)

    db.commit()
    return PracticeResult(
        question_id=q.id,
        is_correct=is_correct,
        correct_answer="".join(correct_labels),
        explanation=q.explanation,
        mastery=ab.mastery,
    )

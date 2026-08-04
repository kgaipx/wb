"""AI 能力路由（WBS 3.1 私教讲解 / 3.2 自适应推荐 / 4.1 申论批改）。

所有端点均受 get_current_user 保护；LLM 调用失败时由能力层降级（见 essay_grader 回退）。
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.ai.adaptive import recommend_questions
from app.ai.essay_grader import EssayGrader
from app.ai.study_planner import generate_plan
from app.ai.tutor_agent import TutorAgent
from app.api.routes.auth import get_current_user
from app.db.session import get_db
from app.models import AbilityProfile, Question, User
from app.schemas.ai import (
    ChatIn,
    ChatOut,
    EssayGradeIn,
    EssayGradeOut,
    ExplainIn,
    ExplainOut,
    PlanIn,
    PlanOut,
    RecommendOut,
)

router = APIRouter()


@router.post("/explain", response_model=ExplainOut)
def explain(payload: ExplainIn, current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    q = db.get(Question, payload.question_id)
    if q is None:
        raise HTTPException(status_code=404, detail="题目不存在")
    tutor = TutorAgent()
    return ExplainOut(**tutor.explain_question(q, payload.selected))


@router.get("/recommend", response_model=RecommendOut)
def recommend(top_n: int = 10, current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    abilities = (
        db.query(AbilityProfile).filter(AbilityProfile.user_id == current.id).all()
    )
    from app.ai.tutor_agent import TutorAgent

    weak = TutorAgent.diagnose_mistakes(abilities)
    questions = recommend_questions(db, current.id, top_n=top_n)
    return RecommendOut(
        knowledge_points=weak,
        questions=[
            {
                "id": q.id,
                "subject": q.subject,
                "category": q.category,
                "stem": q.stem,
                "knowledge_point": q.knowledge_point,
                "difficulty": q.difficulty,
            }
            for q in questions
        ],
    )


@router.post("/chat", response_model=ChatOut)
def chat(payload: ChatIn, current: User = Depends(get_current_user)):
    tutor = TutorAgent()
    return ChatOut(**tutor.chat(payload.messages, payload.kp_hint))


@router.post("/essay-grade", response_model=EssayGradeOut)
def essay_grade(payload: EssayGradeIn, current: User = Depends(get_current_user)):
    grader = EssayGrader()
    score = grader.grade(payload.essay_text, payload.prompt_material, max_score=payload.max_score)
    return EssayGradeOut(
        total=score.total,
        dimensions=score.dimensions,
        needs_human_review=score.needs_human_review,
        rationale=score.rationale,
    )


@router.post("/plan", response_model=PlanOut)
def plan(
    payload: PlanIn,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """AI 学习计划生成：聚合学情/错题/收藏，输出带日程的个性化计划（LLM 不可用时降级）。"""
    return PlanOut(**generate_plan(db, current, days=payload.days, target=payload.target))

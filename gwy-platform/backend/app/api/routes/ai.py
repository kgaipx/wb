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
    PlanProgress,
    PlanToggleOut,
    RecommendOut,
)
from app.services import study_plan_service as sp_svc

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
    """AI 学习计划生成：聚合学情/错题/收藏，输出带日程的个性化计划（LLM 不可用时降级），并落库以支持打卡。"""
    plan_dict = generate_plan(db, current, days=payload.days, target=payload.target)
    sp = sp_svc.persist_plan(db, current, plan_dict, target=payload.target)
    prog = sp_svc.compute_progress(db, sp)
    return PlanOut(**sp_svc.to_plan_out(sp, prog))


@router.get("/plan", response_model=PlanOut)
def get_plan(
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取当前已保存的学习计划（含打卡状态与进度）；无计划则返回 404。"""
    sp = sp_svc.get_current_plan(db, current)
    if sp is None:
        raise HTTPException(status_code=404, detail="尚未生成学习计划，请先生成")
    prog = sp_svc.compute_progress(db, sp)
    return PlanOut(**sp_svc.to_plan_out(sp, prog))


@router.post("/plan/tasks/{task_id}/toggle", response_model=PlanToggleOut)
def toggle_plan_task(
    task_id: int,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """打卡 / 取消打卡单个任务（执行-复盘闭环）；仅可操作本人计划内的任务。"""
    task = sp_svc.toggle_task(db, current, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="任务不存在")
    prog = sp_svc.compute_progress(db, task.plan)
    last = prog.get("last_checkin_at")
    progress_payload = {
        k: v for k, v in prog.items() if k not in ("today_index", "last_checkin_at")
    }
    progress_payload["last_checkin_at"] = last.isoformat() if last else None
    return PlanToggleOut(
        task={
            "id": task.id,
            "done": task.done,
            "checked_at": task.checked_at.isoformat() if task.checked_at else None,
        },
        progress=PlanProgress(**progress_payload),
    )

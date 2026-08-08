"""AI 能力路由（WBS 3.1 私教讲解 / 3.2 自适应推荐 / 4.1 申论批改）。

所有端点均受 get_current_user 保护；LLM 调用失败时由能力层降级（见 essay_grader 回退）。
"""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.ai.adaptive import recommend_questions
from app.ai.essay_grader import EssayGrader
from app.ai.study_planner import generate_plan
from app.ai.tutor_agent import TutorAgent
from app.api.routes.auth import get_current_user, require_admin
from app.core.config import settings
from app.db.session import get_db
from app.models import AbilityProfile, EssayGradeRecord, EssayPrompt, Question, User
from app.schemas.ai import (
    AiQuota,
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
from app.schemas.essay import EssayHistoryItem, EssayPromptOut
from app.services import study_plan_service as sp_svc

router = APIRouter()

_FREE_QUOTA = settings.FREE_AI_EXPLAIN_QUOTA


def _quota_state(user: User) -> dict:
    """返回当前用户当日 AI 讲解配额状态（is_pro 不限）。"""
    today = date.today().isoformat()
    if user.plan != "free":
        return {"is_pro": True, "limit": -1, "used": user.ai_quota_used, "remaining": -1, "date": today}
    # 跨日则重置计数
    if user.ai_quota_date != today:
        user.ai_quota_used = 0
        user.ai_quota_date = today
    remaining = max(0, _FREE_QUOTA - user.ai_quota_used)
    return {"is_pro": False, "limit": _FREE_QUOTA, "used": user.ai_quota_used, "remaining": remaining, "date": today}


@router.get("/quota", response_model=AiQuota, tags=["ai"])
def ai_quota(current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """查询当前会员等级与免费版每日 AI 讲解剩余配额（驱动会员升级引导）。"""
    st = _quota_state(current)
    return AiQuota(plan=current.plan, **st)


@router.post("/explain", response_model=ExplainOut)
def explain(payload: ExplainIn, current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    q = db.get(Question, payload.question_id)
    if q is None:
        raise HTTPException(status_code=404, detail="题目不存在")
    # 免费版按日配额限流（pro 不限），超额引导升级
    if current.plan == "free":
        st = _quota_state(current)
        if st["remaining"] <= 0:
            raise HTTPException(
                status_code=402,
                detail="今日 AI 讲解次数已用完（免费版每日 %d 次）。升级会员解锁无限次 AI 私教讲解。" % _FREE_QUOTA,
            )
        current.ai_quota_used += 1
    tutor = TutorAgent()
    out = tutor.explain_question(q, payload.selected)
    db.commit()
    remaining = None
    if current.plan == "free":
        remaining = max(0, _FREE_QUOTA - current.ai_quota_used)
    return ExplainOut(**out, quota_remaining=remaining)


@router.get("/recommend", response_model=RecommendOut)
def recommend(top_n: int = 10, seed: int | None = None, current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    abilities = (
        db.query(AbilityProfile).filter(AbilityProfile.user_id == current.id).all()
    )
    from app.ai.tutor_agent import TutorAgent

    weak = TutorAgent.diagnose_mistakes(abilities)
    questions = recommend_questions(db, current.id, top_n=top_n, seed=seed)
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


@router.get("/essay-prompts", response_model=list[EssayPromptOut], tags=["ai"])
def essay_prompts(current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """申论题库：返回可练习的题目（材料 + 要求）。需登录。"""
    return db.query(EssayPrompt).order_by(EssayPrompt.id).all()


@router.post("/essay-grade", response_model=EssayGradeOut)
def essay_grade(payload: EssayGradeIn, current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    grader = EssayGrader()
    score = grader.grade(
        payload.essay_text,
        payload.prompt_material,
        requirement=payload.requirement,
        max_score=payload.max_score,
    )
    record_id = None
    if payload.save:
        rec = EssayGradeRecord(
            user_id=current.id,
            prompt_id=payload.prompt_id,
            essay_text=payload.essay_text,
            total=score.total,
            dimensions=score.dimensions,
            needs_human_review=score.needs_human_review,
            rationale=score.rationale,
        )
        db.add(rec)
        db.commit()
        db.refresh(rec)
        record_id = rec.id
    return EssayGradeOut(
        total=score.total,
        dimensions=score.dimensions,
        needs_human_review=score.needs_human_review,
        rationale=score.rationale,
        consistency=getattr(score, "consistency", {}),
        record_id=record_id,
    )


@router.get("/essay/consistency", tags=["ai"])
def essay_consistency(current: User = Depends(require_admin)):
    """管理端点：人 AI 评分一致性报告（发布闸门），返回 Pearson 系数与是否达标 0.8。"""
    from app.ai.essay_grader import EssayGrader

    return EssayGrader().consistency_report()


@router.get("/essay-history", response_model=list[EssayHistoryItem], tags=["ai"])
def essay_history(current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """当前用户的申论批改历史（供复看与进步追踪）。"""
    rows = (
        db.query(EssayGradeRecord)
        .filter(EssayGradeRecord.user_id == current.id)
        .order_by(EssayGradeRecord.created_at.desc())
        .limit(50)
        .all()
    )
    out = []
    for r in rows:
        title = None
        if r.prompt_id:
            p = db.get(EssayPrompt, r.prompt_id)
            title = p.title if p else None
        item = EssayHistoryItem.model_validate(r, from_attributes=True)
        item.prompt_title = title
        out.append(item)
    return out


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

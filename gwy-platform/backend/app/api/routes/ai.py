"""AI 能力路由（WBS 3.1 私教讲解 / 3.2 自适应推荐 / 4.1 申论批改）。

所有端点均受 get_current_user 保护；LLM 调用失败时由能力层降级（见 essay_grader 回退）。
"""
from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session

from app.ai.adaptive import recommend_questions
from app.ai.essay_grader import EssayGrader
from app.ai.llm_gateway import LLMGateway
from app.ai.study_planner import generate_plan
from app.ai.tutor_agent import TutorAgent
from app.api.routes.auth import get_current_user, require_admin
from app.core.config import settings
from app.db.session import get_db
from app.models import AbilityProfile, EssayGradeRecord, EssayPrompt, KnowledgeChunk, Question, User, UserAnswer
from app.schemas.ai import (
    AiQuota,
    ChatIn,
    ChatOut,
    EssayGradeIn,
    EssayGradeOut,
    EssayModelIn,
    EssayModelOut,
    EssayCompareIn,
    EssayCompareOut,
    EssayGap,
    ExplainIn,
    ExplainOut,
    KnowledgeChunkOut,
    MorningReportOut,
    PlanIn,
    PlanOut,
    PlanProgress,
    PlanToggleOut,
    RecommendOut,
)
from app.schemas.essay import EssayHistoryItem, EssayPromptOut
from app.services import chat_service as chat_svc
from app.services import study_plan_service as sp_svc
from app.services.scoring import has_correct_option_filter

router = APIRouter()

_FREE_QUOTA = settings.FREE_AI_EXPLAIN_QUOTA


def _quota_state(user: User) -> dict:
    """返回当前用户当日 AI 讲解配额状态（is_pro 不限）。"""
    # 平台规则：所有"按日"统计一律用北京时间（dt+8h），不能依赖服务器墙钟。
    today = (datetime.now(timezone.utc) + timedelta(hours=8)).date().isoformat()
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
    correct = "".join(o.label for o in q.options if getattr(o, "is_correct", False)) or None
    return ExplainOut(**out, correct_answer=correct, quota_remaining=remaining)


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
def chat(payload: ChatIn, current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    tutor = TutorAgent()
    # 与会话路由一致：注入学员能力画像（最弱且练过的考点），让私教个性化
    weak = chat_svc.build_weak_points(db, current)
    return ChatOut(**tutor.chat(payload.messages, payload.kp_hint, weak_points=weak))


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


@router.post("/essay/model", response_model=EssayModelOut, tags=["ai"])
def essay_model(
    payload: EssayModelIn,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """申论范文参考：基于材料/要求生成高分范文 + 结构提纲 + 高分要点（LLM 不可用时降级）。"""
    material = payload.material
    requirement = payload.requirement
    if (not material and not requirement) and payload.prompt_id:
        p = db.get(EssayPrompt, payload.prompt_id)
        if p:
            material = material or p.material
            requirement = requirement or p.requirement
    from app.ai.essay_model import generate_model_essay

    return EssayModelOut(**generate_model_essay(material, requirement))


@router.post("/essay/compare", response_model=EssayCompareOut, tags=["ai"])
def essay_compare(payload: EssayCompareIn, current: User = Depends(get_current_user)):
    """将考生作答与高分范文做维度级对比点评（差距分析 + 改进建议）。"""
    from app.ai.essay_compare import compare_essay

    return EssayCompareOut(
        **compare_essay(
            student_essay=payload.student_essay,
            material=payload.material,
            requirement=payload.requirement,
            max_score=payload.max_score,
            model_essay=payload.model_essay,
            student_dimensions=payload.student_dimensions,
            student_total=payload.student_total,
        )
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


@router.get("/knowledge/lookup", response_model=list[KnowledgeChunkOut], tags=["ai"])
def knowledge_lookup(
    q: str = Query(..., min_length=1, description="检索词：知识点 / 来源 / 标题 / 正文片段"),
    limit: int = Query(6, ge=1, le=20),
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """按引用反查知识原文（聊天/讲解旧字符串引用点开看详情时调用）。

    匹配 kp / source / title / content（LIKE），排序：精确 kp 命中 > 模糊 kp 命中 >
    已双签校验优先 > id。供前端在引用卡片详情里展示可追溯的知识片段正文。
    """
    term = q.strip()
    if not term:
        return []
    # 排序：精确 kp 命中最前，其次含 kp，再已校验优先
    order = case(
        (KnowledgeChunk.kp == term, 0),
        (KnowledgeChunk.kp.contains(term), 1),
        else_=2,
    )
    chunks = (
        db.query(KnowledgeChunk)
        .filter(
            or_(
                KnowledgeChunk.kp.contains(term),
                KnowledgeChunk.source.contains(term),
                KnowledgeChunk.title.contains(term),
                KnowledgeChunk.content.contains(term),
            )
        )
        .order_by(order, KnowledgeChunk.is_verified.desc(), KnowledgeChunk.id)
        .limit(limit)
        .all()
    )
    return [
        KnowledgeChunkOut(
            id=c.id,
            kp=c.kp,
            title=c.title,
            source=c.source,
            content=c.content,
            is_verified=bool(c.is_verified),
        )
        for c in chunks
    ]


_MORNING_SYSTEM = (
    "你是公考备考 AI 私教晨报助手。基于考生的学习数据生成简短中文晨报：2-4 句话，"
    "先播报昨日表现，再点出今日重点（薄弱点/计划/倒计时），最后给一句今日行动建议。"
    "语气亲切有鼓励感，自然口语化，不要 markdown 标题，不要罗列数字清单。"
)


def _bj_midnight_utc(d: date) -> datetime:
    """北京时间 d 日 00:00 对应的 UTC 时刻（北京 = UTC+8）。"""
    return datetime.combine(d, time.min) - timedelta(hours=8)


@router.get("/morning-report", response_model=MorningReportOut, tags=["ai"])
def morning_report(
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """AI 备考晨报：昨日做题表现 + 薄弱点 + 今日计划 + 倒计时 → LLM 口语化播报（失败模板兜底）。

    仅统计客观可判分题（排除申论与坏题）；「按日」一律北京时间。前端按自然日缓存，每日至多触发一次 LLM。
    """
    now = datetime.now(timezone.utc)
    today = (now + timedelta(hours=8)).date()
    y_lo = _bj_midnight_utc(today - timedelta(days=1))
    y_hi = _bj_midnight_utc(today)

    base = [UserAnswer.user_id == current.id, Question.qtype != "essay"]
    y_total = (
        db.query(func.count(UserAnswer.id))
        .join(Question, Question.id == UserAnswer.question_id)
        .filter(*base, UserAnswer.submitted_at >= y_lo, UserAnswer.submitted_at < y_hi)
        .filter(has_correct_option_filter())
        .scalar()
        or 0
    )
    y_correct = (
        db.query(func.count(UserAnswer.id))
        .join(Question, Question.id == UserAnswer.question_id)
        .filter(*base, UserAnswer.is_correct == True, UserAnswer.submitted_at >= y_lo, UserAnswer.submitted_at < y_hi)  # noqa: E712
        .filter(has_correct_option_filter())
        .scalar()
        or 0
    )
    y_rate = round(y_correct / y_total * 100) if y_total else 0

    monday = today - timedelta(days=today.weekday())
    w_total = (
        db.query(func.count(UserAnswer.id))
        .join(Question, Question.id == UserAnswer.question_id)
        .filter(*base, UserAnswer.submitted_at >= _bj_midnight_utc(monday))
        .filter(has_correct_option_filter())
        .scalar()
        or 0
    )

    weak = [
        a.knowledge_point
        for a in (
            db.query(AbilityProfile)
            .filter(AbilityProfile.user_id == current.id)
            .order_by(AbilityProfile.mastery)
            .all()
        )
        if a.attempts > 0
    ][:3]

    plan_today = plan_done = 0
    sp = sp_svc.get_current_plan(db, current)
    if sp is not None:
        ti = (sp_svc.compute_progress(db, sp) or {}).get("today_index") or 0
        if ti:
            tt = [t for t in sp.tasks if t.day == ti]
            plan_today = len(tt)
            plan_done = sum(1 for t in tt if t.done)

    countdown_days = None
    if current.target_exam_date:
        try:
            left = (date.fromisoformat(current.target_exam_date) - today).days
            if left >= 0:
                countdown_days = left
        except ValueError:
            pass

    data = dict(
        date=today.isoformat(),
        yesterday_answers=y_total,
        yesterday_rate=y_rate,
        week_answers=w_total,
        weak=weak,
        plan_today=plan_today,
        plan_done=plan_done,
        countdown_days=countdown_days,
    )

    # LLM 生成口语化播报；失败/不可用 → 模板兜底（不拖垮首页）
    try:
        gw = LLMGateway()
        payload = {
            "昨日做题数": y_total,
            "昨日正确率%": y_rate,
            "本周做题数": w_total,
            "薄弱点": weak or "暂无（继续刷题建立画像）",
            "今日计划任务": f"{plan_done}/{plan_today}" if plan_today else "无计划",
            "距目标考试天数": countdown_days,
            "目标考试": current.target_exam_name or current.target_exam,
        }
        resp = gw.complete(
            f"考生数据：{payload}",
            system=_MORNING_SYSTEM,
            temperature=0.6,
            max_tokens=400,
        )
        if resp and resp.strip():
            return MorningReportOut(report=resp.strip(), generated=True, offline=False, **data)
    except Exception:
        pass

    parts = [f"早上好！昨天你练了 {y_total} 题，正确率 {y_rate}%"]
    if weak:
        parts.append(f"当前最需要加强的是「{weak[0]}」，建议今天优先做一组专项")
    if plan_today:
        parts.append(f"今日计划 {plan_done}/{plan_today} 项任务待完成")
    elif sp is None:
        parts.append("还没有学习计划，可在学习中心一键生成 7 天计划")
    if countdown_days is not None:
        parts.append(f"距离 {current.target_exam_name or current.target_exam} 还有 {countdown_days} 天，稳住节奏")
    return MorningReportOut(report="，".join(parts) + "。", generated=False, offline=True, **data)

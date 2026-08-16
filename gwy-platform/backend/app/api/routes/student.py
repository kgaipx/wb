"""学员中心 / 学情看板路由（方案 c4 方向1 / WBS 2.1）。

/student/me 返回用户画像 + 答题统计 + 能力图谱，是"AI 私教"诊断面板的数据来源。
/student/stats 返回学情数据看板（P0 信号：错题复错率 / 正确率 / 弱项 / 趋势 / 连续打卡）。
"""
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, case
from sqlalchemy.orm import Session

from app.api.routes.auth import get_current_user
from app.db.session import get_db
from app.models import AbilityProfile, Question, User, UserAnswer
from app.schemas.progress import AbilityOut, DayTrend, StudentDashboard, StudentStats
from app.schemas.question import QuestionOut, WrongItem
from app.schemas.user import UserOut
from app.services.scoring import has_correct_option_filter
from app.services.study_plan_service import compute_progress, get_current_plan

router = APIRouter()


def _bj_date(dt):
    """北京时间日期（UTC+8，无夏令时），返回 date 对象，用于学情趋势按用户本地日切分。"""
    from datetime import timedelta

    return (dt + timedelta(hours=8)).date()


@router.get("/me", response_model=StudentDashboard)
def dashboard(current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # 仅统计客观且可判分题（排除申论与「选项无正确标记」的题库坏题），
    # 避免坏题/申论被静默判错、拉低画像正确率。
    total = (
        db.query(func.count(UserAnswer.id))
        .join(Question, Question.id == UserAnswer.question_id)
        .filter(UserAnswer.user_id == current.id, Question.qtype != "essay")
        .filter(has_correct_option_filter())
        .scalar()
        or 0
    )
    correct = (
        db.query(func.count(UserAnswer.id))
        .join(Question, Question.id == UserAnswer.question_id)
        .filter(
            UserAnswer.user_id == current.id,
            Question.qtype != "essay",
            UserAnswer.is_correct == True,  # noqa: E712
        )
        .filter(has_correct_option_filter())
        .scalar()
        or 0
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
    qids = [q.id for q, _ in joined]
    agg = (
        db.query(
            UserAnswer.question_id,
            func.count(UserAnswer.id).label("attempts"),
            func.sum(case((UserAnswer.is_correct == False, 1), else_=0)).label("wrong_total"),  # noqa: E712
            func.max(UserAnswer.submitted_at).label("last_at"),
        )
        .filter(UserAnswer.user_id == current.id, UserAnswer.question_id.in_(qids))
        .group_by(UserAnswer.question_id)
        .all()
    )
    agg_map = {r.question_id: (r.attempts, int(r.wrong_total or 0), r.last_at) for r in agg}
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
        attempts, wrong_total, last_at = agg_map.get(q.id, (0, 0, None))
        recurrence_rate = round(wrong_total / attempts, 3) if attempts else None
        items.append(
            WrongItem(
                question=QuestionOut.model_validate(q),
                wrong_count=cnt,
                last_selected=last.selected if last else None,
                attempts=attempts,
                recurrence_rate=recurrence_rate,
                last_attempted_at=last_at,
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


@router.get("/stats", response_model=StudentStats)
def stats(current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """学情数据看板：复错率（P0）、客观正确率、弱项、近 7 日趋势、连续打卡。

    仅统计客观且可判分题（排除申论与「选项无正确标记」的题库坏题），
    避免坏题被静默判错污染复错率/正确率——即便历史库中存在修复前答过的坏题也能稳健排除。
    """
    rows = (
        db.query(UserAnswer, Question.qtype)
        .join(Question, Question.id == UserAnswer.question_id)
        .filter(UserAnswer.user_id == current.id, Question.qtype != "essay")
        .filter(has_correct_option_filter())
        .order_by(UserAnswer.question_id, UserAnswer.id)
        .all()
    )

    # 按题聚合作答序列（时间序），并统计每日量（按北京时间切日）
    by_q: dict[int, list[bool]] = defaultdict(list)
    day_ans: Counter = Counter()
    day_correct: Counter = Counter()
    today = _bj_date(datetime.now(timezone.utc))
    for ans, _qtype in rows:
        by_q[ans.question_id].append(bool(ans.is_correct))
        d = _bj_date(ans.submitted_at).isoformat()
        day_ans[d] += 1
        if ans.is_correct:
            day_correct[d] += 1

    total = sum(len(v) for v in by_q.values())
    correct = sum(1 for ans, _ in rows if ans.is_correct)
    correct_rate = round(correct / total, 3) if total else 0.0

    # 复错率：曾经做错且其后复测仍错的题 / 曾错且复测过的题
    ever_wrong = 0
    recurred = 0
    retried = 0
    for _qid, seq in by_q.items():
        wrong_idx = [i for i, c in enumerate(seq) if not c]
        if not wrong_idx:
            continue
        ever_wrong += 1
        later = seq[wrong_idx[0] + 1 :]
        if later:
            retried += 1
            if any(not c for c in later):
                recurred += 1
    recurrence_rate = round(recurred / retried, 3) if retried else 0.0

    reviewed = (
        db.query(func.count(func.distinct(UserAnswer.question_id)))
        .filter(UserAnswer.user_id == current.id, UserAnswer.reviewed == True)  # noqa: E712
        .scalar()
        or 0
    )

    abilities = (
        db.query(AbilityProfile)
        .filter(AbilityProfile.user_id == current.id)
        .all()
    )
    mastered_kp = sum(1 for a in abilities if a.mastery >= 0.8)
    weak = sorted(abilities, key=lambda a: a.mastery)[:8]

    last_7_days = [
        DayTrend(
            date=(today - timedelta(days=i)).isoformat(),
            answers=day_ans.get((today - timedelta(days=i)).isoformat(), 0),
            correct=day_correct.get((today - timedelta(days=i)).isoformat(), 0),
        )
        for i in range(6, -1, -1)
    ]

    plan = get_current_plan(db, current)
    streak_days = compute_progress(db, plan)["streak_days"] if plan else 0

    return StudentStats(
        user=UserOut.model_validate(current),
        total_answers=total,
        correct_rate=correct_rate,
        wrong_distinct=ever_wrong,
        recurrence_rate=recurrence_rate,
        reviewed_distinct=int(reviewed),
        mastered_kp=mastered_kp,
        ability=[AbilityOut.model_validate(a) for a in weak],
        last_7_days=last_7_days,
        streak_days=streak_days,
    )

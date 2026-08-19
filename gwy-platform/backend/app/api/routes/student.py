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
from app.schemas.progress import (
    AbilityOut,
    DayTrend,
    KpHeatItem,
    KpHeatmap,
    KpHeatSubject,
    StudentDashboard,
    StudentStats,
    WeeklyReport,
)
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
                correct_answer=q.answer or None,
                explanation=q.explanation or None,
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


@router.get("/kp-heatmap", response_model=KpHeatmap)
def kp_heatmap(current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """知识点掌握度热力图：按科目分面，科目按平均掌握度升序（最弱在最前）。

    AbilityProfile 无 subject 列 → 先按用户已有能力画像的知识点去 Question 表
    JOIN 出 kp→subject 映射（同一知识点取其在题库中归属的科目，取 id 最小者保证确定）。
    仅含用户练过的知识点：从未练过的不出现，避免满屏 0% 误导性红块。
    """
    abilities = (
        db.query(AbilityProfile)
        .filter(AbilityProfile.user_id == current.id)
        .all()
    )
    if not abilities:
        return KpHeatmap(subjects=[])

    kps = [a.knowledge_point for a in abilities]
    # kp → subject：取该知识点在题库中 id 最小的题目所属科目（确定性映射）
    subq = (
        db.query(
            Question.knowledge_point,
            func.min(Question.id).label("min_id"),
        )
        .filter(Question.knowledge_point.in_(kps))
        .group_by(Question.knowledge_point)
        .subquery()
    )
    kp_subject = {
        kp: sj
        for kp, sj in (
            db.query(Question.knowledge_point, Question.subject)
            .join(subq, Question.id == subq.c.min_id)
            .all()
        )
    }

    by_kp = {a.knowledge_point: a for a in abilities}
    subj_map: dict[str, list[AbilityProfile]] = defaultdict(list)
    for a in abilities:
        sj = kp_subject.get(a.knowledge_point)
        if sj is None:
            continue  # 题库里查不到该知识点（脏数据），跳过不进热力图
        subj_map[sj].append(a)

    subjects: list[KpHeatSubject] = []
    for sj, items in subj_map.items():
        items_sorted = sorted(items, key=lambda a: a.mastery)
        avg = round(sum(a.mastery for a in items) / len(items), 3)
        subjects.append(
            KpHeatSubject(
                subject=sj,
                avg_mastery=avg,
                kps=[
                    KpHeatItem(
                        knowledge_point=a.knowledge_point,
                        mastery=a.mastery,
                        attempts=a.attempts,
                    )
                    for a in items_sorted
                ],
            )
        )
    subjects.sort(key=lambda s: s.avg_mastery)
    return KpHeatmap(subjects=subjects)


@router.get("/weekly-report", response_model=WeeklyReport)
def weekly_report(current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """学习周报：本周 vs 上周（北京时间周一 00:00 为窗口边界，submitted_at 为 UTC naive）。

    仅统计客观可判分题（qtype != 'essay' + has_correct_option_filter），对齐学情看板口径。
    """
    now_utc = datetime.now(timezone.utc)
    bj = now_utc + timedelta(hours=8)
    monday_bj = (bj - timedelta(days=bj.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    monday_utc = (monday_bj - timedelta(hours=8)).replace(tzinfo=None)
    last_monday_utc = monday_utc - timedelta(days=7)
    now_naive = now_utc.replace(tzinfo=None)

    def period(start, end):
        rows = (
            db.query(UserAnswer, Question.knowledge_point)
            .join(Question, Question.id == UserAnswer.question_id)
            .filter(
                UserAnswer.user_id == current.id,
                Question.qtype != "essay",
                UserAnswer.submitted_at >= start,
                UserAnswer.submitted_at < end,
            )
            .filter(has_correct_option_filter())
            .all()
        )
        total = len(rows)
        correct = sum(1 for a, _ in rows if a.is_correct)
        rate = round(correct / total, 3) if total else 0.0
        active = len({_bj_date(a.submitted_at) for a, _ in rows})
        by_kp: dict[str, list[int]] = {}
        for a, kp in rows:
            key = kp or "未分类"
            by_kp.setdefault(key, [0, 0])
            by_kp[key][1] += 1
            if a.is_correct:
                by_kp[key][0] += 1
        weak = sorted(
            ({"kp": k, "rate": round(c / t, 3)} for k, (c, t) in by_kp.items() if t >= 2),
            key=lambda x: x["rate"],
        )[:3]
        return total, correct, rate, active, weak

    wt, wc, wr, wd, wweak = period(monday_utc, now_naive)
    lt, _lc, lr, _la, _lw = period(last_monday_utc, monday_utc)
    delta_answers = wt - lt
    delta_rate = round((wr - lr) * 100, 1)

    if wt == 0:
        summary = "本周还没有作答记录，去刷题开启本周节奏吧。"
    elif wr >= 0.7:
        summary = f"本周共练 {wt} 题、正确率 {int(wr * 100)}%，状态在线，继续保持！"
    elif delta_answers > 0:
        summary = f"本周练习 {wt} 题（较上周 {delta_answers:+d}），正确率 {int(wr * 100)}%，稳中有进。"
    else:
        summary = f"本周练习 {wt} 题、正确率 {int(wr * 100)}%，再针对薄弱点加练一轮吧。"

    return WeeklyReport(
        week_answers=wt,
        week_correct=wc,
        week_rate=wr,
        last_answers=lt,
        last_rate=lr,
        delta_answers=delta_answers,
        delta_rate=delta_rate,
        active_days=wd,
        top_weak=wweak,
        summary=summary,
    )

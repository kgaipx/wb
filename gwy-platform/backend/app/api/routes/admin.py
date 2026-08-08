"""运营后台路由（方案 c4 方向5 / 运营者视角，仅 admin 角色可访问）。

GET /admin/overview 聚合平台健康度指标：用户增长、会员分布、营收、
题库核实状态、学习活跃、申论/模考产出、待审积压、最近注册用户。
所有敏感操作遵循最小权限，仅 admin 可见（require_admin 依赖）。
"""
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.routes.auth import require_admin
from app.db.session import get_db
from app.models.billing import Order
from app.models.content import ContentReview
from app.models.essay import EssayGradeRecord
from app.models.exam_record import ExamRecord
from app.models.progress import UserAnswer
from app.models.question import Question
from app.models.user import User
from app.schemas.admin import (
    AdminOverview,
    AdminUserRow,
    DayMetric,
    PlanCount,
    SubjectCount,
)

router = APIRouter()


def _daily_buckets(records: list, n: int = 7) -> list[DayMetric]:
    """按 UTC 日期把带时区的时间戳分桶为近 n 日计数。

    records 为 datetime 列表；created_at/submitted_at 存的是带时区的 UTC，
    SQLite 的 strftime 无法解析其 +00:00 后缀，故在 Python 侧按日期聚合。
    数据量（运营后台低频访问）下完全够用。
    """
    base = datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    out: list[DayMetric] = []
    for i in range(n - 1, -1, -1):
        day_start = base - timedelta(days=i)
        key = day_start.strftime("%Y-%m-%d")
        cnt = sum(
            1
            for r in records
            if r.year == day_start.year
            and r.month == day_start.month
            and r.day == day_start.day
        )
        out.append(DayMetric(date=key, value=float(cnt)))
    return out


def _daily_revenue_buckets(rows: list, n: int = 7) -> list[DayMetric]:
    """按 UTC 日期聚合金额（分→元）。rows: [(datetime, amount_fen), ...]"""
    base = datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    out: list[DayMetric] = []
    for i in range(n - 1, -1, -1):
        day_start = base - timedelta(days=i)
        key = day_start.strftime("%Y-%m-%d")
        total = sum(
            a
            for r, a in rows
            if r.year == day_start.year
            and r.month == day_start.month
            and r.day == day_start.day
        )
        out.append(DayMetric(date=key, value=round(total / 100.0, 2)))
    return out


@router.get("/overview", response_model=AdminOverview)
def overview(
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> AdminOverview:
    """运营后台总览：只读聚合指标。

    用于运营者观测增长、营收、内容可信与学习活跃，支撑运营决策。
    """
    now = datetime.now(timezone.utc)
    since_7d = now - timedelta(days=7)

    # 用户
    users_total = db.query(func.count(User.id)).scalar() or 0
    users_new_7d = (
        db.query(func.count(User.id)).filter(User.created_at >= since_7d).scalar() or 0
    )
    plan_rows = (
        db.query(User.plan, func.count(User.id)).group_by(User.plan).all()
    )
    users_by_plan = [PlanCount(plan=p, count=c) for p, c in plan_rows]
    pro_users = sum(
        c for p, c in plan_rows if p in ("pro", "pro_year")
    )

    # 营收（已支付订单金额，分→元）
    paid = (
        db.query(func.coalesce(func.sum(Order.amount), 0))
        .filter(Order.status == "paid")
        .scalar()
        or 0
    )
    paid_orders = (
        db.query(func.count(Order.id)).filter(Order.status == "paid").scalar() or 0
    )
    revenue_yuan = round(paid / 100.0, 2)

    # 题库 / 内容可信
    questions_total = db.query(func.count(Question.id)).scalar() or 0
    questions_verified = (
        db.query(func.count(Question.id)).filter(Question.is_verified == True).scalar() or 0  # noqa: E712
    )
    questions_pending = questions_total - questions_verified
    subj_rows = (
        db.query(Question.subject, func.count(Question.id))
        .group_by(Question.subject)
        .order_by(func.count(Question.id).desc())
        .all()
    )
    question_subjects = [SubjectCount(subject=s, count=c) for s, c in subj_rows]
    pending_reviews = (
        db.query(func.count(ContentReview.id))
        .filter(ContentReview.status == "pending")
        .scalar()
        or 0
    )

    # 学习活跃
    answers_total = db.query(func.count(UserAnswer.id)).scalar() or 0
    correct_total = (
        db.query(func.count(UserAnswer.id))
        .filter(UserAnswer.is_correct == True)  # noqa: E712
        .scalar()
        or 0
    )
    avg_correct_rate = round(correct_total / answers_total, 3) if answers_total else 0.0
    essays_graded = db.query(func.count(EssayGradeRecord.id)).scalar() or 0
    mock_exams = db.query(func.count(ExamRecord.id)).scalar() or 0

    # 最近注册用户（运营拉新观察）
    recent = (
        db.query(User)
        .order_by(User.created_at.desc())
        .limit(10)
        .all()
    )
    recent_users = [
        AdminUserRow(
            email=u.email,
            nickname=u.nickname,
            plan=u.plan,
            target_exam=u.target_exam,
            role=u.role,
            created_at=u.created_at,
        )
        for u in recent
    ]

    # 近 7 日趋势（增长 / 活跃 / 营收）
    new_user_dts = [
        r[0]
        for r in db.query(User.created_at)
        .filter(User.created_at >= since_7d)
        .all()
    ]
    answer_dts = [
        r[0]
        for r in db.query(UserAnswer.submitted_at)
        .filter(UserAnswer.submitted_at >= since_7d)
        .all()
    ]
    paid_rows = [
        (r[0], r[1])
        for r in db.query(Order.created_at, Order.amount)
        .filter(Order.status == "paid", Order.created_at >= since_7d)
        .all()
    ]
    daily_new_users = _daily_buckets(new_user_dts)
    daily_answers = _daily_buckets(answer_dts)
    daily_revenue = _daily_revenue_buckets(paid_rows)

    return AdminOverview(
        users_total=users_total,
        users_new_7d=users_new_7d,
        users_by_plan=users_by_plan,
        pro_users=pro_users,
        paid_orders=paid_orders,
        revenue_yuan=revenue_yuan,
        questions_total=questions_total,
        questions_verified=questions_verified,
        questions_pending=questions_pending,
        question_subjects=question_subjects,
        pending_reviews=pending_reviews,
        answers_total=answers_total,
        avg_correct_rate=avg_correct_rate,
        essays_graded=essays_graded,
        mock_exams=mock_exams,
        daily_new_users=daily_new_users,
        daily_answers=daily_answers,
        daily_revenue=daily_revenue,
        recent_users=recent_users,
    )

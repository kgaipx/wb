"""学习计划持久化与进度聚合服务（执行-复盘闭环的数据层）。

把「诊断→计划→执行→复盘」的最后两环做实：
- 计划生成后落库，使打卡可锚定到具体任务；
- 聚合完成率、连续打卡天数、按类型分布、今日待办，驱动前端进度追踪与复盘。

所有操作为纯 DB 读写，不依赖 LLM，因此永不 500（对应「离线轻量 / 信任保障」）。
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func

from app.models import PlanTask, StudyPlan, User


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _bj_date(dt: datetime) -> datetime.date:
    """北京时间日期（中国无夏令时，恒定 UTC+8）。

    连续打卡天数、计划「今日序号」等日界线判定一律以北京时间（用户本地）为准，
    避免此前按 UTC 午夜切日导致的中国用户在北京时间 08:00 被误判断签。
    """
    return (dt + timedelta(hours=8)).date()


def _date_key(dt: datetime) -> str:
    """以北京时间日期作为连续打卡判定基准。"""
    return _bj_date(dt).isoformat()


def _json_loads(s: str | None) -> list[str]:
    try:
        return json.loads(s) if s else []
    except Exception:
        return []


def persist_plan(db, user: User, plan: dict, target: str | None = None) -> StudyPlan:
    """生成后落库：先清该用户旧计划（保留最新一份），再写新计划与其任务。"""
    old = db.query(StudyPlan).filter(StudyPlan.user_id == user.id).all()
    for p in old:
        db.delete(p)
    db.flush()

    sp = StudyPlan(
        user_id=user.id,
        days=int(plan.get("days", 7)),
        target=target,
        summary=plan.get("summary"),
        model=plan.get("model"),
        offline=bool(plan.get("offline", False)),
    )
    db.add(sp)
    db.flush()

    for item in plan.get("items", []):
        day = int(item.get("day", 1))
        kps = json.dumps(item.get("knowledge_points", []), ensure_ascii=False)
        for t in item.get("tasks", []):
            db.add(
                PlanTask(
                    plan_id=sp.id,
                    day=day,
                    focus=item.get("focus", ""),
                    summary=item.get("summary", ""),
                    knowledge_points=kps,
                    kind=t.get("kind", "practice"),
                    title=t.get("title", ""),
                    target=t.get("target"),
                    ref_id=t.get("ref_id"),
                )
            )
    db.commit()
    db.refresh(sp)
    return sp


def get_current_plan(db, user: User) -> StudyPlan | None:
    """取该用户最新一份计划（按生成时间倒序）。"""
    return (
        db.query(StudyPlan)
        .filter(StudyPlan.user_id == user.id)
        .order_by(StudyPlan.created_at.desc())
        .first()
    )


def toggle_task(db, user: User, task_id: int) -> PlanTask | None:
    """打卡 / 取消打卡单个任务；仅允许操作本人计划内的任务。"""
    task = (
        db.query(PlanTask)
        .join(StudyPlan, PlanTask.plan_id == StudyPlan.id)
        .filter(PlanTask.id == task_id, StudyPlan.user_id == user.id)
        .first()
    )
    if task is None:
        return None
    task.done = not task.done
    task.checked_at = _now() if task.done else None
    db.commit()
    db.refresh(task)
    return task


def _today_index(plan: StudyPlan) -> int:
    """计划视角下「今天」对应第几天（未开始/已结束返回 0，用于不高亮）。按北京时间切日。"""
    today = _bj_date(_now())
    start = _bj_date(plan.created_at)
    idx = (today - start).days + 1
    if idx < 1 or idx > plan.days:
        return 0
    return idx


def compute_progress(db, plan: StudyPlan) -> dict[str, Any]:
    """聚合进度：完成率、连续打卡天数、按类型分布、最后打卡时间、今日待办。"""
    tasks = plan.tasks
    total = len(tasks)
    done = sum(1 for t in tasks if t.done)
    rate = round(done / total, 4) if total else 0.0

    by_kind: dict[str, dict[str, int]] = {}
    for t in tasks:
        b = by_kind.setdefault(t.kind, {"total": 0, "done": 0})
        b["total"] += 1
        if t.done:
            b["done"] += 1

    # 连续打卡天数：基于 checked_at 的日期集合，从今天往前数（今天未打卡则从昨天起算，不中断历史）
    checkin_dates = sorted({_date_key(t.checked_at) for t in tasks if t.done and t.checked_at})
    streak = 0
    if checkin_dates:
        date_set = set(checkin_dates)
        cursor = _bj_date(_now())
        if cursor.isoformat() not in date_set:
            cursor = cursor.fromordinal(cursor.toordinal() - 1)
        while cursor.isoformat() in date_set:
            streak += 1
            cursor = cursor.fromordinal(cursor.toordinal() - 1)

    last_checkin_at = max(
        (t.checked_at for t in tasks if t.done and t.checked_at), default=None
    )

    today_index = _today_index(plan)
    today_tasks = [t for t in tasks if t.day == today_index]
    today_total = len(today_tasks)
    today_done = sum(1 for t in today_tasks if t.done)

    return {
        "total_tasks": total,
        "done_tasks": done,
        "rate": rate,
        "streak_days": streak,
        "by_kind": by_kind,
        "last_checkin_at": last_checkin_at,
        "today_index": today_index,
        "today_total": today_total,
        "today_done": today_done,
    }


def to_plan_out(plan: StudyPlan, progress: dict[str, Any]) -> dict:
    """将 ORM 计划 + 进度聚合成前端契约 PlanOut。"""
    days_map: dict[int, list[PlanTask]] = {}
    for t in plan.tasks:
        days_map.setdefault(t.day, []).append(t)

    items = []
    for day in sorted(days_map):
        tasks = days_map[day]
        ref = tasks[0]
        items.append(
            {
                "day": day,
                "focus": ref.focus,
                "summary": ref.summary,
                "knowledge_points": _json_loads(ref.knowledge_points),
                "tasks": [
                    {
                        "id": t.id,
                        "kind": t.kind,
                        "title": t.title,
                        "target": t.target,
                        "ref_id": t.ref_id,
                        "done": t.done,
                    }
                    for t in tasks
                ],
            }
        )

    last = progress["last_checkin_at"]
    return {
        "plan_id": plan.id,
        "days": plan.days,
        "items": items,
        "model": plan.model,
        "offline": plan.offline,
        "summary": plan.summary,
        "generated_at": plan.created_at.isoformat(),
        "today_index": progress["today_index"],
        "progress": {
            "total_tasks": progress["total_tasks"],
            "done_tasks": progress["done_tasks"],
            "rate": progress["rate"],
            "streak_days": progress["streak_days"],
            "by_kind": progress["by_kind"],
            "last_checkin_at": last.isoformat() if last else None,
            "today_total": progress["today_total"],
            "today_done": progress["today_done"],
        },
    }

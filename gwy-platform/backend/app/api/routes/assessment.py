"""能力测评路由（WBS 3.2 自适应诊断）。

/assessment/paper：按知识点均衡采样组诊断卷（覆盖行测主要模块，优先已核实题；隐藏答案）。
/assessment/submit：判分 + 更新能力图谱（与 practice/exam 一致）+ 生成雷达维度报告 + 存记录。
/assessment/history：历次测评记录（能力成长轨迹）。
/assessment/history/{id}：某次测评的逐维度明细。

与「在线模考」的区别：模考看的是分数与薄弱点罗列；能力测评强调的是
「系统性诊断 → 能力雷达图 → 弱项突破建议」的闭环，是学习计划与自适应推送的输入。
"""
import json
import random
from collections import defaultdict
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.routes.auth import get_current_user
from app.db.session import get_db
from app.models import AbilityProfile, AssessmentRecord, Question, User, UserAnswer
from app.services.notification_service import create_notification, NOTIF_ASSESSMENT_DONE
from app.schemas.assessment import (
    AssessmentDim,
    AssessmentPaperItem,
    AssessmentRecordOut,
    AssessmentReport,
)
from app.schemas.question import OptionOut

router = APIRouter()

PER_KP = 2       # 每个知识点抽题数（保证覆盖度）
MAX_TOTAL = 30   # 诊断卷最大题量
WEAK_THRESHOLD = 0.6  # 维度掌握度低于此值记为薄弱点


class AssessmentAnswerItem(BaseModel):
    question_id: int
    selected: str = ""  # 选项标签，如 "A" / "AB"


class AssessmentSubmit(BaseModel):
    answers: list[AssessmentAnswerItem]


def _build_paper(db: Session) -> list[Question]:
    """均衡采样：优先已核实题，按知识点各取 PER_KP 题，打乱后截断 MAX_TOTAL。"""
    candidates = (
        db.query(Question)
        .filter(Question.qtype != "essay", Question.answer.isnot(None))
        .all()
    )
    if not candidates:
        raise HTTPException(status_code=404, detail="暂无可用于测评的题目，请先完善题库")
    # 已核实优先（未核实题仅作覆盖面兜底，前端会标注待核实）
    candidates.sort(key=lambda q: (0 if q.is_verified else 1))
    groups: dict[str, list[Question]] = defaultdict(list)
    for q in candidates:
        groups[q.knowledge_point].append(q)
    items: list[Question] = []
    for qs in groups.values():
        items.extend(qs[:PER_KP])
    random.shuffle(items)
    if len(items) > MAX_TOTAL:
        items = items[:MAX_TOTAL]
    return items


@router.get("/paper", response_model=list[AssessmentPaperItem])
def assessment_paper(current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    items = _build_paper(db)
    return [
        AssessmentPaperItem(
            id=q.id,
            subject=q.subject,
            category=q.category,
            qtype=q.qtype,
            stem=q.stem,
            difficulty=q.difficulty,
            knowledge_point=q.knowledge_point,
            is_verified=q.is_verified,
            options=[OptionOut.model_validate(o) for o in q.options],
        )
        for q in items
    ]


@router.post("/submit", response_model=AssessmentReport)
def assessment_submit(
    payload: AssessmentSubmit,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    total = len(payload.answers)
    correct = 0
    details: list[dict] = []
    dim_total: dict[str, int] = defaultdict(int)
    dim_correct: dict[str, int] = defaultdict(int)

    for item in payload.answers:
        q = db.get(Question, item.question_id)
        if q is None:
            continue
        correct_labels = [o.label for o in q.options if o.is_correct]
        is_correct = (
            set(item.selected.split()) == set(correct_labels) if q.qtype != "essay" else False
        )
        db.add(
            UserAnswer(
                user_id=current.id,
                question_id=q.id,
                selected=item.selected,
                is_correct=is_correct,
            )
        )
        if is_correct:
            correct += 1

        # 更新能力图谱（与 practice / exam 一致的 SM-2 简化：掌握度 = 累计正确 / 累计尝试）
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

        # 本次测评维度统计（按知识点）
        dim_total[q.knowledge_point] += 1
        if is_correct:
            dim_correct[q.knowledge_point] += 1

        details.append(
            {
                "question_id": q.id,
                "is_correct": is_correct,
                "correct_answer": "".join(correct_labels),
                "selected": item.selected,
                "stem": q.stem,
                "knowledge_point": q.knowledge_point,
            }
        )

    overall = round(correct / total, 3) if total else 0.0
    dimensions = [
        AssessmentDim(
            knowledge_point=kp,
            mastery=round(dim_correct[kp] / dim_total[kp], 3) if dim_total[kp] else 0.0,
        )
        for kp in dim_total
    ]
    dimensions.sort(key=lambda d: d.mastery)  # 弱项在前，便于雷达图重点展示
    weak_points = [d.knowledge_point for d in dimensions if d.mastery < WEAK_THRESHOLD]
    suggestions = _build_suggestions(weak_points, dimensions)

    record = AssessmentRecord(
        user_id=current.id,
        overall=overall,
        mastery_json=json.dumps([d.model_dump() for d in dimensions], ensure_ascii=False),
        weak_json=json.dumps(weak_points, ensure_ascii=False),
        suggestions_json=json.dumps(suggestions, ensure_ascii=False),
        questions_total=total,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    create_notification(
        db, current.id, NOTIF_ASSESSMENT_DONE,
        "📊 测评已完成", "查看你的能力雷达图与弱项分析",
        f"/assessment/history/{record.id}",
    )
    db.commit()

    return AssessmentReport(
        id=record.id,
        overall=overall,
        dimensions=dimensions,
        weak_points=weak_points,
        suggestions=suggestions,
        total=total,
        correct=correct,
        details=details,
        created_at=record.created_at.isoformat(),
    )


def _build_suggestions(weak: list[str], dims: list[AssessmentDim]) -> list[str]:
    out: list[str] = []
    if weak:
        out.append(f"优先突破薄弱点：{'、'.join(weak[:4])}。建议完成针对性练习并复盘错题。")
    mastered = [d.knowledge_point for d in dims if d.mastery >= 0.8]
    if mastered:
        out.append(f"保持优势模块：{'、'.join(mastered[:4])}，可适度提升难度挑战高分题。")
    if not out:
        out.append("本次测评各模块表现均衡，继续保持节奏，按计划巩固并挑战更高难度题型。")
    return out


@router.get("/history", response_model=list[AssessmentRecordOut])
def assessment_history(
    limit: int = 20,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    recs = (
        db.query(AssessmentRecord)
        .filter(AssessmentRecord.user_id == current.id)
        .order_by(AssessmentRecord.created_at.desc())
        .limit(limit)
        .all()
    )
    return [_record_out(r) for r in recs]


@router.get("/history/{record_id}", response_model=AssessmentRecordOut)
def assessment_history_detail(
    record_id: int,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    r = db.get(AssessmentRecord, record_id)
    if r is None or r.user_id != current.id:
        raise HTTPException(status_code=404, detail="测评记录不存在")
    return _record_out(r)


def _record_out(r: AssessmentRecord) -> AssessmentRecordOut:
    try:
        dims = [AssessmentDim(**d) for d in json.loads(r.mastery_json)]
    except (json.JSONDecodeError, TypeError):
        dims = []
    try:
        weak = json.loads(r.weak_json) or []
    except (json.JSONDecodeError, TypeError):
        weak = []
    try:
        sugg = json.loads(r.suggestions_json) or []
    except (json.JSONDecodeError, TypeError):
        sugg = []
    return AssessmentRecordOut(
        id=r.id,
        overall=r.overall,
        dimensions=dims,
        weak_points=weak,
        suggestions=sugg,
        questions_total=r.questions_total,
        created_at=r.created_at.isoformat(),
    )

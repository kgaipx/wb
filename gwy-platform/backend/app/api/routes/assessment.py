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
                "options": [
                    {"label": o.label, "content": o.content, "is_correct": o.is_correct}
                    for o in q.options
                ],
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
    suggestions = _build_suggestions(weak_points, dimensions, overall)

    record = AssessmentRecord(
        user_id=current.id,
        overall=overall,
        mastery_json=json.dumps([d.model_dump() for d in dimensions], ensure_ascii=False),
        weak_json=json.dumps(weak_points, ensure_ascii=False),
        suggestions_json=json.dumps(suggestions, ensure_ascii=False),
        questions_total=total,
        correct_count=correct,
        details_json=json.dumps(details, ensure_ascii=False),
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


def _build_suggestions(weak: list[str], dims: list[AssessmentDim], overall: float = 0.0) -> list[str]:
    """生成系统性诊断文案：总体诊断 + 薄弱突破 + 优势保持 + 行动清单。

    纯规则、确定性输出，保证测评提交链路稳定（不依赖大模型，毫秒级返回）。
    每条为单行字符串，直接对应前端『提升建议』的一条列表项。
    """

    def band(m: float) -> str:
        if m >= 0.85:
            return "扎实"
        if m >= 0.7:
            return "良好"
        if m >= WEAK_THRESHOLD:
            return "基本及格（需巩固）"
        if m >= 0.4:
            return "薄弱"
        return "严重不足"

    def pct(m: float) -> str:
        return f"{round(m * 100)}%"

    out: list[str] = []

    # 1. 总体诊断
    if overall >= 0.85:
        verdict = "整体表现优秀，知识框架扎实，已具备冲击高分的实力。"
    elif overall >= 0.7:
        verdict = "整体表现良好，主体模块已掌握，在薄弱项上仍有明显提分空间。"
    elif overall >= WEAK_THRESHOLD:
        verdict = "整体处于及格线附近，集中突破薄弱模块即可有效拉开分差。"
    else:
        verdict = "整体偏弱，建议先夯实基础概念，再进入系统性刷题。"
    out.append(f"总体诊断（正确率 {pct(overall)}）：{verdict}")

    # 2. 薄弱点突破（掌握度升序，前 4）——模块感知建议 + 学习闭环牵引
    weak_dims = sorted([d for d in dims if d.mastery < WEAK_THRESHOLD], key=lambda x: x.mastery)

    # 模块级突破建议（与知识库方法论锚点一致，确定性输出，避免泛泛而谈）
    MODULE_TIPS = {
        "数量关系": "建议『果断取舍、不为单题恋战』：简单题必拿，难题用代入排除法秒验，单题时间红线≤90s，把正确率托在 60%+。",
        "资料分析": "资料分析是『性价比之王』：先读问题再定位数据，速算用截位直除+差分法双保险，警惕单位/百分点陷阱，目标正确率≥90%。",
        "判断推理": "按『图形→类比→定义→逻辑』顺序抢分：图形推理先过规律清单，逻辑判断优先削弱/加强，拿不准果断弃题保时间。",
        "言语理解与表达": "言语重在语境与语感：逻辑填空先辨逻辑关系再找搭配，片段阅读抓主旨句，每篇控制在≤60s，不纠结第一直觉。",
        "常识判断": "常识靠日常积累+考场策略：历史/法律/时政分块记忆，不会的相信第一直觉、绝不空耗时间。",
        "申论": "申论重在要点提炼：审题圈定作答范围，按『材料原词+分条』作答，归纳概括先找核心词再抽象概括。",
    }

    def weak_tip(kp: str, mastery: float) -> str:
        for key, tip in MODULE_TIPS.items():
            if key in kp:
                return tip
        # 细粒度知识点：仍按掌握度给两级通用建议
        if mastery >= 0.4:
            return "已具备基本解法，重点攻克易错变式并配合限时训练提速，把会做的题做对、做快。"
        return "从基础概念入手，先单知识点刷 10 题逐题复盘，再进入混合练习，务必先求懂再求快。"

    for d in weak_dims[:4]:
        tip = weak_tip(d.knowledge_point, d.mastery)
        out.append(
            f"突破【{d.knowledge_point}】（掌握度 {pct(d.mastery)}，{band(d.mastery)}）：{tip}"
            f" → 已在 AI 私教备好该点专项讲解，对话框输入知识点即可获取配套例题与口诀。"
        )

    # 3. 优势保持
    mastered = [d for d in dims if d.mastery >= 0.8]
    if mastered:
        names = "、".join(d.knowledge_point for d in mastered[:4])
        out.append(
            f"保持优势：{names} 掌握扎实，可适度提升难度或做提速训练，把优势转化为稳定得分。"
        )

    # 4. 行动清单（优先级排序，牵引至学习闭环与 AI 私教）
    if weak_dims:
        out.append(
            "下一步行动：① 本周优先专项突破上述薄弱点；② 每刷完一组即用『错题本』复盘错因；"
            "③ 周末用『在线模考』检验提升，再回『能力测评』闭环校准；"
            "④ 任意薄弱点可在『AI 私教』对话框输入知识点，获取一对一讲解与配套例题。"
        )
    else:
        out.append(
            "下一步行动：① 保持当前节奏，针对良好模块挑战更高难度；② 用『在线模考』模拟真实考场；"
            "③ 阶段性复测防止已掌握知识点回生；④ 用『AI 私教』把优势模块的训练经验沉淀成可复用方法论。"
        )

    return out


@router.get("/history", response_model=list[AssessmentRecordOut])
def assessment_history(
    limit: int = 20,
    offset: int = 0,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    recs = (
        db.query(AssessmentRecord)
        .filter(AssessmentRecord.user_id == current.id)
        .order_by(AssessmentRecord.created_at.desc())
        .offset(offset)
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
    try:
        details = json.loads(r.details_json) if r.details_json else []
    except (json.JSONDecodeError, TypeError):
        details = []
    return AssessmentRecordOut(
        id=r.id,
        overall=r.overall,
        dimensions=dims,
        weak_points=weak,
        suggestions=sugg,
        questions_total=r.questions_total,
        correct=r.correct_count,
        details=details,
        created_at=r.created_at.isoformat(),
    )

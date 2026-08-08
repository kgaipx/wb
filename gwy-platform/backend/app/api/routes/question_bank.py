"""题库 / 刷题路由（方案 c4 方向2 / WBS 2.2）。

/practice 提交作答后会：①记录 UserAnswer ②更新能力图谱（掌握度 SM-2 简化）③返回判分与解析。
错题复错率、正确率等方案 c12 信号均可由这些数据派生。

list_questions 支持「按掌握度自适应加权」：登录用户针对某知识点（单点专项 / 多点混合练习包）
刷题时，优先练最弱、且尚未练熟的知识点与题目，让练习 ROI 最高；匿名浏览保持原有稳定序。
"""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.api.routes.auth import get_current_user, get_optional_user
from app.db.session import get_db
from app.models import (
    AbilityProfile,
    Favorite,
    Question,
    QuestionOption,
    User,
    UserAnswer,
)
from app.schemas.question import (
    FavoriteIn,
    FavoriteOut,
    FavoritePatch,
    PracticeResult,
    PracticeSubmit,
    QuestionListItem,
    QuestionOut,
)

router = APIRouter()


def _order_by_mastery(db: Session, items: list[Question], user: User) -> list[Question]:
    """掌握度加权排序：让「专项/混合练习包」优先覆盖最弱且未练熟的内容。

    排序逻辑：
    - 按知识点掌握度升序分桶（掌握度越低越靠前；无记录的知识点视为最弱，优先练）；
    - 桶内按「作答次数升序（未做过的题优先）→ id」排列，让同一薄弱点下先练没练过的题；
    - 桶间轮询交织（round-robin），保证混合练习包首屏就覆盖各薄弱点，同时最弱知识点略微靠前。
    全程确定性，分页（offset/limit）不会重复或遗漏。
    """
    if not user or not items:
        return items
    kps = list({q.knowledge_point for q in items})
    ab_map: dict[str, float] = {}
    if kps:
        for mastery, kp in (
            db.query(AbilityProfile.mastery, AbilityProfile.knowledge_point)
            .filter(
                AbilityProfile.user_id == user.id,
                AbilityProfile.knowledge_point.in_(kps),
            )
            .all()
        ):
            ab_map[kp] = mastery

    ids = [q.id for q in items]
    ans_map: dict[int, tuple[int, int]] = {}
    if ids:
        for qid, attempts, correct in (
            db.query(
                UserAnswer.question_id,
                func.count(UserAnswer.id),
                func.sum(case((UserAnswer.is_correct == True, 1), else_=0)),
            )
            .filter(UserAnswer.user_id == user.id, UserAnswer.question_id.in_(ids))
            .group_by(UserAnswer.question_id)
            .all()
        ):
            ans_map[qid] = (attempts, int(correct or 0))

    groups: dict[str, list[Question]] = {}
    for q in items:
        groups.setdefault(q.knowledge_point, []).append(q)
    # 桶按掌握度升序（最弱在前；未知知识点掌握度记 0，排最前）
    ordered_kps = sorted(groups.keys(), key=lambda kp: ab_map.get(kp, 0.0))
    for kp in ordered_kps:
        groups[kp].sort(key=lambda q: (ans_map.get(q.id, (0, 0))[0], q.id))

    result: list[Question] = []
    max_len = max((len(v) for v in groups.values()), default=0)
    for d in range(max_len):
        for kp in ordered_kps:
            bucket = groups[kp]
            if d < len(bucket):
                result.append(bucket[d])
    return result


@router.get("/questions", response_model=list[QuestionListItem])
def list_questions(
    subject: str | None = None,
    category: str | None = None,
    knowledge_point: str | None = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(20, le=500, ge=1),
    current: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    q = db.query(Question)
    if subject:
        q = q.filter(Question.subject == subject)
    if category:
        q = q.filter(Question.category == category)
    kps: list[str] = []
    if knowledge_point:
        # 支持逗号分隔的多个知识点（混合练习包），向下兼容单值等值过滤
        kps = [k.strip() for k in knowledge_point.split(",") if k.strip()]
        if len(kps) == 1:
            q = q.filter(Question.knowledge_point == kps[0])
        else:
            q = q.filter(Question.knowledge_point.in_(kps))

    # 掌握度自适应加权：仅当明确针对某知识点（专项/混合练习包）且已登录时生效，
    # 让练习包优先练最弱、未练熟的内容；无用户（匿名/公开浏览）或纯科目浏览保持原有稳定序。
    if knowledge_point and current is not None:
        items = _order_by_mastery(db, q.all(), current)
        return items[offset : offset + limit]

    # 兼容路径：纯浏览/匿名/无知识点——保持原有确定序（混合包回退随机）
    if knowledge_point and len(kps) > 1:
        q = q.order_by(func.random())
    else:
        q = q.order_by(Question.id)
    return q.offset(offset).limit(limit).all()


@router.get("/questions/{qid}", response_model=QuestionOut)
def get_question(qid: int, db: Session = Depends(get_db)):
    q = db.get(Question, qid)
    if q is None:
        raise HTTPException(status_code=404, detail="题目不存在")
    return q


@router.post("/practice", response_model=PracticeResult)
def practice(
    payload: PracticeSubmit,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.get(Question, payload.question_id)
    if q is None:
        raise HTTPException(status_code=404, detail="题目不存在")

    # 客观题判分：用户选择集合 vs 正确选项标签集合
    correct_labels = [o.label for o in q.options if o.is_correct]
    if q.qtype == "essay":
        is_correct = False  # essay 由 WBS 4.1 申论批改引擎判分
    else:
        is_correct = set(payload.selected.split()) == set(correct_labels)

    db.add(
        UserAnswer(
            user_id=current.id,
            question_id=q.id,
            selected=payload.selected,
            is_correct=is_correct,
        )
    )

    # 更新能力图谱（SM-2 简化：掌握度 = 累计正确 / 累计尝试）
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

    db.commit()
    return PracticeResult(
        question_id=q.id,
        is_correct=is_correct,
        correct_answer="".join(correct_labels),
        explanation=q.explanation,
        mastery=ab.mastery,
    )


@router.get("/favorites", response_model=list[FavoriteOut])
def list_favorites(current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    favs = (
        db.query(Favorite)
        .filter(Favorite.user_id == current.id)
        .order_by(Favorite.created_at.desc())
        .all()
    )
    if not favs:
        return []
    ids = [f.question_id for f in favs]
    qs = db.query(Question).filter(Question.id.in_(ids)).all()
    by_id = {q.id: q for q in qs}
    out = []
    for f in favs:
        q = by_id.get(f.question_id)
        if q is None:
            continue
        out.append(
            FavoriteOut(
                question=q,
                note=f.note or "",
                tags=f.tags or [],
                created_at=f.created_at,
            )
        )
    return out


@router.patch("/favorites/{qid}", response_model=FavoriteOut)
def patch_favorite(
    qid: int,
    payload: FavoritePatch,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    f = (
        db.query(Favorite)
        .filter(Favorite.user_id == current.id, Favorite.question_id == qid)
        .first()
    )
    if f is None:
        raise HTTPException(status_code=404, detail="收藏不存在")
    if payload.note is not None:
        f.note = payload.note
    if payload.tags is not None:
        # 仅保留白名单标签，去重并保序
        allowed = {"易错", "重点", "已掌握"}
        seen: set[str] = set()
        f.tags = [t for t in payload.tags if t in allowed and not (t in seen or seen.add(t))]
    db.commit()
    db.refresh(f)
    q = db.get(Question, f.question_id)
    return FavoriteOut(
        question=q,
        note=f.note or "",
        tags=f.tags or [],
        created_at=f.created_at,
    )


@router.post("/favorites", response_model=dict)
def add_favorite(
    payload: FavoriteIn,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.get(Question, payload.question_id)
    if q is None:
        raise HTTPException(status_code=404, detail="题目不存在")
    exists = (
        db.query(Favorite)
        .filter(Favorite.user_id == current.id, Favorite.question_id == payload.question_id)
        .first()
    )
    if not exists:
        db.add(Favorite(user_id=current.id, question_id=payload.question_id))
        db.commit()
    return {"ok": True}


@router.delete("/favorites/{qid}", response_model=dict)
def del_favorite(qid: int, current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    f = (
        db.query(Favorite)
        .filter(Favorite.user_id == current.id, Favorite.question_id == qid)
        .first()
    )
    if f:
        db.delete(f)
        db.commit()
    return {"ok": True}

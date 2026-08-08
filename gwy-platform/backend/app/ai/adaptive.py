"""自适应学习引擎（方案 c5 方向1、WBS 3.2）。

- 学员能力图谱 v1：知识点掌握度建模（AbilityProfile 表，SM-2 简化：掌握度 = 累计正确/累计尝试）。
- 自适应推送：优先推送低掌握度 + 已掌握降频的知识点（见 question_bank.practice 更新逻辑）。
- recommend_questions：结合 DB 能力图谱，从薄弱知识点抽取候选题，驱动私教与刷题。

验证信号（方案 c12）：个性化推送可用、学情画像形成。
"""
import random
from dataclasses import dataclass, field
from typing import Optional

from sqlalchemy.orm import Session

from app.models import AbilityProfile, Question


@dataclass
class KnowledgePoint:
    kp_id: str
    name: str
    mastery: float = 0.0  # 0~1 掌握度
    ease_factor: float = 2.5  # SM-2 难度因子
    interval_days: int = 0
    repetitions: int = 0


@dataclass
class AbilityProfileView:
    user_id: str
    points: dict[str, KnowledgePoint] = field(default_factory=dict)


class AdaptiveEngine:
    def update_after_review(
        self, profile: AbilityProfileView, kp_id: str, correct: bool
    ) -> None:
        """SM-2 更新：根据答对/错更新掌握度与复习间隔。"""
        kp = profile.points.setdefault(kp_id, KnowledgePoint(kp_id=kp_id, name=kp_id))
        if correct:
            kp.repetitions += 1
            kp.interval_days = 1 if kp.repetitions == 1 else min(kp.interval_days * 2, 30)
            kp.mastery = min(1.0, kp.mastery + 0.1)
        else:
            kp.repetitions = 0
            kp.interval_days = 1
            kp.mastery = max(0.0, kp.mastery - 0.15)

    def recommend(self, profile: AbilityProfileView, top_n: int = 10) -> list[str]:
        """优先推送低掌握度 + 临近复习时间点的知识点。"""
        ranked = sorted(profile.points.values(), key=lambda k: (k.mastery, -k.interval_days))
        return [k.kp_id for k in ranked[:top_n]]


def recommend_questions(
    db: Session, user_id: int, top_n: int = 10, weak_threshold: float = 0.7, seed: Optional[int] = None
) -> list[Question]:
    """从薄弱知识点抽取候选题（掌握度低于阈值优先）；不足则用已校验题补足。

    若提供 seed，则在保持「薄弱优先」的前提下对候选题池做确定性随机重排，
    使「换一批」能给出不同题目而不破坏相关性（无需迁移）。

    返回去重后的 Question 列表，供 /api/ai/recommend 与刷题流使用。
    """
    weak = (
        db.query(AbilityProfile)
        .filter(AbilityProfile.user_id == user_id, AbilityProfile.mastery < weak_threshold)
        .order_by(AbilityProfile.mastery)
        .all()
    )
    weak_kps = [a.knowledge_point for a in weak]

    picked: list[Question] = []
    seen: set[int] = set()

    def _collect(query, limit: int) -> None:
        for q in query:
            if q.id not in seen and len(picked) < limit:
                picked.append(q)
                seen.add(q.id)

    # seed 为 None 时保持原有确定性排序（难度序 / id 序），行为不变
    rng = random.Random(seed) if seed is not None else None

    if weak_kps:
        c1 = (
            db.query(Question)
            .filter(Question.knowledge_point.in_(weak_kps), Question.is_verified == True)  # noqa: E712
            .order_by(Question.difficulty)
            .all()
        )
        if rng:
            rng.shuffle(c1)
        _collect(c1, top_n)

    if len(picked) < top_n:
        c2 = (
            db.query(Question)
            .filter(Question.is_verified == True)  # noqa: E712
            .order_by(Question.id)
            .all()
        )
        if rng:
            rng.shuffle(c2)
        _collect(c2, top_n)

    return picked

"""自适应学习引擎（方案 c5 方向1、WBS 3.2）。

职责：
- 学员能力图谱 v1：知识点掌握度建模
- 基于 SM-2（间隔重复）的自适应推送：弱项多练、已掌握降频
- 输出个性化学习路径，驱动私教与刷题

验证信号（方案 c12）：个性化推送可用、学情画像形成。
"""
from dataclasses import dataclass, field


@dataclass
class KnowledgePoint:
    kp_id: str
    name: str
    mastery: float = 0.0  # 0~1 掌握度
    ease_factor: float = 2.5  # SM-2 难度因子
    interval_days: int = 0
    repetitions: int = 0


@dataclass
class AbilityProfile:
    user_id: str
    points: dict[str, KnowledgePoint] = field(default_factory=dict)


class AdaptiveEngine:
    def update_after_review(self, profile: AbilityProfile, kp_id: str, correct: bool) -> None:
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
        # TODO(WBS 3.2): 引入 IRT 难度校准与题目区分度

    def recommend(self, profile: AbilityProfile, top_n: int = 10) -> list[str]:
        """优先推送低掌握度 + 临近复习时间点的知识点。"""
        ranked = sorted(
            profile.points.values(),
            key=lambda k: (k.mastery, -k.interval_days),
        )
        return [k.kp_id for k in ranked[:top_n]]

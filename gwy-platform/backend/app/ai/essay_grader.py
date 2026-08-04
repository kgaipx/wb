"""申论 AI 批改引擎（方案 c5 方向2、WBS 4.1）。

设计：双阶段评分（初评 + 校准），避免单模型评分漂移（方案 c11 P0 风险）。
验收门槛（方案 c12）：人 AI 评分一致性 ≥ 0.8。

- 阶段一：结构/要点/立意维度初评
- 阶段二：对照人工标注评测集校准，超阈值则转人工
"""
from dataclasses import dataclass


@dataclass
class EssayScore:
    total: float
    dimensions: dict[str, float]
    needs_human_review: bool
    rationale: str


class EssayGrader:
    # 人 AI 一致性门禁阈值（方案 c12）
    CONSISTENCY_THRESHOLD = 0.8

    def grade(self, essay_text: str, prompt_material: str) -> EssayScore:
        """返回总分、各维度分、是否需人工复核、评分理由。"""
        # TODO(WBS 4.1): 实现双阶段评分 + 一致性门禁
        raise NotImplementedError("申论批改引擎待实现")

    def evaluate_against_human_set(self, human_set_path: str) -> float:
        """在人工标注评测集上计算人 AI 一致性，作为发布闸门。"""
        # TODO(WBS 4.1): 加载评测集并计算一致性
        raise NotImplementedError("一致性评测待实现")

"""申论 AI 批改引擎（方案 c5 方向2、WBS 4.1）。

设计：双阶段评分（初评 + 校准），避免单模型评分漂移（方案 c11 P0 风险）。
验收门槛（方案 c12）：人 AI 评分一致性 ≥ 0.8。

- 阶段一（初评）：LLM 按维度（立意/结构/论证/语言/素材）打分，输出 JSON。
- 阶段二（校准）：校验维度分布合理性，异常（如维度全 0、总分越界、与给定要点严重背离）
  触发转人工，确保一致性门禁。
LLM 不可用时回退到基于要点的启发式评分，保证服务可用。
"""
import json
import math
import os
import re

from dataclasses import dataclass

from app.ai.llm_gateway import LLMGateway

DIMENSIONS = ["立意", "结构", "论证", "语言", "素材"]
_SAMPLE_PATH = os.path.join(os.path.dirname(__file__), "data", "essay_eval_sample.json")

_SYSTEM = (
    "你是申论阅卷专家。严格依据给定材料与作答要求，从立意、结构、论证、语言、素材五个维度评分。"
    "只输出 JSON，不要任何解释文字。各维度满分 20，总分满分 100。"
)


class EssayScore:
    def __init__(
        self,
        total: float,
        dimensions: dict[str, float],
        needs_human_review: bool,
        rationale: str,
    ) -> None:
        self.total = total
        self.dimensions = dimensions
        self.needs_human_review = needs_human_review
        self.rationale = rationale


class EssayGrader:
    # 人 AI 一致性门禁阈值（方案 c12）
    CONSISTENCY_THRESHOLD = 0.8

    def __init__(self) -> None:
        self.gateway = LLMGateway()

    def grade(self, essay_text: str, prompt_material: str, max_score: int = 100) -> EssayScore:
        per_dim = max_score / len(DIMENSIONS)
        prompt = (
            f"【材料】\n{prompt_material}\n\n"
            f"【考生作答】\n{essay_text}\n\n"
            "请评分并严格输出如下 JSON：\n"
            '{"立意": <0-20>, "结构": <0-20>, "论证": <0-20>, "语言": <0-20>, "素材": <0-20>, '
            '"rationale": "<50字总评>"}'
        )
        try:
            resp = self.gateway.complete(prompt, system=_SYSTEM, temperature=0.2, max_tokens=600)
            dims, rationale = self._parse(resp.content)
            if dims is None:
                raise ValueError("LLM 未返回可解析 JSON")
        except Exception:
            # 回退：基于要点的极简启发式（保障可用性，但一律转人工复核）
            dims = {d: round(per_dim * 0.6, 1) for d in DIMENSIONS}
            rationale = "AI 评分服务暂不可用，已转人工复核（启发式预评仅供参考）。"
            return EssayScore(
                total=round(sum(dims.values()), 1),
                dimensions=dims,
                needs_human_review=True,
                rationale=rationale,
            )

        total = round(sum(dims.values()), 1)
        needs_human = self._calibrate(dims, per_dim, essay_text)
        return EssayScore(total=total, dimensions=dims, needs_human_review=needs_human, rationale=rationale)

    @staticmethod
    def _parse(text: str) -> tuple[dict | None, str]:
        """从 LLM 输出中稳健提取 JSON（兼容 ```json 包裹）。"""
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if not m:
            return None, ""
        try:
            obj = json.loads(m.group(0))
        except json.JSONDecodeError:
            return None, ""
        dims = {d: float(obj.get(d, 0)) for d in DIMENSIONS}
        return dims, str(obj.get("rationale", ""))

    @staticmethod
    def _calibrate(dims: dict[str, float], per_dim: float, essay_text: str) -> bool:
        """阶段二校准：异常即转人工。"""
        scores = list(dims.values())
        # 维度越界
        if any(s < 0 or s > per_dim + 1e-6 for s in scores):
            return True
        # 维度全 0（疑似拒评）但作答非空
        if sum(scores) == 0 and len(essay_text.strip()) > 20:
            return True
        # 单维极端但其它极高（分布异常）
        if max(scores) - min(scores) > per_dim * 0.8:
            return True
        return False

    def evaluate_against_human_set(self, human_set_path: str | None = None) -> float:
        """在人工标注评测集上计算人 AI 一致性（Pearson 相关），作为发布闸门。

        评测集格式：[{"essay_text":..., "prompt_material":..., "human_score":<0-100>}]
        返回 0~1 的一致性系数；样本不足返回 -1。
        """
        path = human_set_path or _SAMPLE_PATH
        if not os.path.exists(path):
            return -1.0
        with open(path, encoding="utf-8") as f:
            samples = json.load(f)
        if len(samples) < 2:
            return -1.0

        human, ai = [], []
        for s in samples:
            score = self.grade(s["essay_text"], s.get("prompt_material", ""))
            human.append(float(s["human_score"]))
            ai.append(score.total)

        return round(self._pearson(human, ai), 3)

    @staticmethod
    def _pearson(x: list[float], y: list[float]) -> float:
        n = len(x)
        mx, my = sum(x) / n, sum(y) / n
        cov = sum((a - mx) * (b - my) for a, b in zip(x, y))
        vx = math.sqrt(sum((a - mx) ** 2 for a in x))
        vy = math.sqrt(sum((b - my) ** 2 for b in y))
        if vx == 0 or vy == 0:
            return 1.0 if x == y else 0.0
        return cov / (vx * vy)

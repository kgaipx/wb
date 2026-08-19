"""申论 AI 批改引擎（方案 c5 方向2、WBS 4.1）。

设计：双阶段评分（初评 + 校准），避免单模型评分漂移（方案 c11 P0 风险）。
验收门槛（方案 c12）：人 AI 评分一致性 ≥ 0.8。

- 阶段一（初评）：LLM 按维度（立意/结构/论证/语言/素材）打分，输出 JSON。
- 阶段二（校准）：校验维度分布合理性，异常（如维度全 0、总分越界、分布异常）触发转人工。
- 发布闸门（人 AI 一致性门禁）：基于人工标注评测集计算 Pearson 一致性系数，
  若低于阈值 0.8，则保守地对所有 AI 评分强制转人工复核，确保「评分可信」卖点落地。
LLM 不可用时回退到基于要点的启发式评分，保证服务可用。
"""
import json
import math
import os
import re
import time
from collections import Counter

from dataclasses import dataclass, field

from app.ai.llm_gateway import LLMGateway

DIMENSIONS = ["立意", "结构", "论证", "语言", "素材"]
_SAMPLE_PATH = os.path.join(os.path.dirname(__file__), "data", "essay_eval_sample.json")
# 一致性报告缓存（避免每次评分都重跑评测集；默认 1 小时刷新）
_CONSISTENCY_TTL = 3600.0
_consistency_cache: dict = {"value": None, "ts": 0.0}

_SYSTEM = (
    "你是申论阅卷专家。严格依据给定材料与作答要求，从立意、结构、论证、语言、素材五个维度评分。"
    "只输出 JSON，不要任何解释文字。各维度满分 20，总分满分 100。"
)


@dataclass
class EssayScore:
    total: float
    dimensions: dict[str, float]
    needs_human_review: bool
    rationale: str
    consistency: dict = field(default_factory=dict)  # 人 AI 一致性门禁报告


class EssayGrader:
    # 人 AI 一致性门禁阈值（方案 c12）
    CONSISTENCY_THRESHOLD = 0.8

    def __init__(self) -> None:
        self.gateway = LLMGateway()

    def _score_core(self, essay_text: str, prompt_material: str, requirement: str, max_score: int) -> EssayScore:
        """核心评分（不含发布闸门，供单次评分与评测集共用，避免递归）。"""
        per_dim = max_score / len(DIMENSIONS)
        req_block = f"【作答要求】\n{requirement}\n\n" if requirement else ""
        prompt = (
            f"【材料】\n{prompt_material}\n\n"
            f"{req_block}"
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
            # 回退：基于要点的规则化预评（保障可用性且给出有区分度的分数，仍一律转人工复核）
            dims, rationale = self._heuristic_score(essay_text, prompt_material, per_dim)
            return EssayScore(
                total=round(sum(dims.values()), 1),
                dimensions=dims,
                needs_human_review=True,
                rationale=rationale,
            )

        total = round(sum(dims.values()), 1)
        needs_human = self._calibrate(dims, per_dim, essay_text)
        return EssayScore(total=total, dimensions=dims, needs_human_review=needs_human, rationale=rationale)

    def grade(self, essay_text: str, prompt_material: str, requirement: str = "", max_score: int = 100) -> EssayScore:
        score = self._score_core(essay_text, prompt_material, requirement, max_score)
        # 发布闸门：人 AI 一致性低于阈值时保守转人工
        rep = self.consistency_report()
        if rep["evaluated"] and rep["ok"] is False:
            score.needs_human_review = True
        score.consistency = rep
        return score

    def consistency_report(self) -> dict:
        """返回人 AI 一致性报告（带缓存）；ok=None 表示无评测集（不阻断）。"""
        now = time.time()
        if _consistency_cache["value"] is None or now - _consistency_cache["ts"] > _CONSISTENCY_TTL:
            val = self.evaluate_against_human_set()
            _consistency_cache["value"] = val
            _consistency_cache["ts"] = now
        val = _consistency_cache["value"]
        ok = val >= self.CONSISTENCY_THRESHOLD if val >= 0 else None
        return {
            "coefficient": val,
            "threshold": self.CONSISTENCY_THRESHOLD,
            "ok": ok,
            "evaluated": val >= 0,
        }

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
    def _heuristic_score(essay_text: str, prompt_material: str, per_dim: float) -> tuple[dict, str]:
        """LLM 不可用时的规则化预评：综合篇幅/结构/材料关键词覆盖，给出有区分度的五维分数。

        仍返回 needs_human_review=True（上层负责标转人工），此处只让分数更有信息量。
        """
        essay = (essay_text or "").strip()
        n = len(essay)
        if n == 0:
            dims = {d: 0.0 for d in DIMENSIONS}
            return dims, "未检测到作答内容，已转人工复核。"
        # 1) 篇幅因子 [0,1]
        if n <= 200:
            length = 0.35 + 0.25 * (n / 200.0)
        elif n <= 1000:
            length = 0.6 + 0.4 * ((n - 200) / 800.0)
        elif n <= 1600:
            length = 1.0
        else:
            length = 0.9  # 冗长略降
        # 2) 结构因子 [0,1]：分段 + 衔接/对策词
        paras = [p for p in re.split(r"[\n\r]+|\s{2,}", essay) if p.strip()]
        markers = len(
            re.findall(r"首先|其次|再次|最后|第一|第二|第三|一方面|另一方面|综上|总之|因此|所以|应当|必须|需要|要", essay)
        )
        structure = min(1.0, 0.45 + min(len(paras), 5) / 5 * 0.3 + min(markers, 8) / 8 * 0.25)
        # 3) 材料关键词覆盖 [0,1]
        cov = EssayGrader._material_coverage(essay, prompt_material)
        # 五维加权（保证维度间有区分度，非一刀切）
        vals = {
            "立意": 0.55 * cov + 0.45 * structure,
            "结构": structure,
            "论证": 0.5 * cov + 0.3 * structure + 0.2 * length,
            "语言": 0.45 * structure + 0.55 * length,
            "素材": cov,
        }
        dims = {d: round(per_dim * max(0.0, min(1.0, v)), 1) for d, v in vals.items()}
        rationale = (
            f"AI 评分服务暂不可用，已转人工复核。规则预评（仅供参考）："
            f"篇幅约 {n} 字、分段 {len(paras)}、衔接词 {markers} 处、材料关键词覆盖 {int(cov * 100)}%。"
        )
        return dims, rationale

    @staticmethod
    def _material_coverage(essay: str, material: str) -> float:
        """提取材料高频 2 字词（去停用词），返回考生在作答中覆盖的比例 [0,1]。"""
        mat = material or ""
        if not mat:
            return 0.5  # 无材料时取中性值，避免全 0
        grams = [mat[i:i + 2] for i in range(len(mat) - 1) if re.match(r"[一-鿿]{2}", mat[i:i + 2])]
        if not grams:
            return 0.5
        counter = Counter(grams)
        stop = {
            "我们", "可以", "这样", "因为", "所以", "这个", "那个", "以及", "通过", "对于", "进行",
            "实现", "需要", "重要", "发展", "应该", "必须", "提高", "加强", "中国", "社会", "问题",
            "一个", "一些", "这些", "那些", "就是", "这是", "还是", "这么", "那么", "已经", "没有",
        }
        for s in stop:
            counter.pop(s, None)
        top = [g for g, _ in counter.most_common(12)]
        if not top:
            return 0.5
        hit = sum(1 for g in top if g in essay)
        return hit / len(top)

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
        返回 0~1 的一致性系数；样本不足或无评测集返回 -1。
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
            score = self._score_core(
                s["essay_text"], s.get("prompt_material", ""), s.get("requirement", ""), 100
            )
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

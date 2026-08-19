"""申论批改对比点评（WBS 4.1 增强）：将考生作答与高分范文做维度级对比，给出差距分析与改进建议。

设计：
- 不依赖 RAG（与 tutor_agent 检索链路解耦），仅复用 EssayGrader 与 generate_model_essay。
- 范文维度分：直接走 EssayGrader._score_core（绕过人 AI 一致性闸门，避免评测集开销与重复转人工）。
- 考生维度：优先使用前端已算好的批改结果（避免两次评分漂移）；缺失时再独立评分。
- LLM 不可用时降级为基于维度差的启发式对比，保证功能可用、绝不抛 500。
"""
import json
import re

from app.ai.essay_grader import DIMENSIONS, EssayGrader
from app.ai.essay_model import generate_model_essay
from app.ai.llm_gateway import LLMGateway

_SYSTEM = (
    "你是申论阅卷组资深点评专家。请对比【考生作答】与【高分范文】，"
    "从立意、结构、论证、语言、素材五个维度指出考生的具体差距与可操作的改进建议。"
    "只输出 JSON，不要任何解释文字。"
)


def _score_model(model_essay: str, material: str, requirement: str, max_score: int):
    """给范文打分（绕过一致性闸门，直接取核心评分）；异常时返回中性默认分，保证不崩。"""
    try:
        sc = EssayGrader()._score_core(model_essay, material, requirement, max_score)
        return sc.total, sc.dimensions
    except Exception:
        per = max_score / len(DIMENSIONS)
        return round(per * len(DIMENSIONS), 1), {d: per for d in DIMENSIONS}


def compare_essay(
    student_essay: str,
    material: str = "",
    requirement: str = "",
    max_score: int = 100,
    model_essay: str | None = None,
    student_dimensions: dict | None = None,
    student_total: float | None = None,
) -> dict:
    # 1) 确保有范文（前端已生成则直接复用，省一次生成）
    if not model_essay:
        me = generate_model_essay(material, requirement)
        model_essay = me.get("model_essay", "")
    # 2) 范文打分
    model_total, model_dims = _score_model(model_essay, material, requirement, max_score)
    # 3) 考生维度（优先用已算好的，避免重复评分漂移）
    if not student_dimensions:
        ss = EssayGrader()._score_core(student_essay, material, requirement, max_score)
        student_dimensions = ss.dimensions
        student_total = ss.total
    # 4) LLM 生成对比点评；失败降级为启发式
    try:
        gaps, suggestions, narrative = _llm_compare(
            student_essay, model_essay, material, requirement,
            student_dimensions, model_dims, max_score,
        )
        offline = False
    except Exception:
        gaps, suggestions, narrative = _heuristic_compare(student_dimensions, model_dims, max_score)
        offline = True
    return {
        "student_total": student_total,
        "model_total": model_total,
        "student_dimensions": student_dimensions,
        "model_dimensions": model_dims,
        "gaps": gaps,
        "suggestions": suggestions,
        "narrative": narrative,
        "model_essay": model_essay,
        "offline": offline,
    }


def _llm_compare(student_essay, model_essay, material, requirement, student_dims, model_dims, max_score):
    per = max_score / len(DIMENSIONS)
    dims_block = "\n".join(
        f"- {d}：考生 {student_dims.get(d, 0):.1f} / 范文 {model_dims.get(d, 0):.1f}（满分 {per:.0f}）"
        for d in DIMENSIONS
    )
    prompt = (
        f"【材料】\n{material}\n\n"
        f"【作答要求】\n{requirement}\n\n"
        f"【考生作答】\n{student_essay}\n\n"
        f"【高分范文】\n{model_essay}\n\n"
        f"五维当前分差：\n{dims_block}\n\n"
        "请输出 JSON：\n"
        '{"gaps":[{"dimension":"<维度名>","comment":"<针对该维度考生与范文的具体差距，1-2句>"}],'
        '"suggestions":["<可操作改进建议1>","<建议2>"],'
        '"narrative":"<80字总体对比点评，说明差距主要在哪、如何缩小>"}'
    )
    resp = LLMGateway().complete(prompt, system=_SYSTEM, temperature=0.3, max_tokens=900)
    return _parse_compare(resp.content)


def _parse_compare(text: str):
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if not m:
        raise ValueError("LLM 未返回可解析 JSON")
    obj = json.loads(m.group(0))
    gaps = []
    for g in obj.get("gaps", []):
        d = g.get("dimension", "")
        if d in DIMENSIONS:
            gaps.append({"dimension": d, "comment": str(g.get("comment", ""))})
    # 保证五维齐全（缺失维度补空点评，避免前端缺轴）
    have = {g["dimension"] for g in gaps}
    for d in DIMENSIONS:
        if d not in have:
            gaps.append({"dimension": d, "comment": ""})
    suggestions = [str(s) for s in obj.get("suggestions", [])][:6]
    narrative = str(obj.get("narrative", ""))
    if not narrative:
        raise ValueError("LLM 返回空总评")
    return gaps, suggestions, narrative


def _heuristic_compare(student_dims, model_dims, max_score):
    per = max_score / len(DIMENSIONS)
    gaps = []
    for d in DIMENSIONS:
        diff = model_dims.get(d, per) - student_dims.get(d, 0)
        comment = "" if abs(diff) < per * 0.15 else f"本维度与范文差距约 {diff:.0f} 分，建议重点加强。"
        gaps.append({"dimension": d, "comment": comment})
    suggestions = [
        "对照范文结构提纲，补齐分论点并标注材料依据，强化立意集中度。",
        "每段开头用一句话点明分论点，让阅卷人一眼抓住逻辑。",
        "增加材料关键词与数据的引用，提升论证充实度与素材维度。",
    ]
    weakest = min(DIMENSIONS, key=lambda d: student_dims.get(d, 0))
    narrative = (
        f"AI 点评服务暂不可用，已按维度分差给出参考：当前最弱维度为「{weakest}」，"
        "建议结合范文提纲逐段对照改写。"
    )
    return gaps, suggestions, narrative

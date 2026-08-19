"""申论范文生成（WBS 4.1 增强）：基于材料与要求生成高分范文 + 结构提纲 + 高分要点。

不依赖 RAG（与 tutor_agent 的检索链路解耦）；仅用 LLM 生成。
LLM 不可用时返回友好提示（offline=True），绝不抛 500。
"""
import re

from app.ai.llm_gateway import LLMGateway

_SYSTEM = (
    "你是申论阅卷组资深命题与范文撰写专家，擅长写出符合机关行文规范、"
    "紧扣材料、逻辑严密、语言规范的高分申论范文。输出必须基于给定材料，"
    "不脱离材料空谈，分论点须有材料支撑。"
)


def _build_prompt(material: str, requirement: str) -> str:
    req_block = f"【作答要求】\n{requirement}\n\n" if requirement else ""
    mat_block = f"【给定材料】\n{material}\n\n" if material else ""
    return (
        f"{mat_block}{req_block}"
        "请按以下结构输出一篇高分申论大作文范文（建议 1000–1200 字），"
        "严格使用下面三级标题，不要输出标题之外的前言或结尾说明：\n\n"
        "## 范文\n"
        "<基于材料写出完整范文，分若干自然段，紧扣主题、论点清晰、论证充实、语言规范>\n\n"
        "## 结构提纲\n"
        "- 开头：<一句话点明总论点>\n"
        "- 分论点一：<论点 + 材料依据>\n"
        "- 分论点二：<论点 + 材料依据>\n"
        "- 分论点三：<论点 + 材料依据>\n"
        "- 结尾：<回扣主题、升华>\n\n"
        "## 高分要点\n"
        "- <要点1：如立意准确、紧扣材料>\n"
        "- <要点2：如结构清晰、逻辑递进>\n"
        "- <要点3：如语言规范、论据充实>\n"
    )


def _bullets(body: str) -> list[str]:
    items: list[str] = []
    for line in body.splitlines():
        line = line.strip()
        if not line:
            continue
        m = re.match(r"^[-*]\s+(.*)$", line) or re.match(r"^\d+[.、]\s+(.*)$", line)
        if m:
            items.append(m.group(1).strip())
        else:
            items.append(line)
    return items


def _parse_sections(text: str) -> dict:
    """按 '## 标题' 切分范文 / 提纲 / 要点；解析失败则整体作为范文。"""
    if "## 范文" not in text:
        return {"model_essay": text.strip(), "outline": [], "key_points": [], "offline": False}
    parts = re.split(r"##\s+", text)
    model_essay = ""
    outline: list[str] = []
    key_points: list[str] = []
    for seg in parts[1:]:
        seg = seg.strip()
        if not seg:
            continue
        if "\n" in seg:
            header, body = seg.split("\n", 1)
        else:
            header, body = seg, ""
        header = header.strip()
        body = body.strip()
        if header.startswith("范文"):
            model_essay = body
        elif header.startswith("结构提纲"):
            outline = _bullets(body)
        elif header.startswith("高分要点"):
            key_points = _bullets(body)
    if not model_essay:
        model_essay = text.strip()
    return {"model_essay": model_essay, "outline": outline, "key_points": key_points, "offline": False}


def generate_model_essay(material: str, requirement: str) -> dict:
    """生成高分范文 + 结构提纲 + 高分要点；LLM 失败时降级为提示文本。

    返回 {model_essay, outline, key_points, offline}。
    """
    prompt = _build_prompt(material or "", requirement or "")
    try:
        resp = LLMGateway().complete(prompt, system=_SYSTEM, temperature=0.5, max_tokens=2000)
        return _parse_sections(resp.content or "")
    except Exception:
        return {
            "model_essay": (
                "范文生成服务暂不可用（大模型调用失败），请稍后重试；"
                "写作时可参考「学习中心」的申论方法论与高分结构。"
            ),
            "outline": [],
            "key_points": [],
            "offline": True,
        }

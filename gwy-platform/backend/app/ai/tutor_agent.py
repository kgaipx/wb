"""AI 私教 Agent（方案 c5 方向1：逐题讲解 + 错题诊断 / WBS 3.1）。

职责：
- explain_question：结合 RAG 给出考点、思路、用户错因与下一步练习建议（方案 c12 信号：错题复错率下降）。
- diagnose_mistakes：基于能力图谱定位薄弱知识点，驱动自适应推送。

实现：检索题目相关知识片段 → 编排 prompt 约束 LLM 紧扣考点讲解 → 返回可追溯来源。
"""
from app.ai.llm_gateway import LLMGateway
from app.ai.rag import KnowledgeRetriever
from app.models import AbilityProfile, Question


_SYSTEM = (
    "你是耐心、专业、不说废话的公务员考试私教，曾是资深行测/申论讲师。"
    "讲解要直击考点与解题套路，给出可复用的方法论，避免空话与寒暄。"
    "若资料不足，基于公考常识作答并提示『此为通用讲解，非官方口径』。"
)

# 按题型/科目给出的实战解题方法论锚点，用于增强讲解的专业度与可操作性。
_TECH_HINTS = {
    "判断推理": "逻辑判断抓『搭桥/拆桥』与削弱加强常见模型；图推熟记『对称、笔画数、封闭区域、位置平移』规律；定义判断用『主体+核心要件』逐一比对选项。",
    "数量关系": "优先『代入排除法』『尾数/整除特性』『赋值法』；难题果断跳过保平均分，不在单题恋战。",
    "资料分析": "先读问题再定位数据，善用『截位直除法』『增长率比较』『比重差分』，单题控制在 60 秒内。",
    "言语理解与表达": "片段阅读先看问题再读文段，抓『主题词』与『转折/因果』引导的主旨；逻辑填空用『语境呼应+词语搭配』排除。",
    "常识判断": "聚焦时政、法律、科技高频考点，用『排除绝对项表述』『关联生活常识』提高判断命中。",
    "申论": "审题先定『作答范围与身份』，要点来自材料原词原句，分条作答、序号清晰，论证用『观点+材料+分析』结构。",
    "行测": "行测核心是『取舍与节奏』：先做擅长模块，难题标记后跳，保证会做的题不丢分。",
}

_DEFAULT_TECH = (
    "紧扣公考实战：先判断题型与考点，再选最稳妥的解法（代入排除、选项对比、关键词定位、"
    "首尾句找主旨等），并提醒常见干扰项设计。"
)


def _tech_hint(question: Question) -> str:
    return (
        _TECH_HINTS.get(question.category)
        or _TECH_HINTS.get(question.subject)
        or _DEFAULT_TECH
    )


class TutorAgent:
    def __init__(self) -> None:
        self.gateway = LLMGateway()
        self.retriever = KnowledgeRetriever(self.gateway)

    def explain_question(self, question: Question, user_selected: str | None = None) -> dict:
        """逐题讲解：返回思路、知识点、用户错因、易错点、练习建议、避坑口诀。

        LLM 不可用时降级为 RAG 检索摘要 + 题型方法论（与 chat() 一致），绝不抛 500。
        返回 {knowledge_point, explanation, citations, model, offline}。
        """
        query = f"{question.stem} 知识点：{question.knowledge_point} 题型：{question.category or question.subject}"
        chunks = self.retriever.retrieve(query, top_k=4)

        context = (
            "参考资料：\n" + "\n".join(f"- {c.content}（来源：{c.source}）" for c in chunks)
            if chunks
            else "（无检索到专属资料，基于通用公考知识讲解）"
        )

        label_to_content = {o.label: o.content for o in question.options}
        correct = [o.label for o in question.options if o.is_correct]
        correct_full = "、".join(f"{l}（{label_to_content[l]}）" for l in correct)
        user_sel = (user_selected or "").strip()
        user_full = (
            "、".join(f"{l}（{label_to_content[l]}）" for l in user_sel.split() if l in label_to_content)
            if user_sel
            else "未作答"
        )

        tech = _tech_hint(question)

        prompt = (
            f"{context}\n\n"
            f"【题目】（{question.subject}/{question.category or '—'}，难度{question.difficulty}，"
            f"知识点：{question.knowledge_point}）\n"
            f"题干：{question.stem}\n"
            f"选项：\n" + "\n".join(f"{o.label}. {o.content}" for o in question.options) + "\n"
            f"正确答案：{''.join(correct)}（{correct_full}）\n"
            f"用户作答：{user_sel or '未作答'}（{user_full}）\n\n"
            f"本题实战解题方法论提示：{tech}\n\n"
            "请输出结构化讲解，语言要像资深公考讲师：直击考点、给可复用解题套路、去掉寒暄与空话。\n"
            "1. 考点定位：一句话说明考什么能力/题型套路。\n"
            "2. 解题思路：从题干到答案的可操作推导，点明本题适用的实战技巧并结合选项说明。\n"
            "3. 错因诊断（仅当用户答错时写；用户未作答则跳过本条）：说明选错的具体原因与典型认知误区，对比正确项与干扰项差异。\n"
            "4. 易错点：本题高频失分陷阱（1-2 条）。\n"
            "5. 巩固建议：针对该知识点的一条具体练习/复盘动作。\n"
            "6. 避坑口诀：一句便于记忆的口诀或提醒。\n"
            "要求：每条不超过 3 句，使用中文，避免『首先、其次』式套话与机械复述题干。"
        )
        try:
            resp = self.gateway.complete(prompt, system=_SYSTEM, temperature=0.3, max_tokens=1000)
            return {
                "knowledge_point": question.knowledge_point,
                "explanation": resp.content,
                "citations": [c.source for c in chunks],
                "model": resp.model,
                "offline": False,
            }
        except Exception:
            # 离线降级：结合资料 + 解题方法论给出要点，绝不抛 500
            if chunks:
                explanation = (
                    "（当前为离线讲解模式，未接入大模型）根据资料与解题方法论给出要点：\n"
                    + "\n".join(f"- {c.content}" for c in chunks[:4])
                    + f"\n\n本题正确答案为：{correct_full}；知识点：{question.knowledge_point}。\n"
                    f"实战提示：{tech}"
                )
            else:
                explanation = (
                    "（当前为离线模式，未接入大模型，也未检索到专属资料。）"
                    f"本题正确答案为：{correct_full}；知识点：{question.knowledge_point}。\n"
                    f"实战提示：{tech}\n"
                    "你可以先去「刷题」或「错题本」巩固，或稍后重试 AI 讲解。"
                )
            return {
                "knowledge_point": question.knowledge_point,
                "explanation": explanation,
                "citations": [c.source for c in chunks],
                "model": "offline-fallback",
                "offline": True,
            }

    def chat(self, messages: list[dict], kp_hint: str | None = None) -> dict:
        """多轮对话：基于 RAG 检索 + LLM 生成；离线（LLM 不可用）时降级为检索摘要。

        返回 {answer, citations, model, offline}。offline=True 表示走降级分支。
        """
        last_user = ""
        for m in reversed(messages):
            if m.get("role") == "user":
                last_user = (m.get("content") or "").strip()
                break
        query = f"{kp_hint or ''} {last_user}".strip()
        chunks = self.retriever.retrieve(query, top_k=4)

        context = (
            "参考资料：\n" + "\n".join(f"- {c.content}（来源：{c.source}）" for c in chunks)
            if chunks
            else "（暂无检索到专属资料，基于通用公考知识作答）"
        )
        system = (
            "你是耐心、专业、不说废话的公务员考试私教，可以就备考方法、知识点、"
            "解题技巧、申论写作、心态与时间规划等给出可操作建议。讲解要直击要点，"
            "避免空话。若资料不足以支撑，可基于通用公考常识作答，并提示『此为通用建议，非官方口径』。"
        )
        history = "\n".join(
            f"{'学员' if m.get('role') == 'user' else '私教'}：{m.get('content', '')}" for m in messages
        )
        prompt = (
            f"{context}\n\n【对话历史】\n{history}\n\n"
            "请基于上述资料与历史，针对学员最新问题给出清晰、分点、可操作的回答。"
        )
        try:
            resp = self.gateway.complete(prompt, system=system, temperature=0.4, max_tokens=900)
            return {
                "answer": resp.content,
                "citations": [c.source for c in chunks],
                "model": resp.model,
                "offline": False,
            }
        except Exception:
            # 离线降级：仅用检索片段拼接摘要，绝不抛 500
            if chunks:
                answer = (
                    "（当前为离线检索模式，未接入大模型）根据资料：\n"
                    + "\n".join(f"- {c.content}" for c in chunks[:3])
                )
            else:
                answer = (
                    "（当前为离线模式，暂未接入大模型，也未检索到相关资料。）"
                    "你可以先去「刷题」或「错题本」练习，或换更具体的关键词再问。"
                )
            return {
                "answer": answer,
                "citations": [c.source for c in chunks],
                "model": "offline-fallback",
                "offline": True,
            }

    @staticmethod
    def diagnose_mistakes(abilities: list[AbilityProfile], weak_threshold: float = 0.6) -> list[str]:
        """错题诊断：返回掌握度低于阈值的薄弱知识点（按掌握度升序）。"""
        weak = [a for a in abilities if a.mastery < weak_threshold]
        weak.sort(key=lambda a: a.mastery)
        return [a.knowledge_point for a in weak]

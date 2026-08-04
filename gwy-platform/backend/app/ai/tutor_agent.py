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
    "你是耐心、专业、不说废话的公务员考试私教。讲解要直击考点与解题套路，"
    "避免空话。若资料不足，基于公考常识作答并提示『此为通用讲解，非官方口径』。"
)


class TutorAgent:
    def __init__(self) -> None:
        self.gateway = LLMGateway()
        self.retriever = KnowledgeRetriever(self.gateway)

    def explain_question(self, question: Question, user_selected: str | None = None) -> dict:
        """逐题讲解：返回思路、知识点、用户错因、易错点、练习建议。"""
        query = f"{question.stem} 知识点：{question.knowledge_point}"
        chunks = self.retriever.retrieve(query, top_k=4)

        context = (
            "参考资料：\n"
            + "\n".join(f"- {c.content}（来源：{c.source}）" for c in chunks)
            if chunks
            else "（无检索到专属资料，基于通用公考知识讲解）"
        )

        correct = [o.label for o in question.options if o.is_correct]
        prompt = (
            f"{context}\n\n"
            f"【题目】（{question.subject}/{question.category}，难度{question.difficulty}，知识点：{question.knowledge_point}）\n"
            f"题干：{question.stem}\n"
            f"选项：\n" + "\n".join(f"{o.label}. {o.content}" for o in question.options) + "\n"
            f"标准答案：{''.join(correct)}\n"
            f"用户作答：{user_selected or '未作答'}\n\n"
            "请输出结构化讲解：\n"
            "1. 考点：一句话点明考查什么。\n"
            "2. 解题思路：从题干到答案的推导。\n"
            "3. 用户错因分析（如用户作答且答错）：指出为什么错、典型误区。\n"
            "4. 易错点：本题高频失分点。\n"
            "5. 下一步：针对该知识点的一个巩固练习建议。"
        )
        resp = self.gateway.complete(prompt, system=_SYSTEM, temperature=0.3, max_tokens=900)
        return {
            "knowledge_point": question.knowledge_point,
            "explanation": resp.content,
            "citations": [c.source for c in chunks],
            "model": resp.model,
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

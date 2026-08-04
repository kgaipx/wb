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

    @staticmethod
    def diagnose_mistakes(abilities: list[AbilityProfile], weak_threshold: float = 0.6) -> list[str]:
        """错题诊断：返回掌握度低于阈值的薄弱知识点（按掌握度升序）。"""
        weak = [a for a in abilities if a.mastery < weak_threshold]
        weak.sort(key=lambda a: a.mastery)
        return [a.knowledge_point for a in weak]

"""AI 私教 Agent（方案 c5 方向1：逐题讲解 + 错题诊断）。

职责：
- 逐题讲解：结合 RAG 给出概念、思路、易错点
- 错题诊断：基于学情画像定位薄弱知识点
- 能力诊断：输出弱项清单，驱动自适应推送（见 adaptive.py）

验证信号（方案 c12）：错题复错率下降。
"""
from app.ai.llm_gateway import LLMGateway
from app.ai.rag import KnowledgeRetriever


class TutorAgent:
    def __init__(self) -> None:
        self.gateway = LLMGateway()
        self.retriever = KnowledgeRetriever(self.gateway)

    def explain_question(self, question_id: str, user_answer: str) -> str:
        """逐题讲解：返回思路、知识点、用户错因。"""
        # TODO(WBS 3.1): 拉取题目 + RAG 检索 + Agent 编排
        raise NotImplementedError("私教讲解待实现")

    def diagnose_mistakes(self, user_id: str) -> list[str]:
        """错题诊断：返回薄弱知识点列表。"""
        # TODO(WBS 3.2): 结合 adaptive.py 能力图谱
        raise NotImplementedError("错题诊断待实现")

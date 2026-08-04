"""RAG 知识库（方案 c5：AI 私教 + 内容可信的底座）。

职责：
- 索引公考法规 / 时政 / 真题解析到向量库
- 检索增强生成（RAG）约束 LLM，降低幻觉（方案 c11 P0 风险）
- 关键结论提供溯源（方案 c10 AI 合规要求）

MVP 阶段先定义接口，接入 Tencent Cloud VectorDB 或 Milvus。
"""
from dataclasses import dataclass
from typing import Any

from app.ai.llm_gateway import LLMGateway


@dataclass
class RetrievedChunk:
    content: str
    source: str  # 必须可追溯来源（政策/真题出处）
    score: float


class KnowledgeRetriever:
    def __init__(self, gateway: LLMGateway | None = None) -> None:
        self.gateway = gateway or LLMGateway()

    def retrieve(self, query: str, top_k: int = 5) -> list[RetrievedChunk]:
        """按 query 召回 top_k 个带来源的知识片段。"""
        # TODO(WBS 3.1): 接入向量库检索 + 重排
        raise NotImplementedError("RAG 检索待接入向量库（Milvus / Tencent Cloud VectorDB）")

    def answer_with_citation(self, query: str) -> dict[str, Any]:
        """带引用的问答：先检索再生成，返回答案与来源列表。"""
        chunks = self.retrieve(query)
        # TODO: 拼装 prompt 约束 LLM 仅基于 chunks 作答，并输出引用
        return {"answer": "", "citations": [c.source for c in chunks]}

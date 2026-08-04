"""RAG 知识库（方案 c5：AI 私教 + 内容可信的底座 / WBS 3.1）。

MVP 阶段：知识以关系库 KnowledgeChunk 存储，检索采用「词项重叠 + 来源加权」的轻量实现，
无需外部向量库即可本地零依赖运行。规模化接入 Milvus / Tencent Cloud VectorDB 时，
仅需替换 retrieve() 内部实现，answer_with_citation 与上层调用不变。

设计要点（呼应方案 c11 P0 风险）：
- 检索召回带来源，生成时强制 LLM 仅依据给定片段作答并标注引用，降低幻觉。
- is_verified 过滤：默认只检索双签通过的内容。
"""
from dataclasses import dataclass
from typing import Any

from app.ai.llm_gateway import LLMGateway
from app.db.session import SessionLocal
from app.models import KnowledgeChunk


@dataclass
class RetrievedChunk:
    content: str
    source: str  # 必须可追溯来源（政策/真题出处）
    score: float


_SYSTEM = (
    "你是公务员考试辅导的检索增强问答助手。只能依据下方【参考资料】作答，"
    "不得编造资料以外的知识点。回答中在相关句末用 [1]、[2] 标注引用序号，"
    "对应下方资料编号。若资料不足以回答，明确说明『资料不足』。"
)


class KnowledgeRetriever:
    def __init__(self, gateway: LLMGateway | None = None) -> None:
        self.gateway = gateway or LLMGateway()

    def retrieve(self, query: str, top_k: int = 5, verified_only: bool = True) -> list[RetrievedChunk]:
        """词项重叠检索：对知识点/题干做分词，按重叠词数打分取 top_k。"""
        db = SessionLocal()
        try:
            q = db.query(KnowledgeChunk)
            if verified_only:
                q = q.filter(KnowledgeChunk.is_verified == True)  # noqa: E712
            chunks = q.all()
        finally:
            db.close()

        terms = self._tokenize(query)
        if not terms:
            return []

        scored: list[tuple[float, KnowledgeChunk]] = []
        for c in chunks:
            overlap = len(set(self._tokenize(c.content)) & terms)
            if overlap == 0:
                continue
            # 来源权威度轻微加权（有 source_url 视为官方出处）
            weight = 1.0 + (0.1 if c.source_url else 0.0)
            scored.append((overlap * weight, c))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [
            RetrievedChunk(content=c.content, source=c.source, score=s)
            for s, c in scored[:top_k]
        ]

    def answer_with_citation(self, query: str, top_k: int = 5) -> dict[str, Any]:
        """带引用的问答：先检索再生成，返回答案与来源列表。"""
        chunks = self.retrieve(query, top_k=top_k)
        if not chunks:
            return {"answer": "暂无相关知识库内容，建议补充权威资料后重试。", "citations": []}

        context = "\n\n".join(f"[{i+1}] {c.content}（来源：{c.source}）" for i, c in enumerate(chunks))
        prompt = (
            f"【参考资料】\n{context}\n\n"
            f"【用户问题】\n{query}\n\n请基于参考资料作答并标注引用。"
        )
        resp = self.gateway.complete(prompt, system=_SYSTEM, temperature=0.2, max_tokens=800)
        return {"answer": resp.content, "citations": [c.source for c in chunks]}

    @staticmethod
    def _tokenize(text: str) -> set[str]:
        """极简中文/英文分词：英文按词、中文按 2-gram + 单字。"""
        import re

        text = text.lower()
        words = set(re.findall(r"[a-z0-9]+", text))
        # 中文按字符 + 2-gram，提升召回
        cjk = re.findall(r"[\u4e00-\u9fff]", text)
        words.update(cjk)
        words.update("".join(p) for p in zip(cjk, cjk[1:]))
        # 过滤停用单字
        stop = {"的", "了", "是", "与", "和", "在", "为", "对", "及", "或", "最", "该", "这", "那"}
        return {w for w in words if w not in stop and len(w) >= 1}

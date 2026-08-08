"""RAG 知识库（方案 c5：AI 私教 + 内容可信的底座 / WBS 3.1）。

MVP 阶段：知识以关系库 KnowledgeChunk 存储，检索采用「词项重叠 + 来源加权」的轻量实现，
无需外部向量库即可本地零依赖运行。规模化接入 Milvus / Tencent Cloud VectorDB 时，
仅需替换 retrieve() 内部实现，answer_with_citation 与上层调用不变。

设计要点（呼应方案 c11 P0 风险）：
- 检索召回带来源，生成时强制 LLM 仅依据给定片段作答并标注引用，降低幻觉。
- is_verified 过滤：默认只检索双签通过的内容。
"""
import math
from collections import defaultdict
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
    kp: str | None = None  # 知识点标签（用于前端展示知识卡片）
    title: str | None = None  # 片段标题（缺省回退 source）


def _chunk_cite(c: "RetrievedChunk") -> dict:
    """把检索片段转成富引用对象（知识点 + 标题 + 来源 + 相关度），供前端渲染知识卡片。"""
    return {
        "title": c.title or c.source or "知识片段",
        "kp": c.kp,
        "source": c.source,
        "score": c.score,
    }


# 大类 → 该大类下的技能知识点集合（与 KnowledgeChunk.kp 对齐）。
# 题目 knowledge_point 多为宽泛大类（如「资料分析」「判断推理」），少数直接是具体技能名
# （如「增长率」「图形推理」）。无论哪种，都把对应技能片段上浮到主导位，
# 压过题干高频字噪声重叠。集合依据生产库 33 个 chunk.kp 实测整理。
_CATEGORY_KP: dict[str, set[str]] = {
    "资料分析": {"增长率", "比重", "基期现期", "平均数", "倍数", "速算技巧", "隔年增长率",
                 "增长量", "进出口", "拉动增长", "贡献率", "产销率", "利润率", "指数", "单位换算", "资料分析陷阱"},
    "数量关系": {
        "行程问题", "工程问题", "年龄问题", "排列组合",
        "集合容斥", "时钟问题", "利润问题", "数列",
        "几何问题", "最值问题", "经济利润", "代入排除法",
        "概率", "溶液", "牛吃草", "植树问题", "星期日期", "统筹优化", "过河问题",
    },
    "判断推理": {
        "图形推理", "定义判断", "类比推理", "翻译推理",
        "削弱论证", "加强论证", "逻辑判断",
        "集合推理", "前提假设", "解释评价",
    },
    "言语理解与表达": {"逻辑填空", "片段阅读", "语句排序", "病句辨析", "语句填空", "词语辨析", "标点符号"},
    "常识判断": {"时政常识", "公文常识", "法律常识", "科技常识", "经济常识", "历史常识", "地理常识", "人文常识"},
    "申论": {"归纳概括", "提出对策", "综合分析", "贯彻执行", "大作文"},
}
# 行测（subject 级）回退：覆盖全部行测大类技能
_CATEGORY_KP["行测"] = set().union(*[v for k, v in _CATEGORY_KP.items() if k != "申论"])



_SYSTEM = (
    "你是公务员考试辅导的检索增强问答助手。只能依据下方【参考资料】作答，"
    "不得编造资料以外的知识点。回答中在相关句末用 [1]、[2] 标注引用序号，"
    "对应下方资料编号。若资料不足以回答，明确说明『资料不足』。"
)


class KnowledgeRetriever:
    def __init__(self, gateway: LLMGateway | None = None) -> None:
        self.gateway = gateway or LLMGateway()

    def retrieve(
        self,
        query: str,
        top_k: int = 5,
        verified_only: bool = True,
        focus_kp: str | None = None,
    ) -> list[RetrievedChunk]:
        """相关性检索：IDF 词项加权 + 知识点(kp)命中强加权 + MMR-lite 去冗余。

        相比旧版「纯词项重叠计数」，本轮改进：
        - IDF：稀有词（如「增长率」「图形推理」）权重高，常见汉字/2-gram 自然降级，
          避免题干里的「年/月/亿/同比」等高频噪声把无关片段顶上来。
        - kp 命中：chunk.kp 直接出现在 query 或 focus_kp 串中是最强主题信号，给予大幅加成
          （kp 越长越具体加成越高），保证「资料分析-增长率」类题目优先召回「增长率」片段。
        - MMR-lite：返回前按内容相似度去冗余，避免 top_k 全是高度相似片段。
        """
        db = SessionLocal()
        try:
            q = db.query(KnowledgeChunk)
            if verified_only:
                q = q.filter(KnowledgeChunk.is_verified == True)  # noqa: E712
            chunks = q.all()
        finally:
            db.close()

        if not chunks:
            return []

        # 1) 语料 IDF：稀有词权重高，常见词自然降级
        n = len(chunks)
        df: dict[str, int] = defaultdict(int)
        chunk_terms: list[set[str]] = []
        for c in chunks:
            ct = self._tokenize(c.content)
            chunk_terms.append(ct)
            for t in ct:
                df[t] += 1
        idf = {t: math.log((n + 1) / (v + 1)) + 1.0 for t, v in df.items()}

        # 2) 查询词 + 焦点知识点
        q_terms = self._tokenize(query)
        focus_terms = self._tokenize(focus_kp) if focus_kp else set()
        # 大类映射：题目 knowledge_point 常为宽泛大类（「资料分析」），
        # 取该大类下的全部技能集合，用于把同类技能片段整体上浮。
        focus_cat = focus_kp.split("-")[0] if (focus_kp and "-" in focus_kp) else (focus_kp or "")
        focus_cat_kps = _CATEGORY_KP.get(focus_cat, set())

        scored: list[tuple[float, KnowledgeChunk, set[str]]] = []
        for c, ct in zip(chunks, chunk_terms):
            overlap = ct & q_terms
            if not overlap and not focus_terms:
                continue
            # IDF 加权词项重叠
            score = sum(idf.get(t, 1.0) for t in overlap)
            # 知识点命中：最强主题信号
            # 题目 knowledge_point 即确定性主题标签，可能形如「资料分析-增长率」(具体技能)
            # 或「资料分析」(大类)。无论哪种，命中都须主导排序，压过题干高频字噪声重叠。
            if c.kp:
                if (focus_kp and c.kp in focus_kp) or c.kp in query:
                    score += 40.0 + 3.0 * len(c.kp)  # 精确命中具体技能：主导加成
                elif c.kp in focus_cat_kps:
                    score += 30.0 + 2.0 * len(c.kp)  # 命中所属大类：该大类全部技能片段上浮
                elif focus_terms & ct:
                    score += 1.5 * len(focus_terms & ct)
            # 来源权威度轻微加权（有 source_url 视为官方出处）
            if c.source_url:
                score *= 1.05
            if score > 0:
                scored.append((score, c, ct))

        if not scored:
            return []

        # 3) 按分数降序，MMR-lite 去冗余，保证返回不同主题而非高度相似片段
        scored.sort(key=lambda x: x[0], reverse=True)
        picked: list[tuple[float, KnowledgeChunk]] = []
        picked_terms: list[set[str]] = []
        for score, c, ct in scored:
            if any(self._jaccard(ct, pct) > 0.8 for pct in picked_terms):
                continue
            picked.append((score, c))
            picked_terms.append(ct)
            if len(picked) >= top_k:
                break

        return [
            RetrievedChunk(content=c.content, source=c.source, score=round(s, 3), kp=c.kp, title=c.title)
            for s, c in picked
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
        return {"answer": resp.content, "citations": [_chunk_cite(c) for c in chunks]}

    @staticmethod
    def _jaccard(a: set[str], b: set[str]) -> float:
        """两词条集合的 Jaccard 相似度，用于 MMR-lite 去冗余。"""
        if not a or not b:
            return 0.0
        return len(a & b) / len(a | b)

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

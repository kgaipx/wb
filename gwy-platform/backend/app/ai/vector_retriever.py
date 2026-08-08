"""向量检索器（语义召回底座）。

支持两种嵌入后端，自动选择：
- 云端（默认，优先）：阿里云百炼 / 通义千问 text-embedding-v3，通过 EMBEDDING_API_KEY 启用。
  质量高、跨语义召回强、零服务器内存占用（适配本机 2G 小内存实例）。
- 本地（兜底）：BAAI/bge-small-zh-v1.5（fastembed / onnxruntime，无需 torch、无需 key），
  适配无 key 或离线环境。

嵌入向量缓存到 knowledge_embeddings 表（幂等 CREATE TABLE IF NOT EXISTS，切换后端自动清表重建）。
VectorRetriever.retrieve 与 KnowledgeRetriever.retrieve 同签名，可直接替换或融合。
HybridRetriever：向量语义召回为主、词项+KP 命中为辅融合排序；向量不可用时自动降级纯词项。
"""
import json
import math
import time
from collections import defaultdict
from typing import Any

import sqlalchemy
from openai import OpenAI

from app.ai.llm_gateway import LLMGateway
from app.core.config import settings
from app.db.session import SessionLocal
from app.models import KnowledgeChunk

# 与主 rag.py 保持一致的 KP 大类映射（题目 knowledge_point 宽泛时上浮同类技能片段）
_CATEGORY_KP: dict[str, set[str]] = {
    "资料分析": {"增长率", "比重", "基期现期", "平均数", "倍数", "速算技巧", "隔年增长率",
                 "增长量", "进出口", "拉动增长", "贡献率", "产销率", "利润率", "指数", "单位换算", "资料分析陷阱"},
    "数量关系": {"行程问题", "工程问题", "年龄问题", "排列组合", "集合容斥", "时钟问题", "利润问题",
                 "数列", "几何问题", "最值问题", "经济利润", "代入排除法", "概率", "溶液", "牛吃草",
                 "植树问题", "星期日期", "统筹优化", "过河问题"},
    "判断推理": {"图形推理", "定义判断", "类比推理", "翻译推理", "削弱论证", "加强论证", "逻辑判断",
                 "集合推理", "前提假设", "解释评价"},
    "言语理解与表达": {"逻辑填空", "片段阅读", "语句排序", "病句辨析", "语句填空", "词语辨析", "标点符号"},
    "常识判断": {"时政常识", "公文常识", "法律常识", "科技常识", "经济常识", "历史常识", "地理常识", "人文常识"},
    "申论": {"归纳概括", "提出对策", "综合分析", "贯彻执行", "大作文"},
}
_CATEGORY_KP["行测"] = set().union(*[v for k, v in _CATEGORY_KP.items() if k != "申论"])

# 云端：阿里云百炼（通义千问）OpenAI 兼容接口
_CLOUD_BASE = "https://dashscope.aliyuncs.com/compatible-mode/v1"
_CLOUD_MODEL = "text-embedding-v3"
# 本地：fastembed 中文小模型
_LOCAL_MODEL = "BAAI/bge-small-zh-v1.5"
_LOCAL_QUERY_PREFIX = "为这个句子生成表示："
_BATCH = 10  # 通义千问 text-embedding-v3 单次批量上限为 10 条


def _tokenize(text: str) -> set[str]:
    import re

    text = text.lower()
    words = set(re.findall(r"[a-z0-9]+", text))
    cjk = re.findall(r"[\u4e00-\u9fff]", text)
    words.update(cjk)
    words.update("".join(p) for p in zip(cjk, cjk[1:]))
    stop = {"的", "了", "是", "与", "和", "在", "为", "对", "及", "或", "最", "该", "这", "那"}
    return {w for w in words if w not in stop and len(w) >= 1}


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def _ensure_table(db) -> None:
    db.execute(sqlalchemy.text(
        "CREATE TABLE IF NOT EXISTS knowledge_embeddings ("
        "chunk_id INTEGER PRIMARY KEY, vec TEXT NOT NULL, model TEXT)"
    ))


class VectorRetriever:
    """嵌入向量检索。云端优先（有 key），无 key 回退本地 fastembed。"""

    def __init__(self) -> None:
        self._model = None
        self._client = None
        self.use_cloud = bool(settings.EMBEDDING_API_KEY)
        self.backend = "cloud" if self.use_cloud else "local"
        self.available = True

    # ---- 后端：云端（通义千问 text-embedding-v3） ----
    def _get_client(self) -> OpenAI:
        if self._client is None:
            self._client = OpenAI(
                api_key=settings.EMBEDDING_API_KEY,
                base_url=_CLOUD_BASE,
            )
        return self._client

    def _encode_cloud(self, texts: list[str]) -> list[list[float]]:
        client = self._get_client()
        out: list[list[float]] = []
        for i in range(0, len(texts), _BATCH):
            batch = texts[i : i + _BATCH]
            last: Exception | None = None
            for attempt in range(3):
                try:
                    resp = client.embeddings.create(model=_CLOUD_MODEL, input=batch)
                    out.extend(self._l2(d.embedding) for d in resp.data)
                    last = None
                    break
                except Exception as e:  # noqa: BLE001
                    last = e
                    time.sleep(1.0 * (attempt + 1))
            if last is not None:
                raise last
        return out

    # ---- 后端：本地（fastembed bge-small-zh） ----
    def _load_local(self) -> None:
        if self._model is None:
            from fastembed import TextEmbedding

            self._model = TextEmbedding(_LOCAL_MODEL)

    def _encode_local(self, texts: list[str]) -> list[list[float]]:
        self._load_local()
        vecs = list(self._model.embed(texts))
        return [self._l2(v) for v in vecs]

    @staticmethod
    def _l2(vec) -> list[float]:
        import numpy as np

        a = np.asarray(vec, dtype=np.float32)
        n = float(np.linalg.norm(a))
        if n == 0:
            return a.tolist()
        return (a / n).tolist()

    def _encode(self, text: str, is_query: bool = True) -> list[float] | None:
        try:
            if self.use_cloud:
                return self._encode_cloud([text])[0]
            t = (_LOCAL_QUERY_PREFIX + text) if is_query else text
            return self._encode_local([t])[0]
        except Exception:  # noqa: BLE001
            self.available = False
            return None

    def _cache_embeddings(self) -> dict[int, list[float]]:
        """加载/计算所有 verified 片段的嵌入，返回 {chunk_id: vec}。"""
        db = SessionLocal()
        try:
            _ensure_table(db)
            exp_model = _CLOUD_MODEL if self.use_cloud else _LOCAL_MODEL
            row = db.execute(sqlalchemy.text(
                "SELECT model FROM knowledge_embeddings LIMIT 1"
            )).fetchone()
            if row and row[0] != exp_model:
                # 后端切换（cloud<->local），缓存维度不一致，清空重建
                db.execute(sqlalchemy.text("DELETE FROM knowledge_embeddings"))
                db.commit()
            chunks = db.query(KnowledgeChunk).filter(
                KnowledgeChunk.is_verified == True  # noqa: E712
            ).all()
            rows = db.execute(sqlalchemy.text(
                "SELECT chunk_id, vec FROM knowledge_embeddings"
            )).fetchall()
            cached = {r[0]: json.loads(r[1]) for r in rows}
            need = [c for c in chunks if c.id not in cached]
            if need:
                try:
                    if self.use_cloud:
                        vecs = self._encode_cloud([c.content for c in need])
                    else:
                        vecs = self._encode_local([c.content for c in need])
                except Exception:  # noqa: BLE001
                    self.available = False
                    return {c.id: cached[c.id] for c in chunks if c.id in cached}
                for c, v in zip(need, vecs):
                    cached[c.id] = v
                    db.execute(sqlalchemy.text(
                        "INSERT OR REPLACE INTO knowledge_embeddings (chunk_id, vec, model) "
                        "VALUES (:cid, :vec, :model)"
                    ), {"cid": c.id, "vec": json.dumps(v, ensure_ascii=False), "model": exp_model})
                db.commit()
            return {c.id: cached[c.id] for c in chunks}
        finally:
            db.close()

    def retrieve(
        self,
        query: str,
        top_k: int = 5,
        verified_only: bool = True,
        focus_kp: str | None = None,
    ) -> list[tuple[float, KnowledgeChunk]]:
        try:
            emb = self._cache_embeddings()
        except Exception:  # noqa: BLE001
            self.available = False
            return []
        if not emb:
            return []
        db = SessionLocal()
        try:
            q = db.query(KnowledgeChunk)
            if verified_only:
                q = q.filter(KnowledgeChunk.is_verified == True)  # noqa: E712
            chunks = q.all()
        finally:
            db.close()

        qvec = self._encode(query, is_query=True)
        if qvec is None:
            return []

        focus_cat = focus_kp.split("-")[0] if (focus_kp and "-" in focus_kp) else (focus_kp or "")
        focus_cat_kps = _CATEGORY_KP.get(focus_cat, set())
        focus_terms = _tokenize(focus_kp) if focus_kp else set()

        scored: list[tuple[float, KnowledgeChunk, set[str]]] = []
        for c in chunks:
            vec = emb.get(c.id)
            if not vec:
                continue
            sim = sum(a * b for a, b in zip(qvec, vec))
            score = float(sim)
            # KP 命中加成（与词项检索一致，保证具体技能题主题片段主导）
            if c.kp:
                if (focus_kp and c.kp in focus_kp) or c.kp in query:
                    score += 0.35 + 0.02 * len(c.kp)
                elif c.kp in focus_cat_kps:
                    score += 0.25 + 0.015 * len(c.kp)
                elif focus_terms & _tokenize(c.content):
                    score += 0.02 * len(focus_terms & _tokenize(c.content))
            ct = _tokenize(c.content)
            scored.append((score, c, ct))

        scored.sort(key=lambda x: x[0], reverse=True)
        picked: list[tuple[float, KnowledgeChunk]] = []
        picked_terms: list[set[str]] = []
        for score, c, ct in scored:
            if any(_jaccard(ct, pct) > 0.85 for pct in picked_terms):
                continue
            picked.append((score, c))
            picked_terms.append(ct)
            if len(picked) >= top_k:
                break
        return picked


class HybridRetriever:
    """向量(语义)为主 + 词项/KP(确定主题)为辅的融合检索。向量不可用时降级纯词项。"""

    def __init__(self, gateway: LLMGateway | None = None) -> None:
        from app.ai.rag import KnowledgeRetriever

        self.gateway = gateway or LLMGateway()
        self.lexical = KnowledgeRetriever(self.gateway)
        self.vector = VectorRetriever()
        self.use_vector = self.vector.available

    def retrieve(
        self,
        query: str,
        top_k: int = 5,
        verified_only: bool = True,
        focus_kp: str | None = None,
    ) -> list:
        from app.ai.rag import RetrievedChunk

        if not self.use_vector or not self.vector.available:
            return self.lexical.retrieve(query, top_k=top_k, verified_only=verified_only, focus_kp=focus_kp)
        try:
            lex = self.lexical.retrieve(query, top_k=top_k * 3, verified_only=verified_only, focus_kp=focus_kp)
            vec = self.vector.retrieve(query, top_k=top_k * 3, verified_only=verified_only, focus_kp=focus_kp)
        except Exception:  # noqa: BLE001
            return self.lexical.retrieve(query, top_k=top_k, verified_only=verified_only, focus_kp=focus_kp)
        if not vec:
            return lex[:top_k]

        lex_norm = {it.content: it.score / (max((i.score for i in lex), default=1.0) or 1.0) for it in lex}
        vec_norm = {v[1].content: v[0] / (max((x[0] for x in vec), default=1.0) or 1.0) for v in vec}

        src = {it.content: it.source for it in lex}
        for _, c in vec:
            src.setdefault(c.content, c.source)

        merged: list[tuple[float, str, str]] = []
        for content in set(lex_norm) | set(vec_norm):
            l = lex_norm.get(content, 0.0)
            v = vec_norm.get(content, 0.0)
            combined = 0.6 * v + 0.4 * l  # 向量为主(0.6) + 词项为辅(0.4)
            merged.append((combined, content, src.get(content, "平台原创")))

        merged.sort(key=lambda x: x[0], reverse=True)
        picked: list[tuple[float, str, str]] = []
        picked_terms: list[set[str]] = []
        for score, content, source in merged:
            ct = _tokenize(content)
            if any(_jaccard(ct, pct) > 0.82 for pct in picked_terms):
                continue
            picked.append((score, content, source))
            picked_terms.append(ct)
            if len(picked) >= top_k:
                break

        return [
            RetrievedChunk(content=c, source=s, score=round(sc, 3))
            for sc, c, s in picked
        ]

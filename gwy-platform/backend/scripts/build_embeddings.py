"""预构建 knowledge_chunks 的 embedding 缓存到 knowledge_embeddings 表。

云端（EMBEDDING_API_KEY 存在，通义千问 text-embedding-v3）优先，否则本地 fastembed。
用于部署后一次性构建，避免首个检索请求耗时过长。

用法（生产）：
  DATABASE_URL=sqlite:////opt/gwy/data/gwy.db PYTHONPATH=/opt/gwy/backend \
    /opt/gwy/venv/bin/python scripts/build_embeddings.py
"""
from app.ai.vector_retriever import VectorRetriever


def main() -> None:
    v = VectorRetriever()
    emb = v._cache_embeddings()
    print(f"[build_embeddings] backend={v.backend} cached={len(emb)}", flush=True)


if __name__ == "__main__":
    main()

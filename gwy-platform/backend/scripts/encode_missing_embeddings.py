"""增量补充 knowledge_embeddings 中缺失的「已校验」片段（云端向量，绝不重建/清空缓存）。

设计目标：
- 只 INSERT 缺失行，绝不 DELETE 已有缓存，避免 build_embeddings 全量重建。
- 仅使用云端（通义千问 text-embedding-v3）；若 EMBEDDING_API_KEY 未加载（多为未 cd 到
  backend 目录致 .env 未被 pydantic-settings 读取），直接报错退出，禁用本地回退下载
  （本地 fastembed 需联网拉模型，在服务器上会卡死并占满带宽）。

用法（生产，务必先 cd /opt/gwy/backend 以保证 .env 被读取）：
  cd /opt/gwy/backend
  DATABASE_URL=sqlite:////opt/gwy/data/gwy.db PYTHONPATH=/opt/gwy/backend \
    /opt/gwy/venv/bin/python scripts/encode_missing_embeddings.py
"""
from __future__ import annotations

import json
import os
import sys

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND not in sys.path:
    sys.path.insert(0, BACKEND)

import sqlalchemy
from app.ai.vector_retriever import VectorRetriever, _CLOUD_MODEL
from app.db.session import SessionLocal
from app.models import KnowledgeChunk


def main() -> None:
    v = VectorRetriever()
    if not v.use_cloud:
        raise SystemExit(
            "EMBEDDING_API_KEY 未加载：请先 `cd /opt/gwy/backend` 再运行，确保 .env 被读取。"
            "use_cloud=False 会回退本地模型下载（在服务器上会卡死），已禁用。"
        )

    db = SessionLocal()
    try:
        db.execute(sqlalchemy.text(
            "CREATE TABLE IF NOT EXISTS knowledge_embeddings "
            "(chunk_id INTEGER PRIMARY KEY, vec TEXT NOT NULL, model TEXT)"
        ))
        cached = {
            r[0] for r in db.execute(
                sqlalchemy.text("SELECT chunk_id FROM knowledge_embeddings")
            ).fetchall()
        }
        chunks = db.query(KnowledgeChunk).filter(
            KnowledgeChunk.is_verified == True  # noqa: E712
        ).all()
        need = [c for c in chunks if c.id not in cached]
        print(f"[encode_missing] verified={len(chunks)} cached={len(cached)} need={len(need)}", flush=True)
        if not need:
            print("[encode_missing] 无缺失，跳过。")
            return
        vecs = v._encode_cloud([c.content for c in need])
        for c, vec in zip(need, vecs):
            db.execute(sqlalchemy.text(
                "INSERT OR REPLACE INTO knowledge_embeddings (chunk_id, vec, model) "
                "VALUES (:cid, :vec, :model)"
            ), {"cid": c.id, "vec": json.dumps(vec, ensure_ascii=False), "model": _CLOUD_MODEL})
        db.commit()
        print(f"[encode_missing] 已编码并入库 {len(need)} 条缺失片段（cloud model={_CLOUD_MODEL}）", flush=True)
    finally:
        db.close()


if __name__ == "__main__":
    main()

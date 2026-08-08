"""知识库语料回填：把 seed.json + knowledge_extra.json + knowledge_gen.json 中尚未入库的知识片段
幂等插入 KnowledgeChunk（is_verified=True）。

- 开发/本地：默认连 settings 的数据库。
- 生产：务必显式带 DATABASE_URL 覆盖，例如：
  DATABASE_URL=sqlite:////opt/gwy/data/gwy.db \
  /opt/gwy/venv/bin/python scripts/backfill_knowledge.py
"""
from __future__ import annotations

import json
import os
import sys

# 允许以脚本方式直接运行（backend/ 作为包根）
BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND not in sys.path:
    sys.path.insert(0, BACKEND)

from app.db.session import SessionLocal
from app.models import KnowledgeChunk

_DATA = os.path.join(BACKEND, "data")


def _load(path: str) -> list[dict]:
    if not os.path.exists(path):
        print(f"skip (not found): {path}")
        return []
    with open(path, encoding="utf-8") as f:
        return json.load(f).get("knowledge", [])


def backfill() -> int:
    items = (
        _load(os.path.join(_DATA, "seed.json"))
        + _load(os.path.join(_DATA, "knowledge_extra.json"))
        + _load(os.path.join(_DATA, "knowledge_gen.json"))
        + _load(os.path.join(_DATA, "knowledge_bigcat.json"))
    )
    db = SessionLocal()
    existing = {c.content for c in db.query(KnowledgeChunk.content).all()}
    added = 0
    for d in items:
        content = d.get("content")
        if not content or content in existing:
            continue
        db.add(
            KnowledgeChunk(
                kp=d.get("kp", "通用"),
                title=d.get("title", ""),
                content=content,
                source=d.get("source", "平台原创"),
                source_url=d.get("source_url"),
                is_verified=True,
            )
        )
        existing.add(content)
        added += 1
    db.commit()
    total = db.query(KnowledgeChunk).count()
    db.close()
    print(f"新增知识片段: {added}；knowledge_chunks 总计: {total}")
    return added


if __name__ == "__main__":
    backfill()

"""数据加载管线（方案 c3 内容底座 / 生产题库来源）。

从 backend/data/seed.json 幂等导入：
- 客观题（questions）→ Question + QuestionOption，is_verified=True，版权方=平台原创
- 知识片段（knowledge）→ KnowledgeChunk，供 RAG 检索增强
- 申论题（essay_prompts）→ EssayPrompt，供申论批改页取用

去重策略：客观题按 stem、知识片段按 content、申论题按 title，已存在则跳过，
可安全重复执行（升级题库时直接改 JSON 重跑即可，不重复插入）。
"""
from __future__ import annotations

import json
import os
from typing import Any

from sqlalchemy.orm import Session

from app.models import EssayPrompt, KnowledgeChunk, Question, QuestionOption

_SEED_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "data", "seed.json")


def _load_json() -> dict[str, Any]:
    with open(os.path.abspath(_SEED_PATH), encoding="utf-8") as f:
        return json.load(f)


def load_questions(db: Session, data: dict[str, Any]) -> int:
    existing = {q.stem for q in db.query(Question.stem).all()}
    added = 0
    for d in data.get("questions", []):
        if d["stem"] in existing:
            continue
        q = Question(
            subject=d["subject"],
            category=d["category"],
            qtype=d.get("qtype", "single"),
            stem=d["stem"],
            difficulty=d.get("difficulty", 3),
            knowledge_point=d["knowledge_point"],
            answer=d.get("answer"),
            explanation=d.get("explanation"),
            source=d.get("source", "平台原创"),
            copyright_owner="平台原创",
            is_verified=True,
        )
        q.options = [
            QuestionOption(label=lbl, content=ct, is_correct=bool(ic))
            for (lbl, ct, ic) in d["options"]
        ]
        db.add(q)
        existing.add(d["stem"])
        added += 1
    return added


def load_knowledge(db: Session, data: dict[str, Any]) -> int:
    existing = {c.content for c in db.query(KnowledgeChunk.content).all()}
    added = 0
    for d in data.get("knowledge", []):
        if d["content"] in existing:
            continue
        db.add(
            KnowledgeChunk(
                kp=d.get("kp", "通用"),
                title=d.get("title", ""),
                content=d["content"],
                source=d.get("source", "平台原创"),
                source_url=d.get("source_url"),
                is_verified=True,
            )
        )
        existing.add(d["content"])
        added += 1
    return added


def load_essays(db: Session, data: dict[str, Any]) -> int:
    existing = {p.title for p in db.query(EssayPrompt.title).all()}
    added = 0
    for d in data.get("essay_prompts", []):
        if d["title"] in existing:
            continue
        db.add(
            EssayPrompt(
                title=d["title"],
                kp=d.get("kp"),
                material=d["material"],
                requirement=d["requirement"],
                max_score=d.get("max_score", 100),
            )
        )
        existing.add(d["title"])
        added += 1
    return added


def load_all(db: Session, force: bool = False) -> dict[str, int]:
    """导入全量数据。force=True 时先清空再导入（慎用）。返回各模块新增条数。"""
    data = _load_json()
    if force:
        db.query(EssayPrompt).delete()
        db.query(KnowledgeChunk).delete()
        db.query(QuestionOption).delete()
        db.query(Question).delete()
    counts = {
        "questions": load_questions(db, data),
        "knowledge": load_knowledge(db, data),
        "essays": load_essays(db, data),
    }
    db.commit()
    return counts


def ensure_seed(db: Session) -> dict[str, int] | None:
    """启动期调用：仅当题库为空时导入（开发/生产通用）。返回新增条数或 None。"""
    if db.query(Question).count() > 0:
        return None
    return load_all(db)


if __name__ == "__main__":
    from app.db.session import SessionLocal

    s = SessionLocal()
    try:
        print("loaded:", ensure_seed(s) or "已存在数据，跳过")
    finally:
        s.close()

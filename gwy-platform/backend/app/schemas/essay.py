"""申论题库 / 批改历史接口契约（WBS 4.1）。"""
from datetime import datetime

from pydantic import BaseModel


class EssayPromptOut(BaseModel):
    id: int
    title: str
    kp: str | None = None
    material: str
    requirement: str
    max_score: int

    model_config = {"from_attributes": True}


class EssayHistoryItem(BaseModel):
    id: int
    prompt_id: int | None = None
    prompt_title: str | None = None
    total: float
    dimensions: dict
    needs_human_review: bool
    rationale: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}

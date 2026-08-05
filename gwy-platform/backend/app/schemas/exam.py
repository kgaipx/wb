"""模考历史接口契约（WBS 4.2 复盘）。"""
from datetime import datetime
from pydantic import BaseModel


class ExamDetailItem(BaseModel):
    question_id: int
    is_correct: bool
    correct_answer: str
    selected: str
    stem: str | None = None
    knowledge_point: str | None = None


class ExamRecordOut(BaseModel):
    id: int
    subject: str
    total: int
    correct: int
    correct_rate: float
    weak_points: list[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class ExamRecordDetail(ExamRecordOut):
    details: list[ExamDetailItem]

"""题库 / 测评相关接口契约（WBS 2.2 / 4.2）。"""
from datetime import datetime
from pydantic import BaseModel


class OptionOut(BaseModel):
    id: int
    label: str
    content: str

    model_config = {"from_attributes": True}


class QuestionOut(BaseModel):
    id: int
    subject: str
    category: str
    qtype: str
    stem: str
    difficulty: int
    knowledge_point: str
    source: str | None
    is_verified: bool
    options: list[OptionOut] = []

    model_config = {"from_attributes": True}


class QuestionListItem(BaseModel):
    id: int
    subject: str
    category: str
    difficulty: int
    knowledge_point: str
    is_verified: bool

    model_config = {"from_attributes": True}


class PracticeSubmit(BaseModel):
    question_id: int
    selected: str = ""  # 选项标签拼接，如 "A" / "AB"


class PracticeResult(BaseModel):
    question_id: int
    is_correct: bool
    correct_answer: str | None
    explanation: str | None
    mastery: float


class WrongItem(BaseModel):
    """错题本条目：题目（不泄漏答案）+ 错答次数 + 最近一次错选 + 复错率信号。"""

    question: QuestionOut
    wrong_count: int
    last_selected: str | None
    attempts: int = 0  # 该用户在该题的总作答次数
    recurrence_rate: float | None = None  # 错答占比 0-1（复错倾向，越高越需重点攻克）

    model_config = {"from_attributes": False}


class FavoriteIn(BaseModel):
    question_id: int

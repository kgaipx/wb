"""AI 能力接口契约（WBS 3.1 私教 / 3.2 自适应 / 4.1 申论批改）。"""
from pydantic import BaseModel


class ExplainIn(BaseModel):
    question_id: int
    selected: str | None = None  # 用户作答标签，如 "A"


class ExplainOut(BaseModel):
    knowledge_point: str
    explanation: str
    citations: list[str] = []
    model: str | None = None


class RecommendOut(BaseModel):
    knowledge_points: list[str]  # 薄弱知识点（诊断结果）
    questions: list[dict] = []  # 候选题目（精简字段）


class EssayGradeIn(BaseModel):
    essay_text: str
    prompt_material: str = ""
    max_score: int = 100


class EssayGradeOut(BaseModel):
    total: float
    dimensions: dict[str, float]
    needs_human_review: bool
    rationale: str

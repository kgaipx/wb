"""能力测评接口契约（WBS 3.2 自适应诊断）。"""
from pydantic import BaseModel

from app.schemas.question import OptionOut


class AssessmentDim(BaseModel):
    """雷达图一个维度：某知识点的本次正确率（0-1）。"""

    knowledge_point: str
    mastery: float


class AssessmentPaperItem(BaseModel):
    """诊断卷题目（隐藏正确答案，仅含选项标签与内容）。"""

    id: int
    subject: str
    category: str
    qtype: str
    stem: str
    difficulty: int
    knowledge_point: str
    is_verified: bool
    options: list[OptionOut] = []


class AssessmentReport(BaseModel):
    """提交后的诊断报告（实时生成，同时落库为 AssessmentRecord）。"""

    id: int
    overall: float
    dimensions: list[AssessmentDim]
    weak_points: list[str]
    suggestions: list[str]
    total: int
    correct: int
    details: list[dict] = []  # 逐题回顾：question_id/is_correct/correct_answer/selected/stem/knowledge_point
    created_at: str


class AssessmentRecordOut(BaseModel):
    """历史测评记录（含雷达维度明细，支持成长轨迹对比）。"""

    id: int
    overall: float
    dimensions: list[AssessmentDim]
    weak_points: list[str]
    suggestions: list[str]
    questions_total: int
    correct: int | None = None
    details: list[dict] | None = None
    created_at: str

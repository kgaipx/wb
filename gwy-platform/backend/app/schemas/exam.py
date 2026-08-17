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
    # 选项原文（含 label/content），用于历史复盘展示完整题目与对错高亮。
    # 旧记录未存储该字段，缺省为 None，前端需优雅降级。
    options: list[dict] | None = None


class ExamRecordOut(BaseModel):
    id: int
    subject: str
    total: int
    correct: int
    correct_rate: float
    weak_points: list[str]
    created_at: datetime
    # 各知识点「模考前 → 模考后」掌握度变化（用于历史报告回看进步轨迹）
    kp_mastery: list = []

    model_config = {"from_attributes": True}


class ExamRecordDetail(ExamRecordOut):
    details: list[ExamDetailItem]

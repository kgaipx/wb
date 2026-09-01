"""内容审核接口契约（WBS 5.2 双签校验）。"""
from datetime import datetime
from pydantic import BaseModel


class ReviewSubmitIn(BaseModel):
    item_type: str  # question / knowledge / essay_policy
    item_id: str = ""  # 留空则由后端自动生成草稿编号
    body: str
    version: int = 1


class ReviewApproveIn(BaseModel):
    """双签通过无需请求体携带审核员身份，服务端以登录用户为准。"""


class ReviewRejectIn(BaseModel):
    note: str | None = None


class ReviewCorrectIn(BaseModel):
    new_body: str


class ReviewOut(BaseModel):
    id: int
    item_type: str
    item_id: str
    version: int
    status: str
    body: str
    reviewer_1: str | None
    reviewer_2: str | None
    reviewer_1_at: datetime | None = None
    reviewer_2_at: datetime | None = None
    reviewer_note: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ReviewLogOut(BaseModel):
    id: int
    review_id: int
    action: str
    actor: str
    note: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class SpotCheckSample(BaseModel):
    review_id: int
    item_type: str
    item_id: str
    reviewer_1: str | None
    reviewer_2: str | None
    reviewer_1_at: datetime | None = None
    reviewer_2_at: datetime | None = None
    created_at: datetime


class QuestionOptionOut(BaseModel):
    label: str
    content: str | None = None
    is_correct: bool


class QuestionReviewOut(BaseModel):
    """待核实题库题目 + 其双签审核进度（信任保障闭环）。

    审核员控制台需看到答案与正确项以核验导入质量；
    与学员端刷题接口刻意不同——那里隐藏答案防泄漏。
    """

    review_id: int | None = None
    question_id: int
    subject: str | None = None
    category: str | None = None
    qtype: str | None = None
    stem: str | None = None
    options: list[QuestionOptionOut] = []
    answer: str | None = None
    knowledge_point: str | None = None
    source: str | None = None
    copyright_owner: str | None = None
    is_verified: bool
    review_status: str  # none | pending | approved | rejected
    reviewer_1: str | None = None
    reviewer_2: str | None = None


class QuestionReviewStats(BaseModel):
    total: int  # 题库总量
    verified: int  # 已双签通过（is_verified=True）
    pending: int  # 待核实（is_verified=False）
    awaiting_second: int  # 已签第一签、待第二签

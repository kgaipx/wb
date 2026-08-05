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
    reviewer_note: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

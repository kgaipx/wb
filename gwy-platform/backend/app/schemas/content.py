"""内容审核接口契约（WBS 5.2 双签校验）。"""
from datetime import datetime
from pydantic import BaseModel


class ReviewSubmitIn(BaseModel):
    item_type: str  # question / knowledge / essay_policy
    item_id: str
    body: str
    version: int = 1


class ReviewApproveIn(BaseModel):
    reviewer: str


class ReviewRejectIn(BaseModel):
    reviewer: str
    note: str | None = None


class ReviewCorrectIn(BaseModel):
    new_body: str
    reviewer: str


class ReviewOut(BaseModel):
    id: int
    item_type: str
    item_id: str
    version: int
    status: str
    reviewer_1: str | None
    reviewer_2: str | None
    reviewer_note: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

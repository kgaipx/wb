"""用户相关接口契约（WBS 2.1）。"""
from datetime import datetime

from pydantic import BaseModel, Field


class UserRegister(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(min_length=6, max_length=64)
    nickname: str | None = None
    province: str | None = None
    target_exam: str = "国考"


class UserLogin(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    id: int
    email: str
    nickname: str | None
    province: str | None
    target_exam: str
    plan: str
    created_at: datetime

    model_config = {"from_attributes": True}


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"

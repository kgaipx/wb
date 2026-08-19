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


class UserUpdate(BaseModel):
    nickname: str | None = None
    province: str | None = None
    target_exam: str | None = None
    target_exam_date: str | None = None  # YYYY-MM-DD；传 null 清除倒计时
    target_exam_name: str | None = None  # 目标考试显示名


class ChangePasswordIn(BaseModel):
    old_password: str
    new_password: str


class PasswordResetRequestIn(BaseModel):
    """账号找回：提交注册邮箱，请求发送重置令牌。"""
    email: str = Field(..., min_length=3, max_length=255)


class PasswordResetIn(BaseModel):
    """使用令牌重置密码：单次使用、30 分钟有效。"""
    token: str = Field(..., min_length=8, max_length=128)
    new_password: str = Field(min_length=6, max_length=64)


class UserOut(BaseModel):
    id: int
    email: str
    nickname: str | None
    province: str | None
    target_exam: str
    target_exam_date: str | None = None
    target_exam_name: str | None = None
    plan: str
    plan_expires_at: datetime | None = None
    role: str = "user"
    created_at: datetime

    model_config = {"from_attributes": True}


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"

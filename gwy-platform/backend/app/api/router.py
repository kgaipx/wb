"""API 路由聚合（方案 c3 业务服务层：按功能域拆分）。

WBS 2.1 认证 / 学员中心，WBS 2.2 题库 已挂载；后续 WBS 3-8 的功能域（learn/ai/exam/pay/review）按同方式挂接。
"""
from fastapi import APIRouter

from app.api.routes import auth, question_bank, student

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(student.router, prefix="/student", tags=["student"])
api_router.include_router(question_bank.router, prefix="/bank", tags=["bank"])


@api_router.get("/ping", tags=["system"])
def ping():
    return {"msg": "pong"}

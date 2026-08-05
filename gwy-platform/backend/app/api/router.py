"""API 路由聚合（方案 c3 业务服务层：按功能域拆分）。

WBS 2.1 认证/学员中心、2.2 题库 已挂载；
WBS 3.1 私教、3.2 自适应(含能力测评)、4.1 申论批改（/ai）、4.2 模考（/exam）、
5.1 退费/7.1 会员（/billing）、5.2 内容审核（/content）按同方式挂接。
"""
from fastapi import APIRouter

from app.api.routes import admin, ai, assessment, auth, billing, chat, content, exam, notification, question_bank, student

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(student.router, prefix="/student", tags=["student"])
api_router.include_router(question_bank.router, prefix="/bank", tags=["bank"])
api_router.include_router(ai.router, prefix="/ai", tags=["ai"])
api_router.include_router(chat.router, prefix="/ai", tags=["ai"])
api_router.include_router(exam.router, prefix="/exam", tags=["exam"])
api_router.include_router(billing.router, prefix="/billing", tags=["billing"])
api_router.include_router(content.router, prefix="/content", tags=["content"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
api_router.include_router(assessment.router, prefix="/assessment", tags=["assessment"])
api_router.include_router(notification.router, prefix="/notifications", tags=["notifications"])


@api_router.get("/ping", tags=["system"])
def ping():
    return {"msg": "pong"}

"""API 路由聚合（方案 c3 业务服务层：按功能域拆分）。

当前为脚手架占位，后续把各功能域（学员/学习/题库/测评/支付/审核）拆成独立 router 挂到此处。
"""
from fastapi import APIRouter

api_router = APIRouter()

# 健康检查已在 main.py 提供；此处预留业务聚合入口
# from app.api.routes import auth, learn, question_bank, assessment, payment, review
# api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
# api_router.include_router(learn.router, prefix="/learn", tags=["learn"])
# api_router.include_router(question_bank.router, prefix="/bank", tags=["bank"])
# api_router.include_router(assessment.router, prefix="/exam", tags=["exam"])
# api_router.include_router(payment.router, prefix="/pay", tags=["pay"])
# api_router.include_router(review.router, prefix="/review", tags=["review"])


@api_router.get("/ping", tags=["system"])
def ping():
    return {"msg": "pong"}

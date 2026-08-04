"""FastAPI 应用入口。

架构原则（方案 c3）：离线优先、AI-native、模块化、合规内建。
本文件仅做应用装配；具体能力在 app/api 与 app/ai 中按功能域拆分。
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.router import api_router

app = FastAPI(
    title=settings.APP_NAME,
    version="0.1.0",
    description="AI-native 公考私教平台 API（MVP 脚手架）",
)

# CORS：开发期放开前端来源，生产需收紧
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.CORS_ORIGINS.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")


@app.get("/health", tags=["system"])
def health_check():
    """健康检查 —— 供容器探针与监控使用。"""
    return {"status": "ok", "app": settings.APP_NAME, "env": settings.APP_ENV}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)

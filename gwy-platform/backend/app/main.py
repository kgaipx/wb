"""FastAPI 应用入口。

架构原则（方案 c3）：离线优先、AI-native、模块化、合规内建。
本文件仅做应用装配；具体能力在 app/api 与 app/ai 中按功能域拆分。

开发期（APP_ENV != production）启动时自动建表并注入示范数据，便于本地零依赖联调。
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import settings
from app.db.session import engine


def _seed_demo_data() -> None:
    """开发期注入示范题库（生产不调用）。"""
    from app.db.session import SessionLocal
    from app.models import Question, QuestionOption

    db = SessionLocal()
    try:
        if db.query(Question).count() > 0:
            return
        q = Question(
            subject="行测",
            category="判断推理",
            qtype="single",
            stem="下列逻辑关系中，与『医生：病人』最为相似的是？",
            difficulty=2,
            knowledge_point="类比推理",
            answer="教师：学生",
            explanation="医生服务病人，教师服务学生，均为职业与服务对象的关系。",
            source="示范题",
            copyright_owner="平台原创",
            is_verified=True,
        )
        q.options = [
            QuestionOption(label="A", content="教师：学生", is_correct=True),
            QuestionOption(label="B", content="司机：汽车", is_correct=False),
            QuestionOption(label="C", content="厨师：厨房", is_correct=False),
            QuestionOption(label="D", content="作家：读者", is_correct=False),
        ]
        db.add(q)
        db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 开发期自动建表（生产环境使用 Alembic 迁移脚本管理 schema）
    if settings.APP_ENV != "production":
        from app import models  # 确保模型注册到 Base.metadata

        models.Base.metadata.create_all(bind=engine)
        _seed_demo_data()
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version="0.1.0",
    description="AI-native 公考私教平台 API（MVP 脚手架）",
    lifespan=lifespan,
)

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

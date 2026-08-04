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
    from app.models import Question, QuestionOption, KnowledgeChunk

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

        # 示范知识片段：供 RAG 检索增强（带权威来源标注）
        chunks = [
            KnowledgeChunk(
                kp="类比推理",
                title="类比推理核心方法",
                content="类比推理考查两组词之间的逻辑关系。常见关系包括：职业与对象（医生:病人）、组成关系、种属关系、因果关系、并列关系。解题时先判断题干关系类型，再逐一匹配选项。",
                source="行测判断推理专项（平台教研原创）",
                is_verified=True,
            ),
            KnowledgeChunk(
                kp="类比推理",
                title="易错点：职业对象 vs 职业工具",
                content="『医生:病人』是职业与服务对象；『司机:汽车』是职业与工具，二者关系不同，不可混淆。区分关系类型是类比推理高频易错点。",
                source="行测判断推理专项（平台教研原创）",
                is_verified=True,
            ),
            KnowledgeChunk(
                kp="常识判断",
                title="时政：2026 国考招录规模",
                content="2026 年度国考计划招录约 3.97 万人，报名通过资格审查约 371.8 万人，报录比约 74:1。数据以国家公务员局官方公告为准。",
                source="国家公务员局 2026 年度考试录用公务员公告",
                source_url="http://www.scs.gov.cn",
                is_verified=True,
            ),
        ]
        db.add_all(chunks)
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
    """健康检查 —— 供容器探针、监控与 CI 质量门禁使用。

    返回 db / llm 就绪态，便于发布前自动校验关键依赖。
    """
    from sqlalchemy import text

    db_ok = False
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False

    llm_ready = bool(settings.LLM_API_KEY and settings.LLM_BASE_URL and settings.LLM_MODEL)
    return {
        "status": "ok" if (db_ok and llm_ready) else "degraded",
        "app": settings.APP_NAME,
        "env": settings.APP_ENV,
        "db": "ready" if db_ok else "unavailable",
        "llm": "ready" if llm_ready else "not_configured",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)

"""数据库会话：SQLAlchemy 2.x 引擎 + SessionLocal + FastAPI 依赖。

MVP 阶段用单机 MySQL；规模化阶段可按功能域拆分（方案 c3 微服务）。
"""
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

# SQLite 开发期需关闭单线程检查，以便 FastAPI 跨请求复用连接
_connect_args = {"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    future=True,
    connect_args=_connect_args,
)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, future=True)


def get_db() -> Generator[Session, None, None]:
    """FastAPI 依赖：每次请求一个会话，结束后关闭。"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

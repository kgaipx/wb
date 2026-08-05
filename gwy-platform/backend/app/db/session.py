"""数据库会话：SQLAlchemy 2.x 引擎 + SessionLocal + FastAPI 依赖。

MVP 阶段用单机 MySQL；规模化阶段可按功能域拆分（方案 c3 微服务）。
"""
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

# SQLite：关闭单线程检查（多 worker 共享），并启用 WAL 提升并发读写；
# 通过 PRAGMA 在连接建立时设置 journal_mode=WAL、busy_timeout 避免写锁冲突。
_connect_args = {"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {}


def _pragma_on_connect(dbapi_conn, _conn_record):
    if settings.DATABASE_URL.startswith("sqlite"):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA busy_timeout=5000")
        cur.close()


engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    future=True,
    connect_args=_connect_args,
)

if settings.DATABASE_URL.startswith("sqlite"):
    from sqlalchemy import event

    event.listen(engine, "connect", _pragma_on_connect)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, future=True)


def get_db() -> Generator[Session, None, None]:
    """FastAPI 依赖：每次请求一个会话，结束后关闭。"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

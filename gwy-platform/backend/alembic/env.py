"""Alembic 运行环境：复用 app 的 engine 与 Base.metadata。

- 连接串始终以 app.core.config.settings.DATABASE_URL 为准（覆盖 alembic.ini）；
- target_metadata 来自 app.models.Base.metadata，需先 import app.models 完成 ORM 注册；
- compare_type=True 让 autogenerate 能感知列类型变化（SQLite 下亦尽量生效）。
"""
from logging.config import fileConfig

from alembic import context

from app.core.config import settings
from app.db.session import engine
from app import models  # 确保全部模型注册到 Base.metadata
from app.models import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# 运行时连接串优先于 alembic.ini 占位值
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=settings.DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

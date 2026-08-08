"""SQLAlchemy 声明基类（方案 c3 数据层）。

所有 ORM 模型继承此类；启动时由 Base.metadata.create_all 在开发期自动建表，
生产环境改用 Alembic 迁移脚本管理 schema 变更。
"""
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """所有数据模型的基类。"""

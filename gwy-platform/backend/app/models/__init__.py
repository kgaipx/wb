"""模型聚合：导入即注册所有 ORM 映射到 Base.metadata。"""
from app.db.base import Base
from app.models.user import User
from app.models.question import Question, QuestionOption
from app.models.progress import UserAnswer, AbilityProfile

__all__ = ["Base", "User", "Question", "QuestionOption", "UserAnswer", "AbilityProfile"]

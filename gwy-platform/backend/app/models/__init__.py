"""模型聚合：导入即注册所有 ORM 映射到 Base.metadata。"""
from app.db.base import Base
from app.models.user import User
from app.models.question import Question, QuestionOption
from app.models.progress import UserAnswer, AbilityProfile
from app.models.knowledge import KnowledgeChunk
from app.models.content import ContentReview
from app.models.billing import Order, RefundRequest
from app.models.favorite import Favorite

__all__ = [
    "Base",
    "User",
    "Question",
    "QuestionOption",
    "UserAnswer",
    "AbilityProfile",
    "KnowledgeChunk",
    "ContentReview",
    "Order",
    "RefundRequest",
    "Favorite",
]

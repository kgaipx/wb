"""模型聚合：导入即注册所有 ORM 映射到 Base.metadata。"""
from app.db.base import Base
from app.models.user import User
from app.models.question import Question, QuestionOption
from app.models.progress import UserAnswer, AbilityProfile
from app.models.knowledge import KnowledgeChunk
from app.models.content import ContentReview
from app.models.billing import Order, RefundRequest
from app.models.essay import EssayGradeRecord, EssayPrompt
from app.models.favorite import Favorite
from app.models.study_plan import PlanTask, StudyPlan
from app.models.chat import ChatMessage, ChatSession
from app.models.exam_record import ExamRecord
from app.models.assessment import AssessmentRecord
from app.models.notification import Notification
from app.models.password_reset import PasswordResetToken

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
    "EssayPrompt",
    "EssayGradeRecord",
    "Favorite",
    "StudyPlan",
    "PlanTask",
    "ChatSession",
    "ChatMessage",
    "ExamRecord",
    "AssessmentRecord",
    "Notification",
    "PasswordResetToken",
]

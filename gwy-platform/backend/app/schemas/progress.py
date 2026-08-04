"""学情 / 能力图谱接口契约（WBS 3.2）。"""
from datetime import datetime
from pydantic import BaseModel

from app.schemas.user import UserOut


class AbilityOut(BaseModel):
    knowledge_point: str
    mastery: float
    attempts: int
    correct: int
    last_practiced: datetime

    model_config = {"from_attributes": True}


class StudentDashboard(BaseModel):
    user: UserOut
    total_answers: int
    correct_rate: float
    ability: list[AbilityOut]

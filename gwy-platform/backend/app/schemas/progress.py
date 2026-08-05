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


class DayTrend(BaseModel):
    """近 7 日每日答题量 / 正确量（UTC 日）。"""

    date: str
    answers: int
    correct: int


class StudentStats(BaseModel):
    """学情数据看板（P0 信号承载）：复错率、正确率、弱项、趋势、连续打卡。

    - 仅统计客观题（qtype != 'essay'），申论由独立模块追踪，避免污染指标。
    - recurrence_rate（错题复错率）= 曾经做错、且在其后再次作答仍错的题数 / 曾错且复测过的题数。
      该值越低，说明复盘越有效（产品核心 P0 信号：错题复错率↓）。
    """

    user: UserOut
    total_answers: int
    correct_rate: float
    wrong_distinct: int
    recurrence_rate: float
    reviewed_distinct: int
    mastered_kp: int
    ability: list[AbilityOut]
    last_7_days: list[DayTrend]
    streak_days: int

"""运营后台聚合视图 Schema（方案 c4 方向5 / 运营者视角）。

/admin/overview 返回平台健康度：用户增长、会员分布、营收、题库核实状态、
学习活跃（答题量 / 正确率）、申论与模考产出、待审积压、最近注册用户。
所有字段均为只读聚合，不暴露 PII 明细。
"""
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class AdminUserRow(BaseModel):
    """最近注册用户（仅展示账号与画像，不含密码等敏感字段）。"""

    email: str
    nickname: str | None
    plan: str
    target_exam: str
    role: str
    created_at: datetime


class SubjectCount(BaseModel):
    """题库按科目分布。"""

    subject: str
    count: int


class PlanCount(BaseModel):
    """会员等级分布。"""

    plan: str
    count: int


class AdminOverview(BaseModel):
    # 用户
    users_total: int
    users_new_7d: int
    users_by_plan: list[PlanCount]
    pro_users: int  # 付费会员（pro / pro_year）

    # 营收（金额以元计；生产为分转元）
    paid_orders: int
    revenue_yuan: float

    # 题库 / 内容可信
    questions_total: int
    questions_verified: int
    questions_pending: int  # 待双签核实
    question_subjects: list[SubjectCount]
    pending_reviews: int  # 内容审核待办

    # 学习活跃
    answers_total: int
    avg_correct_rate: float  # 0-1 全站客观题正确率
    essays_graded: int
    mock_exams: int

    # 最近注册（运营拉新观察）
    recent_users: list[AdminUserRow]

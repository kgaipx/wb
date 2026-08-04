"""AI 能力接口契约（WBS 3.1 私教 / 3.2 自适应 / 4.1 申论批改）。"""
from pydantic import BaseModel


class ExplainIn(BaseModel):
    question_id: int
    selected: str | None = None  # 用户作答标签，如 "A"


class ExplainOut(BaseModel):
    knowledge_point: str
    explanation: str
    citations: list[str] = []
    model: str | None = None


class RecommendOut(BaseModel):
    knowledge_points: list[str]  # 薄弱知识点（诊断结果）
    questions: list[dict] = []  # 候选题目（精简字段）


class ChatIn(BaseModel):
    messages: list[dict]  # 对话历史：[{role: "user"|"assistant", content: str}]
    kp_hint: str | None = None  # 可选的知识点提示，用于更精准检索


class ChatOut(BaseModel):
    answer: str
    citations: list[str] = []
    model: str | None = None
    offline: bool = False  # True 表示 LLM 不可用时走了离线降级


class EssayGradeIn(BaseModel):
    essay_text: str
    prompt_material: str = ""
    max_score: int = 100


class EssayGradeOut(BaseModel):
    total: float
    dimensions: dict[str, float]
    needs_human_review: bool
    rationale: str


class PlanTaskOut(BaseModel):
    """已落库的计划任务（含打卡状态）。"""
    id: int
    kind: str  # practice | review_wrong | favorite | mock | explain | read
    title: str
    target: str | None = None  # 知识点 / 文案
    ref_id: int | None = None  # 关联题目 id（用于跳转刷题）
    done: bool = False  # 是否已打卡完成


class PlanDayOut(BaseModel):
    day: int
    focus: str  # 当日主攻知识点
    summary: str
    knowledge_points: list[str] = []
    tasks: list[PlanTaskOut] = []


class PlanProgress(BaseModel):
    """进度聚合：完成率 / 连续打卡 / 按类型分布 / 今日待办。"""
    total_tasks: int
    done_tasks: int
    rate: float  # 完成率 0-1
    streak_days: int  # 连续打卡天数
    by_kind: dict[str, dict[str, int]] = {}  # {kind: {total, done}}
    last_checkin_at: str | None = None
    today_total: int = 0  # 今日任务数
    today_done: int = 0  # 今日已完成数


class PlanIn(BaseModel):
    days: int = 7  # 计划天数
    target: str | None = None  # 目标考试，如「2026 国考」


class PlanOut(BaseModel):
    plan_id: int
    days: int
    items: list[PlanDayOut]
    model: str | None = None
    offline: bool = False  # True 表示 LLM 不可用，走了规则降级
    summary: str | None = None  # 计划总述
    generated_at: str  # 计划生成时间（ISO）
    today_index: int = 0  # 计划视角下「今天」对应第几天；0 表示未开始/已结束
    progress: PlanProgress


class PlanToggleOut(BaseModel):
    """打卡切换后的返回：更新后的任务状态 + 最新进度。"""
    task: dict
    progress: PlanProgress

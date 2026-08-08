"""AI 能力接口契约（WBS 3.1 私教 / 3.2 自适应 / 4.1 申论批改）。"""
from pydantic import BaseModel


class ExplainIn(BaseModel):
    question_id: int
    selected: str | None = None  # 用户作答标签，如 "A"


class CitationOut(BaseModel):
    """富引用：知识点 + 标题 + 来源 + 相关度，供前端渲染知识卡片。"""
    title: str
    kp: str | None = None
    source: str | None = None
    score: float | None = None  # 检索相关度（0~1 混合分；纯词项路径可能更高）


class ExplainOut(BaseModel):
    knowledge_point: str
    explanation: str
    citations: list[CitationOut] = []
    model: str | None = None
    quota_remaining: int | None = None  # 免费版剩余配额（pro 为 None）
    offline: bool = False  # True 表示 LLM 不可用时走了离线降级讲解


class AiQuota(BaseModel):
    plan: str
    is_pro: bool
    limit: int  # 每日配额上限（pro 为 -1 表示不限）
    used: int
    remaining: int  # 剩余次数（pro 为 -1）
    date: str  # 配额所属日期 YYYY-MM-DD


class RecommendOut(BaseModel):
    knowledge_points: list[str]  # 薄弱知识点（诊断结果）
    questions: list[dict] = []  # 候选题目（精简字段）


class ChatIn(BaseModel):
    messages: list[dict]  # 对话历史：[{role: "user"|"assistant", content: str}]
    kp_hint: str | None = None  # 可选的知识点提示，用于更精准检索


class ChatOut(BaseModel):
    answer: str
    citations: list[CitationOut] = []
    model: str | None = None
    offline: bool = False  # True 表示 LLM 不可用时走了离线降级


class EssayGradeIn(BaseModel):
    essay_text: str
    prompt_material: str = ""  # 给定材料（供评分上下文）
    requirement: str = ""  # 作答要求（供评分上下文；与 material 共同约束评分）
    max_score: int = 100
    prompt_id: int | None = None  # 关联申论题库题目（落库时记录）
    save: bool = True  # 是否将批改结果落库（供历史复看）


class EssayGradeOut(BaseModel):
    total: float
    dimensions: dict[str, float]
    needs_human_review: bool
    rationale: str
    consistency: dict = {}  # 人 AI 一致性门禁报告（coefficient/threshold/ok/evaluated）
    record_id: int | None = None  # 落库后的记录 id（save=True 时返回）


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

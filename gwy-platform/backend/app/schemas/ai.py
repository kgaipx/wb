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


class PlanTask(BaseModel):
    """计划中的单个任务。"""
    kind: str  # practice | review_wrong | favorite | mock | explain | read
    title: str
    target: str | None = None  # 知识点 / 文案
    ref_id: int | None = None  # 关联题目 id（用于跳转刷题）


class PlanDay(BaseModel):
    day: int
    focus: str  # 当日主攻知识点
    summary: str
    knowledge_points: list[str] = []
    tasks: list[PlanTask] = []


class PlanIn(BaseModel):
    days: int = 7  # 计划天数
    target: str | None = None  # 目标考试，如「2026 国考」


class PlanOut(BaseModel):
    days: int
    items: list[PlanDay]
    model: str | None = None
    offline: bool = False  # True 表示 LLM 不可用，走了规则降级
    summary: str | None = None  # 计划总述

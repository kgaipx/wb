"""FastAPI 应用入口。

架构原则（方案 c3）：离线优先、AI-native、模块化、合规内建。
本文件仅做应用装配；具体能力在 app/api 与 app/ai 中按功能域拆分。

开发期（APP_ENV != production）启动时自动建表并注入示范数据，便于本地零依赖联调。
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import settings
from app.db.session import engine


def _seed_demo_data() -> None:
    """开发期注入示范题库（生产不调用）。

    所有题目均为「平台原创」（copyright_owner=平台原创，is_verified=True），
    规避第三方题库版权风险；配套知识片段供 RAG 检索增强并标注权威来源。
    """
    from app.db.session import SessionLocal
    from app.models import Question, QuestionOption, KnowledgeChunk

    db = SessionLocal()
    try:
        if db.query(Question).count() > 0:
            return

        # 平台原创示范题（行测多模块 + 申论基础，覆盖多知识点，便于模考/能力图谱演示）
        DEMO = [
            dict(subject="行测", category="判断推理", qtype="single",
                 stem="下列逻辑关系中，与『医生：病人』最为相似的是？", difficulty=2, kp="类比推理",
                 answer="教师：学生", explanation="医生服务病人，教师服务学生，均为职业与服务对象的关系。",
                 opts=[("A", "教师：学生", True), ("B", "司机：汽车", False), ("C", "厨师：厨房", False), ("D", "作家：读者", False)]),
            dict(subject="行测", category="判断推理", qtype="single",
                 stem="已知『所有公务员都要参加考试』为真，下列哪项必然为真？", difficulty=2, kp="逻辑判断",
                 answer="有些要参加考试的是公务员", explanation="全称肯定命题可推出其特称命题（差等关系）：所有 S 是 P ⇒ 有些 P 是 S。",
                 opts=[("A", "有些要参加考试的是公务员", True), ("B", "所有参加考试的人都是公务员", False),
                       ("C", "有些公务员不用考试", False), ("D", "不考试的都不是公务员", False)]),
            dict(subject="行测", category="言语理解与表达", qtype="single",
                 stem="做学问要_____，不能浅尝辄止。", difficulty=1, kp="逻辑填空",
                 answer="精益求精", explanation="『浅尝辄止』指不深入，反义应选表示深入钻研的『精益求精』。",
                 opts=[("A", "精益求精", True), ("B", "不求甚解", False), ("C", "囫囵吞枣", False), ("D", "走马观花", False)]),
            dict(subject="行测", category="资料分析", qtype="single",
                 stem="某省 2025 年 GDP 为 1200 亿元，2024 年为 1000 亿元，求增长率约为？", difficulty=2, kp="增长率",
                 answer="20%", explanation="增长率 =（现期－基期）÷ 基期 =（1200－1000）÷1000 = 20%。",
                 opts=[("A", "20%", True), ("B", "25%", False), ("C", "16.7%", False), ("D", "12%", False)]),
            dict(subject="行测", category="常识判断", qtype="single",
                 stem="2026 年度国考计划招录约多少人？", difficulty=1, kp="时政常识",
                 answer="约 3.97 万人", explanation="据国家公务员局公告，2026 年度国考计划招录约 3.97 万人（以官方公告为准）。",
                 opts=[("A", "约 3.97 万人", True), ("B", "约 2.5 万人", False), ("C", "约 5 万人", False), ("D", "约 1 万人", False)]),
            dict(subject="行测", category="数量关系", qtype="single",
                 stem="数列 2，4，8，16，（ ）中应填？", difficulty=1, kp="数列",
                 answer="32", explanation="后一项是前一项的 2 倍，公比为 2 的等比数列，下一项为 16×2=32。",
                 opts=[("A", "32", True), ("B", "24", False), ("C", "30", False), ("D", "64", False)]),
            dict(subject="行测", category="判断推理", qtype="single",
                 stem="研究称『喝咖啡导致失眠』。下列哪项最能削弱该结论？", difficulty=3, kp="削弱论证",
                 answer="失眠的人更倾向于喝咖啡（因果倒置）", explanation="指出因果方向可能相反（因果倒置），是对因果结论最有力的削弱。",
                 opts=[("A", "失眠的人更倾向于喝咖啡（因果倒置）", True), ("B", "很多人喝咖啡并不失眠", False),
                       ("C", "喝茶也会导致失眠", False), ("D", "咖啡含有咖啡因", False)]),
            dict(subject="行测", category="资料分析", qtype="single",
                 stem="某单位男性 60 人、女性 40 人，男性占比约为？", difficulty=1, kp="比重",
                 answer="60%", explanation="比重 = 部分 ÷ 整体 = 60 ÷（60+40）= 60%。",
                 opts=[("A", "60%", True), ("B", "40%", False), ("C", "50%", False), ("D", "66.7%", False)]),
            dict(subject="行测", category="常识判断", qtype="single",
                 stem="我国国家机构的组织和活动原则是？", difficulty=1, kp="法律常识",
                 answer="民主集中制", explanation="《宪法》规定，中华人民共和国国家机构实行民主集中制的原则。",
                 opts=[("A", "民主集中制", True), ("B", "三权分立", False), ("C", "少数服从多数", False), ("D", "首长负责制", False)]),
            dict(subject="行测", category="判断推理", qtype="single",
                 stem="下列属于正当防卫的是？", difficulty=2, kp="定义判断",
                 answer="为制止正在进行的不法侵害而采取的反击", explanation="正当防卫须针对『正在进行』的不法侵害并具防卫意图，A 符合；事前的报复、事前殴打、互殴均不成立。",
                 opts=[("A", "为制止正在进行的不法侵害而采取的反击", True), ("B", "对昨天的辱骂实施报复", False),
                       ("C", "事前殴打可疑人员", False), ("D", "斗殴中相互攻击", False)]),
            dict(subject="行测", category="数量关系", qtype="single",
                 stem="甲、乙相向而行，相距 200 公里，甲速 60、乙速 40（公里/时），几小时后相遇？", difficulty=2, kp="行程问题",
                 answer="2 小时", explanation="相遇时间 = 路程 ÷ 速度和 = 200 ÷（60+40）= 2 小时。",
                 opts=[("A", "2 小时", True), ("B", "3 小时", False), ("C", "2.5 小时", False), ("D", "1.5 小时", False)]),
            dict(subject="行测", category="言语理解与表达", qtype="single",
                 stem="文段意在说明：保护方言不仅关乎文化多样性，更是留住乡愁的载体。对此理解正确的是？", difficulty=2, kp="片段阅读",
                 answer="方言承载着文化与乡愁价值", explanation="文段核心观点即方言兼具文化多样性与乡愁情感价值，A 为同义替换。",
                 opts=[("A", "方言承载着文化与乡愁价值", True), ("B", "方言终将消失", False),
                       ("C", "推广普通话更重要", False), ("D", "方言没有实用价值", False)]),
            dict(subject="申论", category="申论基础", qtype="single",
                 stem="给定资料反映某社区治理经验。下列属于可推广『经验』的是？", difficulty=2, kp="归纳概括",
                 answer="建立居民议事会，引导群众参与决策", explanation="经验强调可复制的机制与方法；居民议事会体现共建共治，属于治理经验。",
                 opts=[("A", "建立居民议事会，引导群众参与决策", True), ("B", "上级直接下达命令", False),
                       ("C", "全部外包给公司", False), ("D", "一事一罚", False)]),
            dict(subject="行测", category="判断推理", qtype="single",
                 stem="『只有努力，才能上岸』等价于下列哪条逻辑？", difficulty=3, kp="翻译推理",
                 answer="上岸 → 努力", explanation="『只有 P，才 Q』翻译为 Q→P，即『上岸 → 努力』。",
                 opts=[("A", "上岸 → 努力", True), ("B", "努力 → 上岸", False), ("C", "不努力也能上岸", False), ("D", "不努力 → 上岸", False)]),
        ]
        for d in DEMO:
            q = Question(
                subject=d["subject"], category=d["category"], qtype=d["qtype"],
                stem=d["stem"], difficulty=d["difficulty"], knowledge_point=d["kp"],
                answer=d["answer"], explanation=d["explanation"],
                source="示范题", copyright_owner="平台原创", is_verified=True,
            )
            q.options = [QuestionOption(label=l, content=c, is_correct=ic) for (l, c, ic) in d["opts"]]
            db.add(q)

        # 示范知识片段：供 RAG 检索增强（带权威来源标注）
        chunks = [
            KnowledgeChunk(
                kp="类比推理",
                title="类比推理核心方法",
                content="类比推理考查两组词之间的逻辑关系。常见关系包括：职业与对象（医生:病人）、组成关系、种属关系、因果关系、并列关系。解题时先判断题干关系类型，再逐一匹配选项。",
                source="行测判断推理专项（平台教研原创）",
                is_verified=True,
            ),
            KnowledgeChunk(
                kp="类比推理",
                title="易错点：职业对象 vs 职业工具",
                content="『医生:病人』是职业与服务对象；『司机:汽车』是职业与工具，二者关系不同，不可混淆。区分关系类型是类比推理高频易错点。",
                source="行测判断推理专项（平台教研原创）",
                is_verified=True,
            ),
            KnowledgeChunk(
                kp="常识判断",
                title="时政：2026 国考招录规模",
                content="2026 年度国考计划招录约 3.97 万人，报名通过资格审查约 371.8 万人，报录比约 74:1。数据以国家公务员局官方公告为准。",
                source="国家公务员局 2026 年度考试录用公务员公告",
                source_url="http://www.scs.gov.cn",
                is_verified=True,
            ),
            KnowledgeChunk(
                kp="逻辑判断",
                title="直言命题对当关系",
                content="全称肯定（所有 S 是 P）与特称肯定（有些 S 是 P）为差等关系：全称真则特称必真。全称肯定与全称否定为反对关系，二者不可同真但可同假。",
                source="行测判断推理专项（平台教研原创）",
                is_verified=True,
            ),
            KnowledgeChunk(
                kp="资料分析",
                title="增长率与比重速算",
                content="增长率 =（现期－基期）÷ 基期 ×100%；比重 = 部分 ÷ 整体 ×100%。注意基期与题干时间口径一致，勿把现期当基期。",
                source="行测资料分析专项（平台教研原创）",
                is_verified=True,
            ),
            KnowledgeChunk(
                kp="法律常识",
                title="宪法：国家机构组织原则",
                content="《宪法》第三条规定：中华人民共和国国家机构实行民主集中制的原则。人民代表大会由民主选举产生，对人民负责、受人民监督。",
                source="《中华人民共和国宪法》",
                source_url="http://www.npc.gov.cn",
                is_verified=True,
            ),
        ]
        db.add_all(chunks)
        db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 开发期自动建表（生产环境使用 Alembic 迁移脚本管理 schema）
    if settings.APP_ENV != "production":
        from app import models  # 确保模型注册到 Base.metadata

        models.Base.metadata.create_all(bind=engine)
        _seed_demo_data()
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version="0.1.0",
    description="AI-native 公考私教平台 API（MVP 脚手架）",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.CORS_ORIGINS.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")


@app.get("/health", tags=["system"])
def health_check():
    """健康检查 —— 供容器探针、监控与 CI 质量门禁使用。

    返回 db / llm 就绪态，便于发布前自动校验关键依赖。
    """
    from sqlalchemy import text

    db_ok = False
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False

    llm_ready = bool(settings.LLM_API_KEY and settings.LLM_BASE_URL and settings.LLM_MODEL)
    return {
        "status": "ok" if (db_ok and llm_ready) else "degraded",
        "app": settings.APP_NAME,
        "env": settings.APP_ENV,
        "db": "ready" if db_ok else "unavailable",
        "llm": "ready" if llm_ready else "not_configured",
    }


@app.get("/api/health", tags=["system"])
def health_check_api():
    """与 /health 等价的 /api 前缀别名，便于前端经统一 BASE 探活。"""
    return health_check()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)

# AI 公务员考前培训学习平台

> **定位**：AI-native 公考私教——更懂你短板、内容可信、花钱无忧、陪你上岸。
> 本仓库为**工程脚手架初始化（MVP 阶段）**，依据《竞品分析报告 v1.1》与《软件开发计划与实施方案 v1.0》。

## 技术栈（方案 c3 选型）

| 层面 | 选型 | 理由 |
|---|---|---|
| 前端 | React 18 + TypeScript + Vite + PWA(Workbox) | 组件化、离线缓存成熟、招聘面广 |
| 后端 | Python 3.13 + FastAPI | AI 生态好、异步高并发 |
| LLM | 国内合规大模型（混元/通义）+ 自研 prompt/评分层 | 合规、中文公考语料优、成本可控 |
| 向量库 | Milvus / Tencent Cloud VectorDB | RAG 知识检索、学情画像 |
| 数据库 | MySQL + Redis | 事务 + 缓存 |
| 基础设施 | 腾讯云（CVM/TKE/SCF/CDN） | 国内合规、微信生态打通 |

## 目录结构

```
gwy-platform/
├── frontend/            # React + TS + Vite + PWA
│   ├── src/
│   │   ├── api/         # 后端接口封装
│   │   ├── pages/       # 首页/学习/刷题/我的
│   │   ├── pwa/         # Service Worker 注册（离线优先）
│   │   └── components/  # 公共组件
│   └── public/manifest.webmanifest  # PWA 清单
├── backend/             # FastAPI
│   └── app/
│       ├── core/        # 配置、安全(JWT)
│       ├── db/          # 数据库会话
│       ├── api/         # 路由聚合
│       ├── models/      # ORM 模型
│       ├── services/    # 业务逻辑
│       └── ai/          # AI 能力层（差异化核心）
│           ├── llm_gateway.py     # 多模型路由 + 兜底
│           ├── rag.py             # 公考知识库检索
│           ├── tutor_agent.py     # AI 私教 Agent
│           ├── essay_grader.py    # 申论评分引擎
│           ├── adaptive.py        # 能力图谱 + SM-2
│           └── content_validator.py # 内容双签校验
├── docs/                # PRD / ADR / 设计系统
└── docker-compose.yml   # 本地一键起（frontend+backend+mysql+redis）
```

## 快速开始

```bash
# 后端
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # 填入 LLM / 数据库等配置
uvicorn app.main:app --reload --port 8000

# 前端
cd frontend
npm install
npm run dev            # http://localhost:5173

# 或一键起全套依赖（mysql + redis）
docker-compose up -d
```

## 环境变量

见 `backend/.env.example`。**关键前置（需提前申请）**：国内合规 LLM API Key、腾讯云账号、MySQL/Redis、微信支付商户号、短信服务。

## 开发节奏（方案 c6）

敏捷双周迭代 + 阶段「信号评审闸门」：阶段0 筹备 → MVP(P0) → 公测(P1) → 规模化(P2)。
WBS 任务看板见 WorkBuddy 任务列表（WBS 1.1 ~ 8.1）。

## 合规提醒（方案 c10/c11）

- 题库/真题须授权或原创，建版权台账
- 生成式 AI 服务需备案；内容标注「AI 辅助」
- PIPL：最小化收集、加密、授权、可注销导出
- 宣传禁用「保过」等绝对化用语

# AI 公务员考前培训学习平台

> **定位**：AI-native 公考私教——更懂你短板、内容可信、花钱无忧、陪你上岸。
> 依据《竞品分析报告 v1.1》与《软件开发计划与实施方案 v1.0》落地。当前已完成全系统功能闭环并**可部署至生产环境**（演示站点：`https://49.233.171.233/`）。

## 技术栈

| 层面 | 选型 | 说明 |
|---|---|---|
| 前端 | React 18 + TypeScript + Vite + PWA(Workbox) | 组件化、离线缓存（Service Worker）、单页应用 |
| 后端 | Python 3.13 + FastAPI + SQLAlchemy 2.x | 异步高并发，Pydantic v2 校验 |
| 数据库 | **SQLite + WAL（默认零依赖）** | 生产用 `/opt/gwy/data/gwy.db`；多 worker 经 WAL + `busy_timeout` 并发读写 |
| 进阶数据库 | MySQL（可选） | 规模化时经 `DATABASE_URL` 切换；`docker-compose up -d mysql` 起依赖 |
| 缓存 / 限流 | 进程内（Redis 可选） | 限流当前为单进程令牌桶；接 `REDIS_URL` 可实现多 worker 全局精确限流 |
| 迁移 | Alembic | 生产环境 schema 由 Alembic 管理（开发/测试用 `create_all` 兜底） |
| LLM | 国内合规大模型（OpenAI 兼容协议） | 经 `LLM_GATEWAY` 多模型路由 + 兜底；默认 DeepSeek |
| 部署 | nginx + systemd + `deploy/deploy.sh` | 后端 uvicorn `--workers 3`，前端静态构建由 nginx 反代 |

## 目录结构

```
gwy-platform/
├── frontend/                  # React + TS + Vite + PWA
│   ├── src/
│   │   ├── api/               # 后端接口封装（统一 /api 前缀、错误/401 处理）
│   │   ├── pages/             # Home/Learn/Practice/Exam/Essay/Chat/Plan/
│   │   │                      #   Membership/Review/Profile/Favorites/Wrong/Login
│   │   ├── theme/             # 设计系统（政务蓝/中国红 tokens、components.css）
│   │   └── pwa/               # Service Worker 注册（离线刷题）
│   └── public/manifest.webmanifest
├── backend/                   # FastAPI
│   ├── app/
│   │   ├── core/              # 配置(pydantic-settings)、安全(JWT/bcrypt)
│   │   ├── db/                # 会话（SQLite WAL PRAGMA）
│   │   ├── api/routes/        # auth/bank/student/ai/exam/billing/content
│   │   ├── models/            # ORM 模型（用户/题目/作答/订单/审核/计划…）
│   │   ├── schemas/           # 请求/响应模型
│   │   ├── services/          # 业务逻辑（学习计划、错题、推荐）
│   │   ├── ai/                # AI 能力层：llm_gateway/tutor_agent/essay_grader/
│   │   │                      #   adaptive/rag/content_validator
│   │   ├── middleware.py      # 安全头 + 认证限流 + 请求体上限
│   │   └── scripts/           # load_data（幂等导入 seed.json）
│   ├── alembic/               # 数据库迁移（env.py / versions）
│   ├── tests/                 # pytest 套件（smoke + feature）
│   └── data/seed.json         # 原创题库（行测 + 申论）+ 知识库 + 申论题
├── deploy/                    # 部署产物
│   ├── deploy.sh              # 本地构建→上传→Alembic→重启（需 PEM）
│   ├── gwy-backend.service    # systemd 单元（Restart=always）
│   ├── nginx_gwy.conf         # nginx 站点（HTTPS + 反代 /api）
│   └── backup.sh              # 每日 DB 备份轮转
├── docs/                      # PRD / 设计系统
├── docker-compose.yml         # 可选：MySQL + Redis 本地依赖（容器化部署备用）
└── README.md
```

## 快速开始（零依赖）

```bash
# 后端（默认 SQLite，开箱即用）
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # 默认 DATABASE_URL 即 SQLite，无需外部数据库
uvicorn app.main:app --reload --port 8000

# 前端
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

启动后后端自动幂等导入 `data/seed.json`（仅首次 / 库为空时）。首次建表：开发/测试环境由 `create_all` 兜底；生产环境由 Alembic 迁移管理。

### 可选：MySQL 本地依赖

```bash
docker-compose up -d mysql redis     # 启动 MySQL/Redis
# 在 .env 中改 DATABASE_URL 为上方注释里的 MySQL 地址，再启动后端
```

## 数据库迁移（Alembic）

```bash
cd backend
# 生成迁移（模型变更后）
alembic revision --autogenerate -m "描述"
# 升级到最新
alembic upgrade head
# 查看待生成操作（核对模型与库差异）
alembic check
```

`deploy.sh` 会在服务器上自动判断库状态并执行 `alembic upgrade head` / `alembic stamp head`。

## 测试与 CI

```bash
cd backend
APP_ENV=test SECRET_KEY=ci-test-secret .venv/bin/python -m pytest -q
```

- `tests/test_smoke.py`：注册/登录/题库/模考/申论/支付/审核/找回密码等主链路。
- `tests/test_features.py`：错题本/收藏/对话/计划打卡/配额/一致性闸门等特性。
- CI（`.github/workflows/ci.yml`）：push/PR 到 `main` 时跑后端 pytest + 前端 `tsc --noEmit` + `vite build`。

## 生产部署

演示站点：`https://49.233.171.233/`（nginx + 自签证书，浏览器提示「不安全」属正常；绑定域名后 `certbot` 一键换可信证书）。

1. 本地构建并上传（需服务器 PEM）：
   ```bash
   bash deploy/deploy.sh
   ```
   该脚本会：构建前端 → 打包后端/前端 → scp 到 `/opt/gwy` → 清 `__pycache__` → 安装依赖 → Alembic 迁移 → 重启 `gwy-backend.service`。
2. 重置数据库（清空后重启会自动重新建表并导入 seed）：
   ```bash
   systemctl stop gwy-backend
   rm -f /opt/gwy/data/gwy.db*
   systemctl restart gwy-backend
   ```
3. 备份：`deploy/backup.sh` 每日 04:00 WAL checkpoint 后复制 `gwy.db`，保留 14 份轮转。

## 功能状态（WBS 闭环）

| 模块 | 状态 | 说明 |
|---|---|---|
| 题库 / 刷题练习 | ✅ | 原创题库（行测 + 申论）、逐题判分、AI 私教讲解、收藏、错题本（复错率闭环） |
| 在线模考 | ✅ | 限时组卷、提分报告（正确率 + 薄弱知识点）、历史复盘；空科目友好兜底 |
| AI 私教对话 | ✅ | 多会话持久化、RAG 溯源、离线降级 |
| 学习计划 | ✅ | 生成即落库、打卡、连续打卡、进度追踪（执行-复盘闭环） |
| 申论批改 | ✅ | 两阶段评分 + 校准门、人-AI 一致性闸门（≥0.8，否则转人工）、记录与历史 |
| 会员 / 计费 | ✅ | 三档套餐、沙箱支付 + 通知回调、透明退费规则、配额限流 |
| 内容双签审核 | ✅ | 送审→甲签→乙签（不同人）→approved；可驳回/更正；抽检统计 |
| 账号安全 | ✅ | JWT、密码修改、忘记密码（开发模式返回令牌）、安全头 + 限流 |
| 适配 / 性能 | ✅ | PWA 离线、能力图谱、自适应推荐 |

## 合规提醒

- 题库/真题须授权或原创，建版权台账（当前 `seed.json` 均为平台原创、`is_verified=True`）。
- 生成式 AI 服务需备案；AI 输出标注「AI 辅助」。
- PIPL：最小化收集、加密、授权、可注销导出。
- 宣传禁用「保过」等绝对化用语。
- 商业化前置：国内合规 LLM API、微信/支付宝商户号、ICP 备案（演示站点暂未含真实支付与备案）。

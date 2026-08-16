#!/usr/bin/env bash
# AI 公考私教平台 —— 一键部署脚本（本地执行，需已配置服务器 SSH 私钥）
#
# 前置（仅首次，见 README 部署章节）：
#   1) 服务器生成自签证书：mkdir -p /opt/gwy/ssl && openssl req -x509 -nodes -days 365 \
#        -newkey rsa:2048 -keyout /opt/gwy/ssl/gwy.key -out /opt/gwy/ssl/gwy.crt -subj "/CN=49.233.171.233"
#   2) 安装 nginx 配置：cp deploy/nginx_gwy.conf /etc/nginx/conf.d/gwy.conf && nginx -t && systemctl reload nginx
#   3) 安装服务：cp deploy/gwy-backend.service /etc/systemd/system/ && systemctl daemon-reload && systemctl enable --now gwy-backend
#   4) 安装备份定时：echo '0 4 * * * /opt/gwy/backup.sh >> /opt/gwy/backups/cron.log 2>&1' | crontab -
#   5) 首次生产化：将 /opt/gwy/backend/.env 的 APP_ENV 改为 production（清空旧库后自动灌入原创题库）
#
# 用法：./deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

SERVER="root@49.233.171.233"
PEM="${DEPLOY_PEM:-$HOME/Downloads/gkaipx2.pem}"
# 兼容 Windows OpenSSH：将 Git-Bash 风格 /c/... 路径转为 Windows 风格 c:/...
PEM_WIN="$PEM"
if [[ "$PEM" == /*/* ]]; then
  PEM_WIN="${PEM:1:1}:${PEM:2}"
fi
SSH_OPTS=(-i "$PEM_WIN" -o StrictHostKeyChecking=no)

echo "==> 1/4 构建前端"
export PATH="/c/Users/hp/.workbuddy/binaries/node/versions/22.22.2:$PATH"
VITE_API_BASE=/api npm run build --prefix frontend

echo "==> 2/4 打包产物"
rm -f deploy_backend.tar.gz deploy_frontend.tar.gz || true
tar --exclude='.env' --exclude='*.db' --exclude='*.db-wal' --exclude='*.db-shm' \
    --exclude='__pycache__' --exclude='.pytest_cache' --exclude='venv' \
    --exclude='node_modules' --exclude='data' --exclude='scripts_fix' \
    --exclude='_preview_ocr.json' --exclude='_preview_ocr_full.json' \
    -czf deploy_backend.tar.gz -C backend .
tar -czf deploy_frontend.tar.gz -C frontend/dist .

echo "==> 3/4 上传"
scp "${SSH_OPTS[@]}" deploy_backend.tar.gz deploy_frontend.tar.gz "$SERVER:/tmp/"

echo "==> 4/4 服务器发布"
ssh "${SSH_OPTS[@]}" "$SERVER" '
  set -e
  rm -rf /opt/gwy/backend/app
  mkdir -p /opt/gwy/backend /opt/gwy/frontend/dist
  tar -xzf /tmp/deploy_backend.tar.gz -C /opt/gwy/backend
  rm -rf /opt/gwy/frontend/dist
  mkdir -p /opt/gwy/frontend/dist
  tar -xzf /tmp/deploy_frontend.tar.gz -C /opt/gwy/frontend/dist
  cp /opt/gwy/backend/deploy/backup.sh /opt/gwy/backup.sh 2>/dev/null || true
  find /opt/gwy/backend -name __pycache__ -type d -exec rm -rf {} +

  # 安装依赖（确保 Alembic 等随 requirements 落地）：开发/生产同 venv
  /opt/gwy/venv/bin/pip install -q -r /opt/gwy/backend/requirements.txt

  # 数据库迁移（Alembic）：按 DB 现状选择策略，避免对旧库（create_all 生成）误建表
  cd /opt/gwy/backend
  DBSTATUS=$(/opt/gwy/venv/bin/python - <<PY
import sqlite3
db="/opt/gwy/data/gwy.db"
try:
    c = sqlite3.connect(db)
except Exception:
    print("fresh"); raise SystemExit
names = [r[0] for r in c.execute("select name from sqlite_master where type=?", ("table",)).fetchall()]
# 业务核心表一旦存在，说明 schema 已由 legacy create_all 建好（含 alembic_version 空表的情形），
# 直接 stamp head 标记当前版本即可，绝不再跑 upgrade head（否则会因表已存在而崩）。
APP_TABLES = {"users", "questions", "content_reviews", "study_plans"}
app_present = any(n in APP_TABLES for n in names)
if not names or not app_present:
    print("fresh")
else:
    print("legacy")
PY
)
  case "$DBSTATUS" in
    fresh)    /opt/gwy/venv/bin/python -m alembic upgrade head ;;   # 真·空库：从基线建表
    legacy)   /opt/gwy/venv/bin/python -m alembic stamp head ;;     # 业务表已存在：标记当前版本，保留数据，不重复建表
  esac

  systemctl restart gwy-backend
  sleep 3
  systemctl is-active gwy-backend
'
echo "==> 完成。访问 https://49.233.171.233/ （自签证书浏览器会有提示，属正常）"

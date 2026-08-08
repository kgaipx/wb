#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AI 公考私教平台 —— 密码登录一键部署（本地执行，使用 paramiko 做非交互式密码 SSH）。
与 deploy.sh 行为一致：构建前端 -> 打两个 tar 包 -> SFTP 上传 -> 远端解包/装依赖/alembic/重启服务。

前置：
  - 服务器已开启密码登录（SSH 方法含 password）
  - 本机已 pip install paramiko
  - 设置环境变量：
        DEPLOY_PASSWORD   root 密码（必填）
        DEPLOY_SERVER     默认 49.233.171.233
        DEPLOY_USER       默认 root
用法：
        DEPLOY_PASSWORD='你的密码' python deploy_password.py
注意：密码仅用于本次 SSH 连接，不写入任何文件；脚本结束后不留存。
"""
import os
import sys
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SSH_HOST = os.environ.get("DEPLOY_SERVER", "49.233.171.233")
SSH_USER = os.environ.get("DEPLOY_USER", "root")
SSH_PASS = os.environ.get("DEPLOY_PASSWORD")
if not SSH_PASS:
    sys.exit("ERROR: 请先设置环境变量 DEPLOY_PASSWORD（服务器 root 密码）。")

NODE_BIN = "/c/Users/hp/.workbuddy/binaries/node/versions/22.22.2"

# ---------- 1) 本地构建 + 打包（复用 deploy.sh 的 bash 逻辑） ----------
build_script = f'''
set -euo pipefail
cd "{ROOT}"
export PATH="{NODE_BIN}:$PATH"
VITE_API_BASE=/api npm run build --prefix frontend
rm -f deploy_backend.tar.gz deploy_frontend.tar.gz || true
tar --exclude='.env' --exclude='*.db' --exclude='*.db-wal' --exclude='*.db-shm' \
    --exclude='__pycache__' --exclude='.pytest_cache' --exclude='venv' \
    --exclude='node_modules' --exclude='data' --exclude='scripts_fix' \
    --exclude='_preview_ocr.json' --exclude='_preview_ocr_full.json' \
    -czf deploy_backend.tar.gz -C backend .
tar -czf deploy_frontend.tar.gz -C frontend/dist .
echo BUILD_PACK_OK
'''
print("==> 1/3 本地构建 + 打包 ...")
subprocess.run(["bash", "-c", build_script], check=True)

# ---------- 2) 远端发布脚本（与 deploy.sh 第 4 步一致） ----------
remote_script = '''set -e
rm -rf /opt/gwy/backend/app
mkdir -p /opt/gwy/backend /opt/gwy/frontend/dist
tar -xzf /tmp/deploy_backend.tar.gz -C /opt/gwy/backend
rm -rf /opt/gwy/frontend/dist
mkdir -p /opt/gwy/frontend/dist
tar -xzf /tmp/deploy_frontend.tar.gz -C /opt/gwy/frontend/dist
cp /opt/gwy/backend/deploy/backup.sh /opt/gwy/backup.sh 2>/dev/null || true
find /opt/gwy/backend -name __pycache__ -type d -exec rm -rf {} +
/opt/gwy/venv/bin/pip install -q -r /opt/gwy/backend/requirements.txt
cd /opt/gwy/backend
DBSTATUS=$(/opt/gwy/venv/bin/python - <<PY
import sqlite3
db="/opt/gwy/data/gwy.db"
try:
    c = sqlite3.connect(db)
except Exception:
    print("fresh"); raise SystemExit
names = [r[0] for r in c.execute("select name from sqlite_master where type=?", ("table",)).fetchall()]
if not names:
    print("fresh")
elif "alembic_version" in names:
    print("versioned")
else:
    print("legacy")
PY
)
case "$DBSTATUS" in
  fresh)    /opt/gwy/venv/bin/python -m alembic upgrade head ;;
  legacy)   /opt/gwy/venv/bin/python -m alembic stamp head ;;
  versioned) /opt/gwy/venv/bin/python -m alembic upgrade head ;;
esac
systemctl restart gwy-backend
sleep 3
systemctl is-active gwy-backend
'''

tmp_remote = os.path.join(ROOT, "deploy", "_remote_publish.sh")
with open(tmp_remote, "w", encoding="utf-8") as f:
    f.write(remote_script)

# ---------- 3) paramiko 上传 + 远端执行 ----------
import paramiko  # 延迟导入，确保前面构建失败时能提前退出

print(f"==> 2/3 连接 {SSH_USER}@{SSH_HOST} 并上传 ...")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(
    SSH_HOST,
    username=SSH_USER,
    password=SSH_PASS,
    timeout=30,
    look_for_keys=False,
    allow_agent=False,
)

sftp = ssh.open_sftp()
sftp.put(tmp_remote, "/tmp/_remote_publish.sh")
sftp.put(os.path.join(ROOT, "deploy_backend.tar.gz"), "/tmp/deploy_backend.tar.gz")
sftp.put(os.path.join(ROOT, "deploy_frontend.tar.gz"), "/tmp/deploy_frontend.tar.gz")
sftp.close()

print("==> 3/3 远端发布（解包/装依赖/alembic/重启服务） ...")
stdin, stdout, stderr = ssh.exec_command("bash /tmp/_remote_publish.sh", timeout=900)
out = stdout.read().decode(errors="replace")
err = stderr.read().decode(errors="replace")
exit_status = stdout.channel.recv_exit_status()
ssh.close()

print("----- 远端 STDOUT -----")
print(out)
if err.strip():
    print("----- 远端 STDERR -----")
    print(err)
print("exit_status:", exit_status)

# 清理本地临时文件
try:
    os.remove(tmp_remote)
except OSError:
    pass

if exit_status != 0:
    sys.exit("远端发布失败，请查看上方输出。")

print("部署完成。访问 https://49.233.171.233/ （自签证书浏览器会有提示，属正常）")

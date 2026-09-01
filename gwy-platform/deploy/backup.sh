#!/bin/bash
# SQLite 每日备份：WAL checkpoint 落盘后复制 gwy.db（连同 -wal/-shm）到 /opt/gwy/backups，保留最近 14 份
set -e
SRC=/opt/gwy/data/gwy.db
DST=/opt/gwy/backups
mkdir -p "$DST"
TS=$(date +%Y%m%d_%H%M%S)

# 用 venv Python 做 checkpoint（不依赖系统 sqlite3 CLI），确保 WAL 已并入主库
/opt/gwy/venv/bin/python - <<'PY' || true
import sqlite3
try:
    c = sqlite3.connect("/opt/gwy/data/gwy.db")
    c.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    c.close()
except Exception as e:
    print("checkpoint skipped:", e)
PY

# 复制主库及 WAL/shm（若存在），保证副本可恢复
cp "$SRC" "$DST/gwy_$TS.db"
[ -f "$SRC-wal" ] && cp "$SRC-wal" "$DST/gwy_$TS.db-wal" || true
[ -f "$SRC-shm" ] && cp "$SRC-shm" "$DST/gwy_$TS.db-shm" || true

# 保留最近 14 份（按 .db 主文件计数，连同 -wal/-shm 一并清理）
mapfile -t OLD < <(ls -1t "$DST"/gwy_*.db 2>/dev/null | tail -n +15)
for f in "${OLD[@]}"; do
  rm -f "${f}" "${f}-wal" "${f}-shm"
done
echo "$(date '+%F %T') backup done -> $DST/gwy_$TS.db"

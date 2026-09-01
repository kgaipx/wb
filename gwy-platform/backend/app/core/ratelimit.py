"""SQLite-backed 滑动窗口限流（跨 uvicorn worker 共享计数）。

背景：生产 uvicorn 以 --workers 2 运行，纯内存限流每个 worker 独立计数——
同一 IP 的请求被分散到两个进程，各自可放行 max_count 次，实际阈值翻倍。
本实现把计数桶落到独立 SQLite 文件（ratelimit.db，与业务库分离，WAL 模式），
多进程共享同一份计数，严格按 max_count / window_seconds 限速。

- 键：客户端 IP（对登录/注册/找回等无登录态接口）。
- 时间：使用墙钟 time.time()（跨进程可比；monotonic 只在单进程内可比）。
- 容错：限流库异常时 fail-open（放行）并告警，避免基础设施问题误伤所有用户；
  攻击面影响有限（限流库损坏是小概率，且主防线是密码强度+审计）。
- 多机部署（横向扩容）时应换 Redis 版；单机多 worker 本实现已正确。
"""
import json
import os
import random
import re
import sqlite3
import threading
import time

from fastapi import HTTPException, Request

from app.core.config import settings

_LOCK = threading.Lock()
_conn: sqlite3.Connection | None = None
_CREATED = False


def _get_conn() -> sqlite3.Connection:
    """懒建连接：每个进程一个连接，指向与业务库同目录的 ratelimit.db。"""
    global _conn, _CREATED
    with _LOCK:
        if _conn is not None:
            return _conn
        url = settings.DATABASE_URL
        m = re.match(r"sqlite:///(.*)", url)
        path = m.group(1) if m else "ratelimit.db"
        d = os.path.dirname(path) or "."
        os.makedirs(d, exist_ok=True)
        db = os.path.join(d, "ratelimit.db")
        conn = sqlite3.connect(db, timeout=10, check_same_thread=False)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute(
            "CREATE TABLE IF NOT EXISTS rate_buckets ("
            "key TEXT PRIMARY KEY, hits TEXT NOT NULL, updated_at REAL NOT NULL)"
        )
        conn.commit()
        _conn = conn
        return conn


def rate_limit(max_count: int, window_seconds: int, name: str = "default"):
    """构造一个 FastAPI 依赖：同一 IP 在 window_seconds 内最多 max_count 次（跨 worker 共享）。

    name 是桶命名空间：注册/登录/找回密码必须用不同 name，否则会共享同一个 IP 桶，
    导致「注册 10 次把登录也限死」的串扰（曾犯过此错误）。
    """

    def dependency(request: Request) -> str:
        client_ip = request.client.host if request.client else "unknown"
        key = f"{name}:{client_ip}"
        now = time.time()
        try:
            conn = _get_conn()
            with _LOCK:
                row = conn.execute(
                    "SELECT hits FROM rate_buckets WHERE key=?", (key,)
                ).fetchone()
                hits = json.loads(row[0]) if row else []
                hits = [t for t in hits if now - t < window_seconds]
                if len(hits) >= max_count:
                    raise HTTPException(
                        status_code=429,
                        detail=f"操作过于频繁，请 {max(1, int(window_seconds / 60))} 分钟后再试",
                    )
                hits.append(now)
                # 注意：ON CONFLICT ... excluded.x 引用不占参数位，VALUES 只有 3 个占位符，
                # 只传 3 个参数（曾误传 5 个 → 每次写入抛错 → fail-open → 限流形同虚设）
                conn.execute(
                    "INSERT INTO rate_buckets(key, hits, updated_at) VALUES(?,?,?) "
                    "ON CONFLICT(key) DO UPDATE SET hits=excluded.hits, updated_at=excluded.updated_at",
                    (key, json.dumps(hits), now),
                )
                conn.commit()
                # 概率性清理过期键，防止表无限增长
                if random.random() < 0.01:
                    conn.execute(
                        "DELETE FROM rate_buckets WHERE updated_at < ?", (now - 86400,)
                    )
                    conn.commit()
        except HTTPException:
            raise
        except Exception as e:  # noqa: BLE001 —— 限流失败不能把用户锁死
            import logging

            logging.getLogger(__name__).warning("rate_limit backend error: %s", e)
        return key

    return dependency

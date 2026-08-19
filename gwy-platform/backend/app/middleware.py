"""生产安全中间件（方案 c10 合规与安全基线）。

- 安全响应头：X-Content-Type-Options / X-Frame-Options(DENY) / Referrer-Policy /
  Content-Security-Policy；HTTPS 下追加 HSTS。
- 认证限流：对 /api/auth/* 的 POST 做按 IP 令牌桶（默认 10 次/分钟），抵御爆破。
- 请求体大小限制：POST/PUT/PATCH 超过上限（默认 1MB）返回 413，降低滥用/DoS 风险。

说明：多 worker 下限流为进程内计数（每 worker 独立），整体阈值为 N 倍；
如需全局精确限流可接入 Redis（已预留 REDIS_URL）。真实客户端 IP 取自
X-Forwarded-For / X-Real-IP（经 nginx 反代透传）。
"""
from __future__ import annotations

import time
from collections import defaultdict
from typing import Callable

from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp, Receive, Scope, Send

MAX_BODY_BYTES = 1 * 1024 * 1024  # 1 MB
AUTH_LIMIT = 10          # 每窗口允许次数
AUTH_WINDOW = 60         # 窗口秒数


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    real = request.headers.get("x-real-ip")
    if real:
        return real.strip()
    return request.client.host if request.client else "anon"


class SecurityMiddleware:
    """统一安全头 + 认证限流 + 请求体大小限制。"""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self._buckets: dict[str, list[float]] = defaultdict(list)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request = Request(scope, receive)
        path = request.url.path
        method = request.method

        # 1) 认证限流
        if path.startswith("/api/auth/") and method == "POST":
            ip = _client_ip(request)
            now = time.time()
            bucket = self._buckets[ip]
            bucket[:] = [t for t in bucket if now - t < AUTH_WINDOW]
            if len(bucket) >= AUTH_LIMIT:
                resp = JSONResponse(
                    status_code=429,
                    content={"detail": "请求过于频繁，请稍后再试"},
                )
                self._set_headers(resp, request)
                await resp(scope, receive, send)
                return
            bucket.append(now)

        # 2) 请求体大小限制
        if method in ("POST", "PUT", "PATCH"):
            cl = request.headers.get("content-length")
            if cl and int(cl) > MAX_BODY_BYTES:
                resp = JSONResponse(status_code=413, content={"detail": "请求体过大"})
                self._set_headers(resp, request)
                await resp(scope, receive, send)
                return

        # 3) 透传，并在响应上补安全头
        async def _send_with_headers(message: dict) -> None:
            if message["type"] == "http.response.start":
                headers = message.setdefault("headers", [])
                _inject_headers(headers, request)
            await send(message)

        await self.app(scope, receive, _send_with_headers)

    @staticmethod
    def _set_headers(resp: JSONResponse, request: Request) -> None:
        _inject_headers(resp.raw_headers, request)


def _inject_headers(headers: list, request: Request) -> None:
    """将安全头写入 ASGI header 列表（字节元组）。"""
    items = {
        b"x-content-type-options": b"nosniff",
        b"x-frame-options": b"DENY",
        b"referrer-policy": b"no-referrer-when-downgrade",
        b"content-security-policy": (
            b"default-src 'self'; "
            b"img-src 'self' data: https:; "
            b"style-src 'self' 'unsafe-inline'; "
            b"script-src 'self' 'sha256-oAU4lZf78jFB8cAMqapQ5AOYxrAJKR9Z/s4a6B8V4N8='; "
            b"font-src 'self' data:; "
            b"connect-src 'self'"
        ),
    }
    if request.url.scheme == "https":
        items[b"strict-transport-security"] = b"max-age=31536000; includeSubDomains"
    existing = {k.lower() for (k, _) in headers}
    for k, v in items.items():
        if k not in existing:
            headers.append((k, v))

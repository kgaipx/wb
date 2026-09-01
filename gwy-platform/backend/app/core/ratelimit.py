"""轻量内存限流（登录/注册/找回密码防爆破）。

单进程内存滑动窗口实现；多进程/多实例部署时应替换为 Redis 版（见注释）。
对登录、注册等无登录态的高风险接口按客户端 IP 限速，
避免被脚本刷注册 / 暴力撞密码 / 撞库枚举。
"""
import threading
import time

from fastapi import HTTPException, Request

_LOCK = threading.Lock()
_BUCKETS: dict[str, list[float]] = {}
# 定期清理的兜底：超过该条数的 key 会在写入时做一次全量清理
_MAX_KEYS = 10_000


def rate_limit(max_count: int, window_seconds: int):
    """构造一个 FastAPI 依赖：同一 IP 在 window_seconds 内最多 max_count 次。

    用法：
        @router.post("/login")
        def login(..., _: str = Depends(rate_limit(10, 300))):
            ...
    """

    def dependency(request: Request) -> str:
        key = request.client.host if request.client else "unknown"
        now = time.monotonic()
        with _LOCK:
            if len(_BUCKETS) > _MAX_KEYS:
                # 全量清理过期条目，防止内存无限增长
                for k in [k for k, v in _BUCKETS.items() if not v or now - v[-1] >= window_seconds]:
                    _BUCKETS.pop(k, None)
            hits = [t for t in _BUCKETS.get(key, []) if now - t < window_seconds]
            if len(hits) >= max_count:
                raise HTTPException(
                    status_code=429,
                    detail=f"操作过于频繁，请 {max(1, int(window_seconds / 60))} 分钟后再试",
                )
            hits.append(now)
            _BUCKETS[key] = hits
        return key

    return dependency

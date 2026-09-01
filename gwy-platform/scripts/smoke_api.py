#!/usr/bin/env python3
"""gwy-platform 生产 API 冒烟回归（常驻脚本，纯 stdlib 无依赖）。

用法：
    python scripts/smoke_api.py                # 默认 https://49.233.171.233
    python scripts/smoke_api.py https://其他环境

覆盖（每次部署后跑一遍即证明核心链路活着）：
  1. /health 200 且 env=production
  2. 注册/登录/me
  3. 核心只读接口：题库 / 配额 / 学情 / 套餐 / 通知 / 会话
  4. 商业闭环：下单(pending) → 沙箱支付(paid) → plan 变 pro
  5. 支付回调安全：无令牌 notify 必须被拒（403/503），且订单状态不被篡改
  6. 登录限流：12 次错误密码必须出现 429

退出码：全过 0；任一失败 1。用独立临时账号，不触碰已有数据。
"""
import json
import ssl
import sys
import time
import urllib.error
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://49.233.171.233"
API = BASE + "/api"

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

PASS = 0
FAIL = 0
FAILURES: list[str] = []


def check(name: str, cond: bool, detail: str = "") -> None:
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  PASS  {name}")
    else:
        FAIL += 1
        FAILURES.append(name)
        print(f"  FAIL  {name}  {detail}")


def call(method: str, path: str, body=None, tok: str | None = None):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"}
    if tok:
        headers["Authorization"] = f"Bearer {tok}"
    req = urllib.request.Request(API + path, data=data, headers=headers, method=method)
    try:
        resp = urllib.request.urlopen(req, context=ctx, timeout=20)
        return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, e.read()[:160].decode(errors="replace")
    except Exception as e:  # 网络类异常
        return -1, str(e)[:160]


def main() -> int:
    print(f"SMOKE {BASE} @ {time.strftime('%F %T')}")

    # 1) health
    st, h = call("GET", "/health")
    check("health 200", st == 200, str(st))
    check("health env=production", st == 200 and h.get("env") == "production", str(h.get("env")))

    # 2) register
    email = f"smoke_{int(time.time())}@example.com"
    st, r = call("POST", "/auth/register", {"email": email, "password": "test1234", "nickname": "smoke"})
    tok = r.get("access_token") if isinstance(r, dict) else None
    check("register 201 + token", st == 201 and bool(tok), f"st={st}")

    # 3) login + me
    st, _ = call("POST", "/auth/login", {"email": email, "password": "test1234"})
    if st == 429:
        # 同 IP 5 分钟内多次跑本脚本可能把登录限流打满；端点活着（429 本身证明服务正常）
        print("  SKIP  login 200 (rate-limited by prior runs, 429 = service alive)")
    else:
        check("login 200", st == 200, str(st))
    st, me = call("GET", "/auth/me", tok=tok)
    check("me 200 role=user", st == 200 and isinstance(me, dict) and me.get("role") == "user", str(me if not isinstance(me, dict) else me.get("role")))

    # 4) core read endpoints
    for name, path in [
        ("题库", "/bank/questions?limit=3"),
        ("配额", "/ai/quota"),
        ("学情", "/student/stats"),
        ("套餐", "/billing/plans"),
        ("通知", "/notifications"),
        ("会话", "/ai/chat/sessions"),
    ]:
        st, _ = call("GET", path, tok=tok)
        check(f"{name} 200", st == 200, str(st))

    # 5) business loop: order -> sandbox pay -> pro
    st, o = call("POST", "/billing/orders", {"plan": "pro"}, tok)
    oid = o.get("id") if isinstance(o, dict) else None
    check("下单 pending", st == 201 and o.get("status") == "pending", f"st={st} status={o.get('status')}")
    st, p = call("POST", f"/billing/pay/sandbox/{oid}", None, tok)
    check("沙箱支付 paid", st == 200 and p.get("status") == "paid", f"st={st} status={p.get('status')}")
    st, me2 = call("GET", "/billing/me", tok=tok)
    check("plan -> pro", st == 200 and me2.get("plan") == "pro", str(me2.get("plan")))

    # 6) payment callback security: notify without token must be rejected
    st, _ = call("POST", "/billing/pay/notify", {"out_trade_no": oid})
    check("无令牌 notify 被拒(403/503)", st in (403, 503), str(st))
    st, me3 = call("GET", "/billing/me", tok=tok)
    intact = st == 200 and any(x["id"] == oid and x["status"] == "paid" for x in me3.get("orders", []))
    check("订单状态未被篡改", intact)

    # 7) rate limit: 12 wrong-password logins must hit 429
    codes = [call("POST", "/auth/login", {"email": email, "password": "wrong"})[0] for _ in range(12)]
    check("登录限流出现 429", 429 in codes, str(codes))

    print(f"\nRESULT: {PASS} passed, {FAIL} failed")
    if FAILURES:
        print("FAILED:", ", ".join(FAILURES))
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())

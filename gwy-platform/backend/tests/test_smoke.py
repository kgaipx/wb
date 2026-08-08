"""全链路冒烟测试（固化人工验证路径，加固 WBS 8.1 质量门禁）。

覆盖：健康检查 / 注册登录 / 学情 / 刷题判分 / 在线模考 / 错题本闭环 / 收藏夹 CRUD /
AI 讲解·申论批改（mock LLM）/ 会员退费 / 内容双签校验。AI 调用通过 monkeypatch 隔离，保证离线可跑。
"""
from app.api.routes import ai as ai_routes
import app.main as main_mod
import app.middleware as _mw_mod
from app.middleware import SecurityMiddleware


def _register(client, email="t1@e.com", password="secret1"):
    r = client.post(
        "/api/auth/register",
        json={"email": email, "password": password, "target_exam": "省考"},
    )
    assert r.status_code == 201, r.text
    return r.json()["access_token"]


def _hdr(token):
    return {"Authorization": f"Bearer {token}"}


def _make_reviewer(client, email="rev@e.com", password="secret1"):
    """注册普通用户后直接将其角色提升为 reviewer（测试专用；生产由管理员后台分配）。"""
    r = client.post(
        "/api/auth/register",
        json={"email": email, "password": password, "target_exam": "省考"},
    )
    assert r.status_code == 201, r.text
    from app.db.session import SessionLocal
    from app.models import User

    db = SessionLocal()
    try:
        u = db.query(User).filter(User.email == email).first()
        u.role = "reviewer"
        db.commit()
    finally:
        db.close()
    return r.json()["access_token"]


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] in ("ok", "degraded")


def test_register_login_me(client):
    tok = _register(client)
    # 重复注册冲突
    dup = client.post("/api/auth/register", json={"email": "t1@e.com", "password": "secret1"})
    assert dup.status_code == 409
    # 登录
    r = client.post("/api/auth/login", json={"email": "t1@e.com", "password": "secret1"})
    assert r.status_code == 200 and "access_token" in r.json()
    # /me 受保护
    me = client.get("/api/auth/me", headers=_hdr(tok))
    assert me.status_code == 200 and me.json()["email"] == "t1@e.com"


def test_protected_requires_auth(client):
    assert client.get("/api/student/me").status_code == 401
    assert client.get("/api/bank/questions").status_code == 200  # 题库列表公开


def test_practice_updates_dashboard(client):
    tok = _register(client, "p@e.com", "secret1")
    qs = client.get("/api/bank/questions?limit=20").json()
    assert len(qs) >= 1
    q0 = client.get(f"/api/bank/questions/{qs[0]['id']}").json()
    sel = q0["options"][0]["label"]
    pr = client.post(
        "/api/bank/practice",
        json={"question_id": q0["id"], "selected": sel},
        headers=_hdr(tok),
    )
    assert pr.status_code == 200
    assert isinstance(pr.json()["is_correct"], bool)
    dash = client.get("/api/student/me", headers=_hdr(tok)).json()
    assert dash["total_answers"] >= 1
    assert len(dash["ability"]) >= 1


def test_exam_flow(client):
    tok = _register(client, "e@e.com", "secret1")
    start = client.post("/api/exam/start", json={"count": 20}, headers=_hdr(tok))
    assert start.status_code == 200
    paper = start.json()["paper"]
    assert len(paper) >= 1
    # 组卷必须隐藏正确答案（不泄漏 is_correct）
    assert "is_correct" not in paper[0]["options"][0]
    answers = [{"question_id": q["id"], "selected": q["options"][0]["label"]} for q in paper]
    rep = client.post("/api/exam/submit", json={"answers": answers}, headers=_hdr(tok))
    assert rep.status_code == 200
    body = rep.json()
    assert body["total"] == len(paper)
    assert 0 <= body["correct_rate"] <= 1
    assert isinstance(body["weak_points"], list)


def test_explain_mocked(client, monkeypatch):
    tok = _register(client, "x@e.com", "secret1")

    def fake(self, q, sel=None):
        return {
            "knowledge_point": q.knowledge_point,
            "explanation": "MOCK",
            "citations": ["src"],
            "model": "mock",
        }

    monkeypatch.setattr(ai_routes.TutorAgent, "explain_question", fake)
    qs = client.get("/api/bank/questions?limit=5").json()
    r = client.post("/api/ai/explain", json={"question_id": qs[0]["id"]}, headers=_hdr(tok))
    assert r.status_code == 200
    assert r.json()["explanation"] == "MOCK"


def test_essay_grade_mocked(client, monkeypatch):
    tok = _register(client, "y@e.com", "secret1")

    class Fake:
        total = 82
        dimensions = {"立意": 20, "结构": 18, "论证": 20, "语言": 14, "规范": 10}
        needs_human_review = False
        rationale = "MOCK"

    monkeypatch.setattr(
        ai_routes.EssayGrader, "grade",
        lambda self, text, material="", requirement="", max_score=100: Fake(),
    )
    r = client.post(
        "/api/ai/essay-grade",
        json={"essay_text": "作答", "max_score": 100},
        headers=_hdr(tok),
    )
    assert r.status_code == 200
    assert r.json()["total"] == 82


def test_billing_flow(client):
    tok = _register(client, "b@e.com", "secret1")
    o = client.post("/api/billing/orders", json={"plan": "pro"}, headers=_hdr(tok)).json()
    assert o["status"] == "pending" and o["amount"] == 9900
    # 沙箱模拟支付成功 → 开通会员
    pay = client.post(f"/api/billing/pay/sandbox/{o['id']}", headers=_hdr(tok)).json()
    assert pay["status"] == "paid"
    me = client.get("/api/billing/me", headers=_hdr(tok)).json()
    assert me["plan"] == "pro"
    rf = client.post(
        "/api/billing/refund",
        json={"order_id": o["id"], "reason": "不合适"},
        headers=_hdr(tok),
    ).json()
    assert rf["amount"] > 0 and rf["status"] == "refunded"


def test_content_double_sign(client):
    """双签鉴权：未登录→401、普通学员→403；两名不同审核员各签一签→approved，同人重复签→400。"""
    anon = client.post(f"/api/content/review/1/approve", json={})
    assert anon.status_code in (401, 403)
    tok_user = _register(client, "c@e.com", "secret1")
    as_user = client.post(f"/api/content/review/1/approve", json={}, headers=_hdr(tok_user))
    assert as_user.status_code == 403

    tok_a = _make_reviewer(client, "rev_a@e.com", "secret1")
    sub = client.post(
        "/api/content/review/submit",
        json={"item_type": "question", "item_id": "q:1", "body": "示范题面"},
        headers=_hdr(tok_user),
    ).json()
    assert sub["status"] == "pending"
    a1 = client.post(f"/api/content/review/{sub['id']}/approve", json={}, headers=_hdr(tok_a)).json()
    assert a1["reviewer_1"] == "rev_a@e.com" and a1["status"] == "pending"
    # 同一审核员重复签名 -> 400
    dup = client.post(f"/api/content/review/{sub['id']}/approve", json={}, headers=_hdr(tok_a))
    assert dup.status_code == 400
    tok_b = _make_reviewer(client, "rev_b@e.com", "secret1")
    a2 = client.post(f"/api/content/review/{sub['id']}/approve", json={}, headers=_hdr(tok_b)).json()
    assert a2["status"] == "approved" and a2["reviewer_2"] == "rev_b@e.com"
    pend = client.get("/api/content/review/pending", headers=_hdr(tok_a)).json()
    assert all(r["status"] == "pending" for r in pend)


def test_wrongbook_and_review_loop(client):
    """错答进入错题本；复盘后移出错题本（复错率闭环）。"""
    tok = _register(client, "w@e.com", "secret1")
    q0_id = client.get("/api/bank/questions?limit=20").json()[0]["id"]
    q0 = client.get(f"/api/bank/questions/{q0_id}").json()
    # 选定一个错误选项：先试 A，若恰好答对则换 B
    sel = q0["options"][0]["label"]
    pr = client.post(
        "/api/bank/practice", json={"question_id": q0["id"], "selected": sel}, headers=_hdr(tok)
    ).json()
    if pr["is_correct"]:
        sel = q0["options"][1]["label"]
        pr = client.post(
            "/api/bank/practice", json={"question_id": q0["id"], "selected": sel}, headers=_hdr(tok)
        ).json()
    assert pr["is_correct"] is False

    wrong = client.get("/api/student/wrong", headers=_hdr(tok)).json()
    assert any(w["question"]["id"] == q0["id"] for w in wrong)

    rev = client.post(f"/api/student/wrong/{q0['id']}/review", headers=_hdr(tok))
    assert rev.status_code == 200
    wrong2 = client.get("/api/student/wrong", headers=_hdr(tok)).json()
    assert all(w["question"]["id"] != q0["id"] for w in wrong2)


def test_favorites_crud(client):
    """收藏夹增加/幂等/删除。"""
    tok = _register(client, "f@e.com", "secret1")
    qid = client.get("/api/bank/questions?limit=20").json()[0]["id"]

    assert client.get("/api/bank/favorites", headers=_hdr(tok)).json() == []
    assert client.post("/api/bank/favorites", json={"question_id": qid}, headers=_hdr(tok)).status_code == 200

    favs = client.get("/api/bank/favorites", headers=_hdr(tok)).json()
    assert any(q["id"] == qid for q in favs)

    # 重复添加应幂等（不重复收藏）
    client.post("/api/bank/favorites", json={"question_id": qid}, headers=_hdr(tok))
    favs2 = client.get("/api/bank/favorites", headers=_hdr(tok)).json()
    assert sum(1 for q in favs2 if q["id"] == qid) == 1

    assert client.delete(f"/api/bank/favorites/{qid}", headers=_hdr(tok)).status_code == 200
    assert client.get("/api/bank/favorites", headers=_hdr(tok)).json() == []


def test_ai_chat_online(client, monkeypatch):
    """AI 私教对话：LLM 可用时返回答案与来源。"""
    tok = _register(client, "chat@e.com", "secret1")

    class _Resp:
        content = "类比推理要先判断题干两组词的关系类型，再逐一匹配选项。"
        model = "fake-model"
        token_usage = 0

    def _fake(self, *a, **k):
        return _Resp()

    monkeypatch.setattr("app.ai.llm_gateway.LLMGateway.complete", _fake)
    r = client.post(
        "/api/ai/chat",
        headers=_hdr(tok),
        json={"messages": [{"role": "user", "content": "类比推理怎么学"}]},
    )
    assert r.status_code == 200
    d = r.json()
    assert d["offline"] is False
    assert "类比" in d["answer"]


def test_ai_chat_offline_fallback(client, monkeypatch):
    """AI 私教对话：LLM 不可用时降级为离线检索摘要（绝不 500）。"""
    tok = _register(client, "chat2@e.com", "secret1")

    def _boom(self, *a, **k):
        raise RuntimeError("no network")

    monkeypatch.setattr("app.ai.llm_gateway.LLMGateway.complete", _boom)
    r = client.post(
        "/api/ai/chat",
        headers=_hdr(tok),
        json={"messages": [{"role": "user", "content": "类比推理怎么学"}]},
    )
    assert r.status_code == 200
    d = r.json()
    assert d["offline"] is True
    assert d["answer"]


def _seed_wrong_answer(client, tok):
    """造一道错答，使 planner 的 priority 知识点非空（触发 LLM/降级分支）。"""
    import json as _json

    q0 = client.get("/api/bank/questions?limit=20").json()[0]
    q0d = client.get(f"/api/bank/questions/{q0['id']}").json()
    sel = q0d["options"][0]["label"]
    pr = client.post(
        "/api/bank/practice", json={"question_id": q0["id"], "selected": sel}, headers=_hdr(tok)
    ).json()
    if pr["is_correct"]:
        sel = q0d["options"][1]["label"]
        client.post(
            "/api/bank/practice", json={"question_id": q0["id"], "selected": sel}, headers=_hdr(tok)
        )
    return q0["id"], _json


def test_ai_plan_online(client, monkeypatch):
    """AI 学习计划：LLM 可用时返回结构化 JSON 计划（items 数 = days）。"""
    tok = _register(client, "plan@e.com", "secret1")
    _, _json = _seed_wrong_answer(client, tok)

    class _Resp:
        content = _json.dumps(
            {
                "summary": "7 天冲刺计划",
                "items": [
                    {
                        "day": i + 1,
                        "focus": f"KP{i}",
                        "summary": f"第{i+1}天主攻 KP{i}",
                        "knowledge_points": [f"KP{i}"],
                        "tasks": [{"kind": "practice", "title": "刷 3 题", "target": f"KP{i}", "ref_id": 1}],
                    }
                    for i in range(7)
                ],
            }
        )
        model = "fake-model"
        token_usage = 0

    def _fake(self, *a, **k):
        return _Resp()

    monkeypatch.setattr("app.ai.llm_gateway.LLMGateway.complete", _fake)
    r = client.post("/api/ai/plan", headers=_hdr(tok), json={"days": 7})
    assert r.status_code == 200
    d = r.json()
    assert d["offline"] is False
    assert len(d["items"]) == 7
    assert d["items"][0]["day"] == 1
    assert d["items"][0]["tasks"][0]["kind"] == "practice"


def test_ai_plan_offline_fallback(client, monkeypatch):
    """AI 学习计划：LLM 不可用时降级为规则计划（items 数 = days，offline=True）。"""
    tok = _register(client, "plan2@e.com", "secret1")
    _seed_wrong_answer(client, tok)

    def _boom(self, *a, **k):
        raise RuntimeError("no network")

    monkeypatch.setattr("app.ai.llm_gateway.LLMGateway.complete", _boom)
    r = client.post("/api/ai/plan", headers=_hdr(tok), json={"days": 7})
    assert r.status_code == 200
    d = r.json()
    assert d["offline"] is True
    assert len(d["items"]) == 7
    assert d["items"][0]["tasks"]


def test_plan_persist_and_checkin_loop(client, monkeypatch):
    """学习计划落库 + 打卡闭环：生成即保存、GET 取当前、打卡更新进度、重生成换新计划。"""
    tok = _register(client, "loop@e.com", "secret1")
    _seed_wrong_answer(client, tok)

    def _boom(self, *a, **k):
        raise RuntimeError("no network")

    monkeypatch.setattr("app.ai.llm_gateway.LLMGateway.complete", _boom)

    # 生成即落库
    r = client.post("/api/ai/plan", headers=_hdr(tok), json={"days": 7})
    assert r.status_code == 200
    p = r.json()
    assert "plan_id" in p
    assert p["progress"]["total_tasks"] > 0
    assert 0.0 <= p["progress"]["rate"] <= 1.0

    # GET 取当前计划（同一份）
    g = client.get("/api/ai/plan", headers=_hdr(tok))
    assert g.status_code == 200
    assert g.json()["plan_id"] == p["plan_id"]

    # 打卡第一个任务 -> done + 进度 +1 + 连续打卡>=1
    tid = p["items"][0]["tasks"][0]["id"]
    before = p["progress"]["done_tasks"]
    tg = client.post(f"/api/ai/plan/tasks/{tid}/toggle", headers=_hdr(tok))
    assert tg.status_code == 200
    assert tg.json()["task"]["done"] is True
    assert tg.json()["progress"]["done_tasks"] == before + 1
    assert tg.json()["progress"]["streak_days"] >= 1

    # 取消打卡 -> 还原
    tg2 = client.post(f"/api/ai/plan/tasks/{tid}/toggle", headers=_hdr(tok))
    assert tg2.json()["task"]["done"] is False
    assert tg2.json()["progress"]["done_tasks"] == before

    # 打卡不存在的任务 -> 404
    assert client.post("/api/ai/plan/tasks/999999/toggle", headers=_hdr(tok)).status_code == 404

    # 重生成 -> 旧计划被替换：打卡计数归零、生成时间刷新，GET 取到同一份新计划
    r2 = client.post("/api/ai/plan", headers=_hdr(tok), json={"days": 7})
    assert r2.json()["progress"]["done_tasks"] == 0
    assert r2.json()["generated_at"] >= p["generated_at"]
    g2 = client.get("/api/ai/plan", headers=_hdr(tok))
    assert g2.json()["plan_id"] == r2.json()["plan_id"]
    assert g2.json()["generated_at"] == r2.json()["generated_at"]


def test_plan_get_404_when_none(client):
    """无计划时 GET /ai/plan 返回 404（前端据此触发生成）。"""
    tok = _register(client, "nope@e.com", "secret1")
    assert client.get("/api/ai/plan", headers=_hdr(tok)).status_code == 404


def test_content_dual_sign_flow(client):
    """内容双签：送审→甲签→乙签→approved；同人重复签名报错；pending 可查；抽检统计累计。"""
    tok_user = _register(client, "rev@e.com", "secret1")
    tok_a = _make_reviewer(client, "flow_a@e.com", "secret1")
    tok_b = _make_reviewer(client, "flow_b@e.com", "secret1")

    # 送审（任意登录用户）
    s = client.post(
        "/api/content/review/submit",
        headers=_hdr(tok_user),
        json={"item_type": "question", "item_id": "q-demo-1", "body": "AI 解析草稿", "version": 1},
    )
    assert s.status_code == 201, s.text
    rid = s.json()["id"]
    assert s.json()["status"] == "pending"

    # pending 列表含该单（需审核员）
    pend = client.get("/api/content/review/pending", headers=_hdr(tok_a)).json()
    assert any(x["id"] == rid for x in pend)

    # 甲签
    a1 = client.post(f"/api/content/review/{rid}/approve", json={}, headers=_hdr(tok_a))
    assert a1.status_code == 200 and a1.json()["reviewer_1"] == "flow_a@e.com"
    assert a1.json()["status"] == "pending"  # 尚缺一签

    # 同人重复签名 -> 400
    dup = client.post(f"/api/content/review/{rid}/approve", json={}, headers=_hdr(tok_a))
    assert dup.status_code == 400

    # 乙签 -> 双签完成
    a2 = client.post(f"/api/content/review/{rid}/approve", json={}, headers=_hdr(tok_b))
    assert a2.status_code == 200
    assert a2.json()["reviewer_2"] == "flow_b@e.com"
    assert a2.json()["status"] == "approved"

    # 已通过不再出现在 pending
    pend2 = client.get("/api/content/review/pending", headers=_hdr(tok_a)).json()
    assert not any(x["id"] == rid for x in pend2)

    # 抽检统计：累计与已通过均含该单
    sc = client.get("/api/content/review/spot-check", headers=_hdr(tok_a)).json()
    assert sc["total"] >= 1 and sc["approved"] >= 1


def test_content_reject_and_correct(client):
    """内容双签：驳回（带意见）/ 更正（版本+1、状态 corrected），均须审核员角色。"""
    tok_user = _register(client, "rev2@e.com", "secret1")
    tok_r = _make_reviewer(client, "rev2_r@e.com", "secret1")

    s = client.post(
        "/api/content/review/submit",
        headers=_hdr(tok_user),
        json={"item_type": "knowledge", "item_id": "kp-demo-2", "body": "待审知识点", "version": 1},
    )
    rid = s.json()["id"]

    rj = client.post(
        f"/api/content/review/{rid}/reject",
        json={"note": "表述不准确"},
        headers=_hdr(tok_r),
    )
    assert rj.status_code == 200
    assert rj.json()["status"] == "rejected"
    assert rj.json()["reviewer_note"] == "表述不准确"

    # 重新送审并更正
    s2 = client.post(
        "/api/content/review/submit",
        headers=_hdr(tok_user),
        json={"item_type": "knowledge", "item_id": "kp-demo-3", "body": "v1 内容", "version": 1},
    )
    rid2 = s2.json()["id"]
    co = client.post(
        f"/api/content/review/{rid2}/correct",
        json={"new_body": "v2 修正后内容"},
        headers=_hdr(tok_r),
    )
    assert co.status_code == 200
    assert co.json()["status"] == "corrected"
    assert co.json()["version"] == 2
    assert co.json()["body"] == "v2 修正后内容"


def test_chat_session_persist(client, monkeypatch):
    """AI 私教对话持久化：建会话→收发→刷新加载→多会话切换→删除（WBS 3.1 闭环）。"""
    tok = _register(client, "cs@e.com", "secret1")

    class _Resp:
        content = "这是私教的回答"
        model = "fake-model"
        token_usage = 0

    def _fake(self, *a, **k):
        return _Resp()

    monkeypatch.setattr("app.ai.llm_gateway.LLMGateway.complete", _fake)

    # 新建会话
    s = client.post("/api/ai/chat/sessions", headers=_hdr(tok))
    assert s.status_code == 201, s.text
    sid = s.json()["id"]

    # 第一条消息自动生成标题（取前 20 字）
    content = "如何高效备考资料分析"
    r = client.post(
        f"/api/ai/chat/sessions/{sid}/messages",
        headers=_hdr(tok),
        json={"content": content},
    )
    assert r.status_code == 200
    assert r.json()["title"] == content
    assert r.json()["message"]["role"] == "assistant"
    assert r.json()["message"]["content"] == "这是私教的回答"

    # 会话列表：message_count=2（用户+助手），标题正确
    lst = client.get("/api/ai/chat/sessions", headers=_hdr(tok)).json()
    assert any(x["id"] == sid and x["message_count"] == 2 for x in lst)

    # 刷新加载：消息按时间正序，首条为用户、次条为助手
    msgs = client.get(f"/api/ai/chat/sessions/{sid}/messages", headers=_hdr(tok)).json()
    assert len(msgs) == 2
    assert msgs[0]["role"] == "user" and msgs[0]["content"] == content
    assert msgs[1]["role"] == "assistant" and msgs[1]["content"] == "这是私教的回答"

    # 第二条消息：多轮上下文连续
    r2 = client.post(
        f"/api/ai/chat/sessions/{sid}/messages",
        headers=_hdr(tok),
        json={"content": "那数量关系呢"},
    )
    assert r2.status_code == 200
    msgs2 = client.get(f"/api/ai/chat/sessions/{sid}/messages", headers=_hdr(tok)).json()
    assert len(msgs2) == 4

    # 第二个会话 + 切换
    s2 = client.post("/api/ai/chat/sessions", headers=_hdr(tok)).json()
    client.post(
        f"/api/ai/chat/sessions/{s2['id']}/messages",
        headers=_hdr(tok),
        json={"content": "申论怎么开头"},
    )
    lst2 = client.get("/api/ai/chat/sessions", headers=_hdr(tok)).json()
    assert len(lst2) == 2

    # 删除第一个会话 → 列表剩 1，消息 404
    d = client.delete(f"/api/ai/chat/sessions/{sid}", headers=_hdr(tok))
    assert d.status_code == 204
    assert len(client.get("/api/ai/chat/sessions", headers=_hdr(tok)).json()) == 1
    assert client.get(f"/api/ai/chat/sessions/{sid}/messages", headers=_hdr(tok)).status_code == 404


def test_chat_session_access_control(client, monkeypatch):
    """会话隔离：A 的会话 B 不可访问（404）。"""
    tok_a = _register(client, "acl_a@e.com", "secret1")
    tok_b = _register(client, "acl_b@e.com", "secret1")

    class _Resp:
        content = "x"
        model = "m"
        token_usage = 0

    monkeypatch.setattr("app.ai.llm_gateway.LLMGateway.complete", lambda self, *a, **k: _Resp())
    sid = client.post("/api/ai/chat/sessions", headers=_hdr(tok_a)).json()["id"]
    assert client.get(f"/api/ai/chat/sessions/{sid}/messages", headers=_hdr(tok_b)).status_code == 404
    assert client.delete(f"/api/ai/chat/sessions/{sid}", headers=_hdr(tok_b)).status_code == 404


def test_billing_plans_catalog(client):
    """会员套餐目录：返回 free/pro/pro_year 三档 + 退费规则。"""
    tok = _register(client, "pl@e.com", "secret1")
    r = client.get("/api/billing/plans", headers=_hdr(tok))
    assert r.status_code == 200
    body = r.json()
    ids = {p["id"] for p in body["plans"]}
    assert ids == {"free", "pro", "pro_year"}
    assert body["plans"][1]["price"] == 9900  # pro ¥99
    assert body["plans"][2]["price"] == 99000  # pro_year ¥990
    assert body["refund_policy"]


def test_patch_profile_fields(client):
    """PATCH /auth/me 更新学员画像（目标考试/省份/昵称），并反映到 /me。"""
    tok = _register(client, "profile@e.com", "secret1")
    r = client.patch(
        "/api/auth/me",
        json={"target_exam": "事业单位", "province": "广东", "nickname": "小明"},
        headers=_hdr(tok),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["target_exam"] == "事业单位"
    assert body["province"] == "广东"
    assert body["nickname"] == "小明"
    me = client.get("/api/auth/me", headers=_hdr(tok)).json()
    assert me["target_exam"] == "事业单位"


def test_membership_order_sets_expiry(client):
    """开通 pro 会员：/billing/me 返回 plan=pro 且 plan_expires_at 非空；免费版为 None。"""
    tok = _register(client, "mbr@e.com", "secret1")
    before = client.get("/api/billing/me", headers=_hdr(tok)).json()
    assert before["plan"] == "free"
    assert before["plan_expires_at"] is None

    o = client.post("/api/billing/orders", json={"plan": "pro"}, headers=_hdr(tok))
    assert o.status_code == 201 and o.json()["status"] == "pending"
    # 模拟支付后开通
    pay = client.post(f"/api/billing/pay/sandbox/{o.json()['id']}", headers=_hdr(tok))
    assert pay.status_code == 200 and pay.json()["status"] == "paid"
    after = client.get("/api/billing/me", headers=_hdr(tok)).json()
    assert after["plan"] == "pro"
    assert after["plan_expires_at"] is not None


def test_membership_expiry_downgrade(client):
    """会员过期：plan_expires_at 早于当前时间时，请求期即时降级为 free（不再享受无限 AI）。"""
    from datetime import datetime, timezone

    tok = _register(client, "exp@e.com", "secret1")
    client.post("/api/billing/orders", json={"plan": "pro"}, headers=_hdr(tok))
    # 直接把到期时间改成过去
    from app.db.session import SessionLocal
    from app.models import User

    db = SessionLocal()
    try:
        u = db.query(User).filter(User.email == "exp@e.com").first()
        u.plan_expires_at = datetime(2020, 1, 1, tzinfo=timezone.utc)
        db.commit()
    finally:
        db.close()
    # 触发 get_current_user 降级
    qo = client.get("/api/ai/quota", headers=_hdr(tok)).json()
    assert qo["is_pro"] is False
    me = client.get("/api/auth/me", headers=_hdr(tok)).json()
    assert me["plan"] == "free"


def test_free_quota_explain_enforced(client, monkeypatch):
    """免费版按日配额限流：超出后 /ai/explain 返回 402，/ai/quota 反映剩余为 0。"""
    # 缩小配额便于测试
    monkeypatch.setattr(ai_routes, "_FREE_QUOTA", 2)
    tok = _register(client, "quota@e.com", "secret1")
    q = client.get("/api/bank/questions?limit=1", headers=_hdr(tok)).json()[0]

    class _Resp:
        content = "讲解内容"
        model = "mock"
        citations = []

    monkeypatch.setattr("app.ai.tutor_agent.TutorAgent.explain_question", lambda self, *a, **k: {
        "knowledge_point": "kp", "explanation": "e", "citations": []
    })

    for _ in range(2):
        r = client.post("/api/ai/explain", json={"question_id": q["id"]}, headers=_hdr(tok))
        assert r.status_code == 200
    over = client.post("/api/ai/explain", json={"question_id": q["id"]}, headers=_hdr(tok))
    assert over.status_code == 402

    qo = client.get("/api/ai/quota", headers=_hdr(tok)).json()
    assert qo["is_pro"] is False
    assert qo["limit"] == 2
    assert qo["remaining"] == 0


def test_pro_unlimited_explain(client, monkeypatch):
    """pro 会员不受免费配额限制：连续多次讲解均成功。"""
    tok = _register(client, "proquota@e.com", "secret1")
    o = client.post("/api/billing/orders", json={"plan": "pro"}, headers=_hdr(tok))
    assert o.status_code == 201 and o.json()["status"] == "pending"
    pay = client.post(f"/api/billing/pay/sandbox/{o.json()['id']}", headers=_hdr(tok))
    assert pay.status_code == 200
    q = client.get("/api/bank/questions?limit=1", headers=_hdr(tok)).json()[0]
    monkeypatch.setattr("app.ai.tutor_agent.TutorAgent.explain_question", lambda self, *a, **k: {
        "knowledge_point": "kp", "explanation": "e", "citations": []
    })
    for _ in range(3):
        r = client.post("/api/ai/explain", json={"question_id": q["id"]}, headers=_hdr(tok))
        assert r.status_code == 200
    qo = client.get("/api/ai/quota", headers=_hdr(tok)).json()
    assert qo["is_pro"] is True and qo["remaining"] == -1


def _security_middleware():
    """从已构建的 ASGI 中间件栈中定位 SecurityMiddleware 实例（供限流测试隔离状态）。"""
    node = getattr(main_mod.app, "middleware_stack", None)
    while node is not None:
        if isinstance(node, SecurityMiddleware):
            return node
        node = getattr(node, "app", None)
    return None


def test_adaptive_recommend(client):
    """自适应推送：/ai/recommend 返回去重候选题（薄弱点或已校验题兜底），结构正确。"""
    tok = _register(client, "rec@e.com", "secret1")
    r = client.get("/api/ai/recommend", headers=_hdr(tok))
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body["knowledge_points"], list)
    assert isinstance(body["questions"], list)
    assert len(body["questions"]) >= 1
    ids = [q["id"] for q in body["questions"]]
    assert len(ids) == len(set(ids))  # 去重


def test_exam_history_persisted(client):
    """在线模考：提交后 /exam/history 持久化记录，详情含逐题快照与正确答案。"""
    tok = _register(client, "exhist@e.com", "secret1")
    paper = client.post("/api/exam/start", json={"count": 5}, headers=_hdr(tok)).json()["paper"]
    # 全部答 A（仅作提交，不校验对错）
    ans = [{"question_id": q["id"], "selected": "A"} for q in paper]
    sub = client.post("/api/exam/submit", json={"answers": ans}, headers=_hdr(tok))
    assert sub.status_code == 200
    rid = sub.json()["id"]
    assert isinstance(rid, int)

    hist = client.get("/api/exam/history", headers=_hdr(tok)).json()
    rec_ids = [h["id"] for h in hist]
    assert rid in rec_ids
    rec0 = next(h for h in hist if h["id"] == rid)
    assert rec0["total"] == 5

    det = client.get(f"/api/exam/history/{rid}", headers=_hdr(tok)).json()
    assert det["total"] == 5
    assert len(det["details"]) == 5
    assert "correct_answer" in det["details"][0]
    assert "stem" in det["details"][0]

    # 跨用户隔离：他人历史为空
    tok2 = _register(client, "exhist2@e.com", "secret1")
    assert client.get("/api/exam/history", headers=_hdr(tok2)).json() == []


def test_content_submit_enters_queue(client):
    """内容报送闭环：登录用户报送内容 → 进入待复核队列（pending，需审核员查看）。"""
    tok = _register(client, "submitter@e.com", "secret1")
    tok_r = _make_reviewer(client, "submit_rev@e.com", "secret1")
    body = "【AI 生成解析】类比推理：钢笔∶墨水为配套使用关系，故选 B。"
    r = client.post(
        "/api/content/review/submit",
        json={"item_type": "question", "body": body},
        headers=_hdr(tok),
    )
    assert r.status_code == 201
    assert r.json()["status"] == "pending"
    assert r.json()["body"] == body

    pending = client.get("/api/content/review/pending", headers=_hdr(tok_r)).json()
    ids = [p["id"] for p in pending]
    assert r.json()["id"] in ids


def test_change_password_flow(client):
    """修改密码：旧密码校验后生效，新密码可登录，旧密码失效。"""
    tok = _register(client, "cp@e.com", "secret1")
    # 新密码过短应被拒
    short = client.post(
        "/api/auth/change-password",
        json={"old_password": "secret1", "new_password": "123"},
        headers=_hdr(tok),
    )
    assert short.status_code == 400
    # 原密码错误应被拒
    wrong = client.post(
        "/api/auth/change-password",
        json={"old_password": "badpwd", "new_password": "newpass1"},
        headers=_hdr(tok),
    )
    assert wrong.status_code == 400
    # 正确修改
    ok = client.post(
        "/api/auth/change-password",
        json={"old_password": "secret1", "new_password": "newpass1"},
        headers=_hdr(tok),
    )
    assert ok.status_code == 200 and ok.json()["ok"] is True
    # 新密码可登录
    login_new = client.post("/api/auth/login", json={"email": "cp@e.com", "password": "newpass1"})
    assert login_new.status_code == 200 and "access_token" in login_new.json()
    # 旧密码失效
    login_old = client.post("/api/auth/login", json={"email": "cp@e.com", "password": "secret1"})
    assert login_old.status_code == 401


def test_profile_update(client):
    """学员画像编辑：PATCH /auth/me 更新 target_exam，并在 /auth/me 反映。"""
    tok = _register(client, "pu@e.com", "secret1", )
    upd = client.patch(
        "/api/auth/me",
        headers=_hdr(tok),
        json={"nickname": "小张", "province": "广东", "target_exam": "事业单位"},
    )
    assert upd.status_code == 200
    assert upd.json()["target_exam"] == "事业单位"
    assert upd.json()["nickname"] == "小张"
    me = client.get("/api/auth/me", headers=_hdr(tok)).json()
    assert me["target_exam"] == "事业单位"
    assert me["province"] == "广东"

    # 部分更新：仅改 nickname，其余保留
    upd2 = client.patch("/api/auth/me", headers=_hdr(tok), json={"nickname": "小张同学"})
    assert upd2.status_code == 200
    assert upd2.json()["nickname"] == "小张同学"
    assert upd2.json()["target_exam"] == "事业单位"  # 保持不变


def test_essay_prompts_loaded(client):
    """申论题库：启动已注入原创申论题，/ai/essay-prompts 需登录，返回可用题目（材料+要求）。"""
    # 未登录 -> 401
    assert client.get("/api/ai/essay-prompts").status_code == 401
    tok = _register(client, "essp@e.com", "secret1")
    r = client.get("/api/ai/essay-prompts", headers=_hdr(tok))
    assert r.status_code == 200
    prompts = r.json()
    assert len(prompts) >= 1
    assert all("material" in p and "requirement" in p for p in prompts)


def test_essay_grade_persist_and_history(client, monkeypatch):
    """申论批改：mock 评分引擎，保存记录并可在历史中复看（含 prompt 标题）。"""
    tok = _register(client, "eh@e.com", "secret1")

    class Fake:
        total = 82
        dimensions = {"立意": 18, "结构": 16, "论证": 18, "语言": 16, "规范": 14}
        needs_human_review = False
        rationale = "MOCK"

    monkeypatch.setattr(
        ai_routes.EssayGrader, "grade",
        lambda self, text, material="", requirement="", max_score=100: Fake(),
    )

    # 取一个真实申论题作为 prompt_id
    prompts = client.get("/api/ai/essay-prompts", headers=_hdr(tok)).json()
    pid = prompts[0]["id"]

    g = client.post(
        "/api/ai/essay-grade",
        json={"essay_text": "作答正文", "max_score": 100, "prompt_id": pid, "save": True},
        headers=_hdr(tok),
    )
    assert g.status_code == 200
    assert g.json()["total"] == 82
    assert g.json()["record_id"] is not None

    hist = client.get("/api/ai/essay-history", headers=_hdr(tok)).json()
    assert len(hist) >= 1
    assert hist[0]["prompt_title"] == prompts[0]["title"]
    assert hist[0]["total"] == 82


def test_exam_scoring_correct(client):
    """模考判分正确性：全部答对时 correct_rate == 1.0（正确项经 DB 直接取，避免泄露答案）。"""
    tok = _register(client, "esc@e.com", "secret1")
    start = client.post("/api/exam/start", json={"count": 10}, headers=_hdr(tok)).json()
    paper = start["paper"]
    assert len(paper) >= 1

    from app.db.session import SessionLocal
    from app.models import Question

    db = SessionLocal()
    try:
        answers = []
        for q in paper:
            qo = db.get(Question, q["id"])
            correct = next(o.label for o in qo.options if o.is_correct)
            answers.append({"question_id": q["id"], "selected": correct})
    finally:
        db.close()

    rep = client.post("/api/exam/submit", json={"answers": answers}, headers=_hdr(tok)).json()
    assert rep["correct"] == len(paper)
    assert rep["correct_rate"] == 1.0


def test_auth_rate_limit(client, monkeypatch):
    """认证限流：同一 IP 在 10 次/分钟阈值内，第 11 次 POST /api/auth/register 返回 429。"""
    mw = _security_middleware()
    assert mw is not None
    mw._buckets.clear()
    monkeypatch.setattr(_mw_mod, "AUTH_LIMIT", 10)

    codes = []
    for i in range(13):
        r = client.post(
            "/api/auth/register",
            json={"email": f"ratelimit_{i}@e.com", "password": "secret1"},
        )
        codes.append(r.status_code)

    assert codes[:10] == [201] * 10
    assert codes[10] == 429
    assert codes[-1] == 429

    # 清理桶，避免影响后续（即便阈值已还原为极大值也无副作用）
    mw._buckets.clear()


def test_password_reset_flow(client):
    """账号找回：申请令牌（dev 直接返回）-> 令牌重置密码 -> 新密码可登录、旧密码失效、令牌单次使用。"""
    email = "reset@e.com"
    _register(client, email, "oldpass1")

    # 邮箱不存在也应返回 200，避免账号枚举
    none = client.post("/api/auth/forgot-password", json={"email": "nobody@e.com"})
    assert none.status_code == 200

    # 申请重置令牌（未配置 SMTP 时 dev 模式直接返回 dev_token）
    r = client.post("/api/auth/forgot-password", json={"email": email})
    assert r.status_code == 200
    tok = r.json()["dev_token"]
    assert tok

    # 用令牌重置密码
    ok = client.post("/api/auth/reset-password", json={"token": tok, "new_password": "newpass2"})
    assert ok.status_code == 200 and ok.json()["ok"] is True

    # 同令牌不可重复使用
    dup = client.post("/api/auth/reset-password", json={"token": tok, "new_password": "another3"})
    assert dup.status_code == 400

    # 新密码可登录
    login = client.post("/api/auth/login", json={"email": email, "password": "newpass2"})
    assert login.status_code == 200

    # 旧密码失效
    old = client.post("/api/auth/login", json={"email": email, "password": "oldpass1"})
    assert old.status_code == 401

    # 弱密码被拒（schema 校验 min_length=6 -> 422，或令牌已用 -> 400）
    weak = client.post("/api/auth/reset-password", json={"token": tok, "new_password": "123"})
    assert weak.status_code in (400, 422)

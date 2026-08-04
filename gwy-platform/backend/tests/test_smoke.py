"""全链路冒烟测试（固化人工验证路径，加固 WBS 8.1 质量门禁）。

覆盖：健康检查 / 注册登录 / 学情 / 刷题判分 / 在线模考 / 错题本闭环 / 收藏夹 CRUD /
AI 讲解·申论批改（mock LLM）/ 会员退费 / 内容双签校验。AI 调用通过 monkeypatch 隔离，保证离线可跑。
"""
from app.api.routes import ai as ai_routes


def _register(client, email="t1@e.com", password="secret1"):
    r = client.post(
        "/api/auth/register",
        json={"email": email, "password": password, "target_exam": "省考"},
    )
    assert r.status_code == 201, r.text
    return r.json()["access_token"]


def _hdr(token):
    return {"Authorization": f"Bearer {token}"}


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
        lambda self, text, material="", max_score=100: Fake(),
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
    assert o["status"] == "paid" and o["amount"] == 9900
    me = client.get("/api/billing/me", headers=_hdr(tok)).json()
    assert me["plan"] == "pro"
    rf = client.post(
        "/api/billing/refund",
        json={"order_id": o["id"], "reason": "不合适"},
        headers=_hdr(tok),
    ).json()
    assert rf["amount"] > 0 and rf["status"] == "refunded"


def test_content_double_sign(client):
    tok = _register(client, "c@e.com", "secret1")
    sub = client.post(
        "/api/content/review/submit",
        json={"item_type": "question", "item_id": "q:1", "body": "示范题面"},
        headers=_hdr(tok),
    ).json()
    assert sub["status"] == "pending"
    a1 = client.post(
        f"/api/content/review/{sub['id']}/approve", json={"reviewer": "审核员A"}
    ).json()
    assert a1["reviewer_1"] == "审核员A" and a1["status"] == "pending"
    a2 = client.post(
        f"/api/content/review/{sub['id']}/approve", json={"reviewer": "审核员B"}
    ).json()
    assert a2["status"] == "approved" and a2["reviewer_2"] == "审核员B"
    pend = client.get("/api/content/review/pending").json()
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
    tok = _register(client, "rev@e.com", "secret1")

    # 送审
    s = client.post(
        "/api/content/review/submit",
        headers=_hdr(tok),
        json={"item_type": "question", "item_id": "q-demo-1", "body": "AI 解析草稿", "version": 1},
    )
    assert s.status_code == 201, s.text
    rid = s.json()["id"]
    assert s.json()["status"] == "pending"

    # pending 列表含该单
    pend = client.get("/api/content/review/pending").json()
    assert any(x["id"] == rid for x in pend)

    # 甲签
    a1 = client.post(f"/api/content/review/{rid}/approve", json={"reviewer": "审核员·甲"})
    assert a1.status_code == 200 and a1.json()["reviewer_1"] == "审核员·甲"
    assert a1.json()["status"] == "pending"  # 尚缺一签

    # 同人重复签名 -> 400
    dup = client.post(f"/api/content/review/{rid}/approve", json={"reviewer": "审核员·甲"})
    assert dup.status_code == 400

    # 乙签 -> 双签完成
    a2 = client.post(f"/api/content/review/{rid}/approve", json={"reviewer": "审核员·乙"})
    assert a2.status_code == 200
    assert a2.json()["reviewer_2"] == "审核员·乙"
    assert a2.json()["status"] == "approved"

    # 已通过不再出现在 pending
    pend2 = client.get("/api/content/review/pending").json()
    assert not any(x["id"] == rid for x in pend2)

    # 抽检统计：累计与已通过均含该单
    sc = client.get("/api/content/review/spot-check").json()
    assert sc["total"] >= 1 and sc["approved"] >= 1


def test_content_reject_and_correct(client):
    """内容双签：驳回（带意见）/ 更正（版本+1、状态 corrected）。"""
    tok = _register(client, "rev2@e.com", "secret1")

    s = client.post(
        "/api/content/review/submit",
        headers=_hdr(tok),
        json={"item_type": "knowledge", "item_id": "kp-demo-2", "body": "待审知识点", "version": 1},
    )
    rid = s.json()["id"]

    rj = client.post(f"/api/content/review/{rid}/reject", json={"reviewer": "审核员·甲", "note": "表述不准确"})
    assert rj.status_code == 200
    assert rj.json()["status"] == "rejected"
    assert rj.json()["reviewer_note"] == "表述不准确"

    # 重新送审并更正
    s2 = client.post(
        "/api/content/review/submit",
        headers=_hdr(tok),
        json={"item_type": "knowledge", "item_id": "kp-demo-3", "body": "v1 内容", "version": 1},
    )
    rid2 = s2.json()["id"]
    co = client.post(
        f"/api/content/review/{rid2}/correct",
        json={"reviewer": "审核员·乙", "new_body": "v2 修正后内容"},
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

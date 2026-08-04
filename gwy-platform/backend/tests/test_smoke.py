"""全链路冒烟测试（固化人工验证路径，加固 WBS 8.1 质量门禁）。

覆盖：健康检查 / 注册登录 / 学情 / 刷题判分 / 在线模考 / AI 讲解·申论批改（mock LLM）/
会员退费 / 内容双签校验。AI 调用通过 monkeypatch 隔离，保证离线可跑。
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

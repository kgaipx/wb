"""功能增强测试（P3 #105 测试补强）：覆盖模考历史/明细、AI 私教对话持久化、
收藏夹 CRUD、错题本闭环、免费配额、内容双签待审、一致性报告鉴权、发布闸门、学习计划打卡。

复用 session 级 client 固定装置（见 conftest）；助手函数副本避免跨模块导入耦合。
邮箱统一加 feat 前缀，避免与 test_smoke 既有用例撞名（同 session 共享 DB）。
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


def _make_reviewer(client, email="rev@e.com", password="secret1"):
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


def _make_admin(client, email="admin@e.com", password="secret1"):
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
        u.role = "admin"
        db.commit()
    finally:
        db.close()
    return r.json()["access_token"]


def test_feat_exam_history_and_detail(client):
    """模考：提交后写入历史，历史明细含逐题正确答案，支持复盘。"""
    tok = _register(client, "feat_exh@e.com", "secret1")
    start = client.post("/api/exam/start", json={"count": 5}, headers=_hdr(tok)).json()
    paper = start["paper"]
    from app.db.session import SessionLocal
    from app.models import Question as QModel

    db = SessionLocal()
    try:
        answers = []
        for q in paper:
            qo = db.get(QModel, q["id"])
            correct = next(o.label for o in qo.options if o.is_correct)
            answers.append({"question_id": q["id"], "selected": correct})
    finally:
        db.close()
    sub = client.post("/api/exam/submit", json={"answers": answers}, headers=_hdr(tok)).json()
    assert sub["correct"] == len(paper)
    hist = client.get("/api/exam/history", headers=_hdr(tok)).json()
    assert len(hist) >= 1
    rid = hist[0]["id"]
    detail = client.get("/api/exam/history/" + str(rid), headers=_hdr(tok)).json()
    assert detail["id"] == rid and len(detail["details"]) == len(paper)


def test_feat_chat_session_lifecycle(client, monkeypatch):
    """AI 私教对话：建会话 → 发消息（落库助手回复）→ 取历史 → 删除。"""
    tok = _register(client, "feat_chat@e.com", "secret1")
    monkeypatch.setattr(
        "app.ai.tutor_agent.TutorAgent.chat",
        lambda self, history, kp_hint=None, weak_points=None: {
            "answer": "好的同学",
            "citations": [{"title": "资料A", "source": "mock"}],
            "model": "mock",
            "offline": False,
        },
    )
    s = client.post("/api/ai/chat/sessions", headers=_hdr(tok)).json()
    assert s["id"] and s["message_count"] == 0
    sent = client.post(
        "/api/ai/chat/sessions/" + str(s["id"]) + "/messages",
        json={"content": "什么是类比推理"},
        headers=_hdr(tok),
    ).json()
    assert sent["message"]["role"] == "assistant"
    assert "好" in sent["message"]["content"]
    msgs = client.get("/api/ai/chat/sessions/" + str(s["id"]) + "/messages", headers=_hdr(tok)).json()
    assert len(msgs) == 2  # user + assistant
    d = client.delete("/api/ai/chat/sessions/" + str(s["id"]), headers=_hdr(tok))
    assert d.status_code == 204
    after = client.get("/api/ai/chat/sessions/" + str(s["id"]) + "/messages", headers=_hdr(tok))
    assert after.status_code == 404


def test_feat_favorites_crud(client):
    """收藏夹：添加 → 列表含该项 → 移除 → 列表不含。"""
    tok = _register(client, "feat_fav@e.com", "secret1")
    qs = client.get("/api/bank/questions?limit=5").json()
    qid = qs[0]["id"]
    add = client.post("/api/bank/favorites", json={"question_id": qid}, headers=_hdr(tok))
    assert add.status_code == 200
    lst = client.get("/api/bank/favorites", headers=_hdr(tok)).json()
    assert any(q["question"]["id"] == qid for q in lst)
    rem = client.delete("/api/bank/favorites/" + str(qid), headers=_hdr(tok))
    assert rem.status_code == 200
    lst2 = client.get("/api/bank/favorites", headers=_hdr(tok)).json()
    assert all(q["question"]["id"] != qid for q in lst2)


def test_feat_wrong_list_and_review(client):
    """错题本：作答错误进入错题本；标记复盘后可消除。"""
    tok = _register(client, "feat_wrong@e.com", "secret1")
    q0 = client.get("/api/bank/questions?limit=20").json()[0]
    from app.db.session import SessionLocal
    from app.models import Question as QModel

    db = SessionLocal()
    try:
        qo = db.get(QModel, q0["id"])
        wrong_label = next(o.label for o in qo.options if not o.is_correct)
    finally:
        db.close()
    pr = client.post(
        "/api/bank/practice",
        json={"question_id": q0["id"], "selected": wrong_label},
        headers=_hdr(tok),
    ).json()
    assert pr["is_correct"] is False
    wl = client.get("/api/student/wrong", headers=_hdr(tok)).json()
    assert any(w["question"]["id"] == q0["id"] for w in wl)
    rv = client.post("/api/student/wrong/" + str(q0["id"]) + "/review", headers=_hdr(tok))
    assert rv.status_code == 200


def test_feat_ai_quota_free(client):
    """免费版配额：初始化为满额、未使用。"""
    tok = _register(client, "feat_quota@e.com", "secret1")
    q = client.get("/api/ai/quota", headers=_hdr(tok)).json()
    assert q["is_pro"] is False
    assert q["limit"] > 0 and q["remaining"] == q["limit"] and q["used"] == 0


def test_feat_review_pending_and_spotcheck(client):
    """内容双签：用户报送进入待审队列；审核员可拉取待审与抽检统计。"""
    tok_user = _register(client, "feat_ru@e.com", "secret1")
    tok_rev = _make_reviewer(client, "feat_rr@e.com", "secret1")
    sub = client.post(
        "/api/content/review/submit",
        json={"item_type": "question", "item_id": "q:99", "body": "待审内容"},
        headers=_hdr(tok_user),
    ).json()
    assert sub["status"] == "pending"
    pending = client.get("/api/content/review/pending", headers=_hdr(tok_rev)).json()
    assert any(p["id"] == sub["id"] for p in pending)
    stats = client.get("/api/content/review/spot-check", headers=_hdr(tok_rev)).json()
    assert stats["total"] >= 1


def test_feat_consistency_report_admin(client, monkeypatch):
    """人 AI 一致性报告：仅管理员可读，普通用户 403。"""
    tok_user = _register(client, "feat_cu@e.com", "secret1")
    tok_admin = _make_admin(client, "feat_ca@e.com", "secret1")
    monkeypatch.setattr(
        "app.ai.essay_grader.EssayGrader.consistency_report",
        lambda self: {"coefficient": 0.85, "threshold": 0.8, "ok": True, "evaluated": True},
    )
    forbid = client.get("/api/ai/essay/consistency", headers=_hdr(tok_user))
    assert forbid.status_code == 403
    rep = client.get("/api/ai/essay/consistency", headers=_hdr(tok_admin)).json()
    assert rep["ok"] is True and rep["coefficient"] == 0.85


def test_feat_essay_consistency_gate_forces_review(client, monkeypatch):
    """发布闸门：人 AI 一致性不达标时，强制所有 AI 评分转人工复核。"""
    tok = _register(client, "feat_gate@e.com", "secret1")
    monkeypatch.setattr(
        "app.ai.essay_grader.EssayGrader.consistency_report",
        lambda self: {"coefficient": 0.5, "threshold": 0.8, "ok": False, "evaluated": True},
    )

    class _Resp:
        content = '{"立意":18,"结构":16,"论证":17,"语言":15,"素材":14,"rationale":"良好"}'

    monkeypatch.setattr("app.ai.llm_gateway.LLMGateway.complete", lambda self, *a, **k: _Resp())
    r = client.post(
        "/api/ai/essay-grade",
        json={"essay_text": "作答正文", "max_score": 100},
        headers=_hdr(tok),
    ).json()
    assert r["needs_human_review"] is True
    assert r["consistency"]["ok"] is False


def test_feat_plan_generate_and_checkin(client, monkeypatch):
    """学习计划：生成（mock LLM）→ 打卡单任务 → 进度聚合生效。"""
    tok = _register(client, "feat_plan@e.com", "secret1")

    def fake_plan(db, user, days=7, target=None):
        return {
            "days": 3,
            "items": [
                {"day": 1, "focus": "类比推理", "summary": "s", "knowledge_points": ["类比推理"],
                 "tasks": [{"kind": "practice", "title": "t1", "target": "类比推理", "ref_id": None},
                           {"kind": "explain", "title": "t2", "target": "类比推理", "ref_id": None}]},
                {"day": 2, "focus": "逻辑判断", "summary": "s", "knowledge_points": ["逻辑判断"],
                 "tasks": [{"kind": "practice", "title": "t3", "target": "逻辑判断", "ref_id": None}]},
            ],
            "model": "mock", "offline": False, "summary": "mock plan",
        }

    monkeypatch.setattr(ai_routes, "generate_plan", fake_plan)
    g = client.post("/api/ai/plan", json={"days": 3}, headers=_hdr(tok)).json()
    assert g["progress"]["total_tasks"] == 3
    assert g["progress"]["done_tasks"] == 0
    tid = g["items"][0]["tasks"][0]["id"]
    t = client.post("/api/ai/plan/tasks/" + str(tid) + "/toggle", headers=_hdr(tok)).json()
    assert t["task"]["done"] is True
    assert t["progress"]["done_tasks"] == 1
    gp = client.get("/api/ai/plan", headers=_hdr(tok)).json()
    assert gp["progress"]["done_tasks"] == 1


def test_feat_student_stats_recurrence(client):
    """学情看板：错题复错率计算正确。
    - 题A：错→错（复错，recurrence 计 1）
    - 题B：错→对（已攻克，不计入复错）
    - 题C：仅错一次且未复测（分母不计入）
    期望 recurrence_rate = 1/2 = 0.5，wrong_distinct = 3。
    """
    tok = _register(client, "feat_stats@e.com", "secret1")
    qs = client.get("/api/bank/questions?limit=20").json()
    from app.db.session import SessionLocal
    from app.models import Question as QModel

    picks = {}
    db = SessionLocal()
    try:
        for q in qs:
            qo = db.get(QModel, q["id"])
            correct = next(o.label for o in qo.options if o.is_correct)
            wrong = next(o.label for o in qo.options if not o.is_correct)
            picks[q["id"]] = (correct, wrong)
    finally:
        db.close()

    qids = list(picks.keys())[:3]
    qa, qb, qc = qids[0], qids[1], qids[2]
    ca, wa = picks[qa]
    cb, wb = picks[qb]
    cc, wc = picks[qc]

    # 题A：错 → 错
    client.post("/api/bank/practice", json={"question_id": qa, "selected": wa}, headers=_hdr(tok))
    client.post("/api/bank/practice", json={"question_id": qa, "selected": wa}, headers=_hdr(tok))
    # 题B：错 → 对
    client.post("/api/bank/practice", json={"question_id": qb, "selected": wb}, headers=_hdr(tok))
    client.post("/api/bank/practice", json={"question_id": qb, "selected": cb}, headers=_hdr(tok))
    # 题C：仅错一次
    client.post("/api/bank/practice", json={"question_id": qc, "selected": wc}, headers=_hdr(tok))

    stats = client.get("/api/student/stats", headers=_hdr(tok)).json()
    assert stats["wrong_distinct"] == 3
    # retried=2（A、B 各复测一次），recurred=1（仅 A 复错）
    assert stats["recurrence_rate"] == 0.5
    # reviewed_distinct 初始为 0（未标记复盘）
    assert stats["reviewed_distinct"] == 0
    # 客观正确率：仅 题B 第二次对 → 1/5 = 0.2
    assert stats["correct_rate"] == 0.2
    assert len(stats["last_7_days"]) == 7

    # 标记题A复盘，reviewed_distinct 应 +1
    client.post("/api/student/wrong/" + str(qa) + "/review", headers=_hdr(tok))
    stats2 = client.get("/api/student/stats", headers=_hdr(tok)).json()
    assert stats2["reviewed_distinct"] == 1

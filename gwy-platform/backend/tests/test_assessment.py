"""能力测评接口测试（WBS 3.2 自适应诊断）。

- 未登录访问应 401；
- 组卷应隐藏正确答案（options 不含 is_correct）；
- 全对提交 → overall=1、维度非空、逐题明细齐全、落库并可经历史查询；
- 全错提交 → overall 低、弱项非空。
"""
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models import Question


def _register(client: TestClient, email: str, password: str = "secret1") -> str:
    r = client.post(
        "/api/auth/register",
        json={"email": email, "password": password, "target_exam": "省考"},
    )
    assert r.status_code in (200, 201), r.text
    return r.json()["access_token"]


def _hdr(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}"}


def _correct_label(qid: int) -> str:
    db: Session = SessionLocal()
    try:
        q = db.get(Question, qid)
        return "".join(o.label for o in q.options if o.is_correct)
    finally:
        db.close()


def test_assessment_requires_auth(client: TestClient):
    r = client.get("/api/assessment/paper")
    assert r.status_code in (401, 403)


def test_assessment_paper_hides_answer(client: TestClient):
    tok = _register(client, "as1@e.com")
    r = client.get("/api/assessment/paper", headers=_hdr(tok))
    assert r.status_code == 200, r.text
    paper = r.json()
    assert len(paper) >= 1
    for item in paper:
        assert item["stem"]
        assert item["knowledge_point"]
        # 选项不得泄漏正确答案
        for o in item["options"]:
            assert "is_correct" not in o
            assert "id" in o and "label" in o and "content" in o


def test_assessment_submit_all_correct(client: TestClient):
    tok = _register(client, "as2@e.com")
    paper = client.get("/api/assessment/paper", headers=_hdr(tok)).json()
    answers = [
        {"question_id": it["id"], "selected": _correct_label(it["id"])} for it in paper
    ]
    r = client.post("/api/assessment/submit", headers=_hdr(tok), json={"answers": answers})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["overall"] == 1.0
    assert d["correct"] == d["total"] == len(paper)
    assert len(d["dimensions"]) >= 1
    assert len(d["details"]) == len(paper)

    rid = d["id"]
    h = client.get("/api/assessment/history", headers=_hdr(tok)).json()
    assert any(x["id"] == rid for x in h)
    det = client.get(f"/api/assessment/history/{rid}", headers=_hdr(tok)).json()
    assert det["id"] == rid
    assert det["overall"] == 1.0
    assert len(det["dimensions"]) >= 1


def test_assessment_submit_partial_wrong(client: TestClient):
    tok = _register(client, "as3@e.com")
    paper = client.get("/api/assessment/paper", headers=_hdr(tok)).json()
    answers = []
    for it in paper:
        correct = _correct_label(it["id"])
        wrong = next((o["label"] for o in it["options"] if o["label"] != correct), "")
        answers.append({"question_id": it["id"], "selected": wrong})
    r = client.post("/api/assessment/submit", headers=_hdr(tok), json={"answers": answers})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["overall"] <= 0.2
    assert d["weak_points"]  # 应有薄弱点诊断

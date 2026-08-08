"""运营后台聚合接口测试（仅 admin 可访问 + 聚合字段形状）。

- 普通用户访问 /admin/overview 应 403；
- admin 访问应 200，且返回聚合字段；
- 写入若干数据后，聚合计数应如实反映。
"""
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models import Question, QuestionOption, User


def _register(client: TestClient, email: str, password: str = "secret1") -> str:
    r = client.post(
        "/api/auth/register",
        json={"email": email, "password": password, "target_exam": "省考"},
    )
    assert r.status_code in (200, 201), r.text
    return r.json()["access_token"]


def _promote(email: str, role: str = "admin") -> None:
    db = SessionLocal()
    try:
        u = db.query(User).filter_by(email=email).first()
        u.role = role
        db.commit()
    finally:
        db.close()


def _hdr(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}"}


def test_admin_overview_forbids_non_admin(client: TestClient):
    tok = _register(client, "adm_plain@e.com")
    r = client.get("/api/admin/overview", headers=_hdr(tok))
    assert r.status_code == 403


def test_admin_overview_requires_auth(client: TestClient):
    r = client.get("/api/admin/overview")
    assert r.status_code in (401, 403)


def test_admin_overview_returns_aggregates(client: TestClient):
    db: Session = SessionLocal()
    try:
        tok = _register(client, "adm_admin@e.com")
        _promote("adm_admin@e.com", "admin")

        # 写一条已核实题，使聚合非空
        q = Question(
            subject="行测",
            category="判断推理",
            qtype="single",
            stem="运营后台测试题：下列说法正确吗？",
            answer="A",
            knowledge_point="运营测试",
            source="测试",
            copyright_owner="测试",
            is_verified=True,
        )
        db.add(q)
        db.flush()
        db.add(
            QuestionOption(question_id=q.id, label="A", content="正确", is_correct=True)
        )
        db.add(
            QuestionOption(question_id=q.id, label="B", content="错误", is_correct=False)
        )
        db.commit()

        r = client.get("/api/admin/overview", headers=_hdr(tok))
        assert r.status_code == 200, r.text
        d = r.json()
        # 形状校验
        for k in (
            "users_total",
            "users_new_7d",
            "users_by_plan",
            "pro_users",
            "paid_orders",
            "revenue_yuan",
            "questions_total",
            "questions_verified",
            "questions_pending",
            "question_subjects",
            "pending_reviews",
            "answers_total",
            "avg_correct_rate",
            "essays_graded",
            "mock_exams",
            "recent_users",
        ):
            assert k in d, f"缺少字段 {k}"

        # 聚合应如实反映：至少 1 题，且 1 题已核实
        assert d["questions_total"] >= 1
        assert d["questions_verified"] >= 1
        assert d["questions_pending"] == d["questions_total"] - d["questions_verified"]
        assert isinstance(d["recent_users"], list)
        assert d["recent_users"][0]["email"] == "adm_admin@e.com"
    finally:
        db.close()

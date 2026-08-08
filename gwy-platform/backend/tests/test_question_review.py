"""题库审核双签测试（信任保障闭环：双签通过翻转 is_verified）。

直接落地：导入的 is_verified=False 题进入待核实队列，两名不同审核员
甲签→乙签后 Question.is_verified 翻 True；同人重复签报错；驳回保持未核实。
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


def _promote(email: str, role: str = "reviewer") -> None:
    db = SessionLocal()
    try:
        u = db.query(User).filter_by(email=email).first()
        u.role = role
        db.commit()
    finally:
        db.close()


def _hdr(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}"}


def _make_question(db: Session, is_verified: bool = False) -> int:
    q = Question(
        subject="行测",
        category="数量关系",
        qtype="single",
        stem="题库审核测试题：1+1=？",
        answer="B",
        knowledge_point="基础运算",
        source="测试来源",
        copyright_owner="测试",
        is_verified=is_verified,
    )
    db.add(q)
    db.flush()
    for label, content, correct in [
        ("A", "1", False),
        ("B", "2", True),
        ("C", "3", False),
        ("D", "4", False),
    ]:
        db.add(
            QuestionOption(
                question_id=q.id, label=label, content=content, is_correct=correct
            )
        )
    db.commit()
    return q.id


def _is_verified(qid: int) -> bool:
    s = SessionLocal()
    try:
        return bool(s.get(Question, qid).is_verified)
    finally:
        s.close()


def test_question_review_double_sign_flips_verified(client: TestClient):
    db = SessionLocal()
    try:
        tok1 = _register(client, "qr_rev_a@e.com")
        _promote("qr_rev_a@e.com")
        tok2 = _register(client, "qr_rev_b@e.com")
        _promote("qr_rev_b@e.com")
        qid = _make_question(db, is_verified=False)

        # 待核实队列应包含该未核实题
        p = client.get(
            "/api/content/review/questions/pending?limit=500", headers=_hdr(tok1)
        )
        assert p.status_code == 200
        assert qid in [x["question_id"] for x in p.json()]

        # 第一签（reviewer2）→ 仍 pending，题目未核实
        r2 = client.post(
            f"/api/content/review/questions/{qid}/sign", headers=_hdr(tok2)
        )
        assert r2.status_code == 200
        assert r2.json()["review_status"] == "pending"
        assert _is_verified(qid) is False

        # 第二签（reviewer1，不同人）→ approved，题目转正
        r1 = client.post(
            f"/api/content/review/questions/{qid}/sign", headers=_hdr(tok1)
        )
        assert r1.status_code == 200
        assert r1.json()["review_status"] == "approved"
        assert _is_verified(qid) is True

        # 已完成双签，再签为幂等（返回 approved，不再改动）
        r3 = client.post(
            f"/api/content/review/questions/{qid}/sign", headers=_hdr(tok1)
        )
        assert r3.status_code == 200
        assert r3.json()["review_status"] == "approved"
        assert _is_verified(qid) is True

        # 转正后离开待核实队列
        p2 = client.get(
            "/api/content/review/questions/pending?limit=500", headers=_hdr(tok1)
        )
        assert qid not in [x["question_id"] for x in p2.json()]
    finally:
        db.close()


def test_question_review_same_reviewer_rejected(client: TestClient):
    db = SessionLocal()
    try:
        tok = _register(client, "qr_rev_c@e.com")
        _promote("qr_rev_c@e.com")
        qid = _make_question(db, is_verified=False)
        # 同一人签两次：第二次应 400
        r = client.post(
            f"/api/content/review/questions/{qid}/sign", headers=_hdr(tok)
        )
        assert r.status_code == 200
        r2 = client.post(
            f"/api/content/review/questions/{qid}/sign", headers=_hdr(tok)
        )
        assert r2.status_code == 400
        assert _is_verified(qid) is False
    finally:
        db.close()


def test_question_review_reject_keeps_unverified(client: TestClient):
    db = SessionLocal()
    try:
        tok = _register(client, "qr_rev_d@e.com")
        _promote("qr_rev_d@e.com")
        qid = _make_question(db, is_verified=False)
        r = client.post(
            f"/api/content/review/questions/{qid}/reject",
            json={"note": "题目存疑，退回修正"},
            headers=_hdr(tok),
        )
        assert r.status_code == 200
        assert r.json()["review_status"] == "rejected"
        assert _is_verified(qid) is False
    finally:
        db.close()

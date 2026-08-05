"""站内通知接口测试（Notification Center）。

- 未登录访问应 401；
- 提交测评后生成 assessment_done 通知（link 指向历史），unread_count>=1；
- 会员沙箱开通后生成 membership_activated 通知；
- 标记单条已读 / 全部已读 正确更新未读计数；
- 用户不可读取或标记他人通知（归属校验 404）；
- 会员到期降级恰好生成 1 条 membership_expired（幂等）。
"""
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models import Notification, Question, User


def _register(client: TestClient, email: str, password: str = "secret1") -> tuple[str, int]:
    r = client.post(
        "/api/auth/register",
        json={"email": email, "password": password, "target_exam": "省考"},
    )
    assert r.status_code in (200, 201), r.text
    tok = r.json()["access_token"]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {tok}"}).json()
    return tok, me["id"]


def _hdr(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}"}


def _correct_label(qid: int) -> str:
    db: Session = SessionLocal()
    try:
        q = db.get(Question, qid)
        return "".join(o.label for o in q.options if o.is_correct)
    finally:
        db.close()


def _count_expired(user_id: int) -> int:
    db: Session = SessionLocal()
    try:
        return (
            db.query(Notification)
            .filter(Notification.user_id == user_id, Notification.type == "membership_expired")
            .count()
        )
    finally:
        db.close()


def test_notifications_requires_auth(client: TestClient):
    r = client.get("/api/notifications")
    assert r.status_code in (401, 403)


def test_assessment_creates_notification(client: TestClient):
    tok, _ = _register(client, "nf1@e.com")
    paper = client.get("/api/assessment/paper", headers=_hdr(tok)).json()
    answers = [
        {"question_id": it["id"], "selected": _correct_label(it["id"])} for it in paper
    ]
    sub = client.post("/api/assessment/submit", headers=_hdr(tok), json={"answers": answers}).json()
    rid = sub["id"]

    r = client.get("/api/notifications", headers=_hdr(tok))
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["unread_count"] >= 1
    done = [n for n in d["items"] if n["type"] == "assessment_done"]
    assert done, "应生成测评完成通知"
    assert done[0]["link"] == f"/assessment/history/{rid}"
    assert done[0]["is_read"] is False


def test_membership_activation_creates_notification(client: TestClient):
    tok, _ = _register(client, "nf2@e.com")
    order = client.post("/api/billing/orders", headers=_hdr(tok), json={"plan": "pro"}).json()
    pay = client.post(f"/api/billing/pay/sandbox/{order['id']}", headers=_hdr(tok))
    assert pay.status_code == 200, pay.text

    r = client.get("/api/notifications", headers=_hdr(tok)).json()
    activated = [n for n in r["items"] if n["type"] == "membership_activated"]
    assert activated, "应生成会员开通通知"


def test_mark_read_and_read_all(client: TestClient):
    tok, _ = _register(client, "nf3@e.com")
    paper = client.get("/api/assessment/paper", headers=_hdr(tok)).json()
    answers = [
        {"question_id": it["id"], "selected": _correct_label(it["id"])} for it in paper
    ]
    client.post("/api/assessment/submit", headers=_hdr(tok), json={"answers": answers})

    before = client.get("/api/notifications", headers=_hdr(tok)).json()
    assert before["unread_count"] >= 1
    nid = before["items"][0]["id"]

    # 单条已读
    mr = client.post(f"/api/notifications/{nid}/read", headers=_hdr(tok))
    assert mr.status_code == 200, mr.text
    assert mr.json()["is_read"] is True
    after_one = client.get("/api/notifications", headers=_hdr(tok)).json()
    assert after_one["unread_count"] == before["unread_count"] - 1

    # 全部已读
    ra = client.post("/api/notifications/read-all", headers=_hdr(tok))
    assert ra.status_code == 200, ra.text
    assert ra.json()["unread_count"] == 0


def test_cannot_read_others_notification(client: TestClient):
    tok_a, _ = _register(client, "nf4a@e.com")
    paper = client.get("/api/assessment/paper", headers=_hdr(tok_a)).json()
    answers = [
        {"question_id": it["id"], "selected": _correct_label(it["id"])} for it in paper
    ]
    client.post("/api/assessment/submit", headers=_hdr(tok_a), json={"answers": answers})
    nid = client.get("/api/notifications", headers=_hdr(tok_a)).json()["items"][0]["id"]

    tok_b, _ = _register(client, "nf4b@e.com")
    # B 标记 A 的通知 → 404
    r = client.post(f"/api/notifications/{nid}/read", headers=_hdr(tok_b))
    assert r.status_code == 404
    # B 的列表不含 A 的通知
    b_list = client.get("/api/notifications", headers=_hdr(tok_b)).json()
    assert all(n["id"] != nid for n in b_list["items"])


def test_membership_expiry_notification_idempotent(client: TestClient):
    tok, uid = _register(client, "nf5@e.com")
    # 直接将该用户置为已过期 pro
    db: Session = SessionLocal()
    try:
        u = db.get(User, uid)
        u.plan = "pro"
        u.plan_expires_at = datetime.now(timezone.utc) - timedelta(days=1)
        db.commit()
    finally:
        db.close()

    # 触发 get_current_user → 降级并生成到期通知
    client.get("/api/notifications", headers=_hdr(tok))
    assert _count_expired(uid) == 1

    # 再次触发不应重复生成（已降级为 free）
    client.get("/api/notifications", headers=_hdr(tok))
    assert _count_expired(uid) == 1

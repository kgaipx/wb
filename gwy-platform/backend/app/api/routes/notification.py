"""站内通知路由（Notification Center）。

GET  /notifications        ：当前用户通知列表（倒序）+ 未读总数
POST /notifications/{id}/read：标记单条已读（校验归属当前用户，否则 404）
POST /notifications/read-all ：当前用户全部标记已读
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.routes.auth import get_current_user
from app.db.session import get_db
from app.models import Notification, User
from app.schemas.notification import NotificationList, NotificationOut

router = APIRouter()


def _to_out(n: Notification) -> NotificationOut:
    return NotificationOut(
        id=n.id,
        type=n.type,
        title=n.title,
        body=n.body,
        link=n.link,
        is_read=n.is_read,
        created_at=n.created_at.isoformat() if n.created_at else "",
    )


@router.get("", response_model=NotificationList)
def list_notifications(
    limit: int = 30,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items = (
        db.query(Notification)
        .filter(Notification.user_id == current.id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
        .all()
    )
    unread = (
        db.query(Notification)
        .filter(Notification.user_id == current.id, Notification.is_read == False)  # noqa: E712
        .count()
    )
    return NotificationList(
        items=[_to_out(n) for n in items],
        unread_count=unread,
    )


@router.post("/{notif_id}/read", response_model=NotificationOut)
def mark_read(
    notif_id: int,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    n = db.get(Notification, notif_id)
    if n is None or n.user_id != current.id:
        raise HTTPException(status_code=404, detail="通知不存在")
    n.is_read = True
    db.commit()
    return _to_out(n)


@router.post("/read-all", response_model=NotificationList)
def mark_all_read(
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.query(Notification).filter(
        Notification.user_id == current.id, Notification.is_read == False  # noqa: E712
    ).update({Notification.is_read: True})
    db.commit()
    return list_notifications(limit=30, current=current, db=db)

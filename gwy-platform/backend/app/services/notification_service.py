"""通知服务：集中生成通知（仅 db.add，不提交，由调用方统一事务提交）。

文案常量集中此处，便于后续扩展更多通知类型。
"""
from sqlalchemy.orm import Session

from app.models.notification import Notification

NOTIF_MEMBERSHIP_ACTIVATED = "membership_activated"
NOTIF_MEMBERSHIP_EXPIRED = "membership_expired"
NOTIF_ASSESSMENT_DONE = "assessment_done"
NOTIF_SYSTEM = "system"


def create_notification(
    db: Session,
    user_id: int,
    notif_type: str,
    title: str,
    body: str,
    link: str | None = None,
) -> Notification:
    """创建一条通知并加入会话（不 commit）。返回值供调用方在统一提交后使用。"""
    n = Notification(
        user_id=user_id,
        type=notif_type,
        title=title,
        body=body,
        link=link,
    )
    db.add(n)
    return n

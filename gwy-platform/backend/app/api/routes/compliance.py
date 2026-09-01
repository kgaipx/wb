"""合规路由（个保法 PIPL 第 45/47 条）：用户数据导出 + 账号注销。

- 导出：GET /compliance/export 返回本人全部个人信息 JSON（档案/订单/答题/聊天/收藏/
  测评/通知/批改/模考/学习计划），Content-Disposition 附件下载。
- 注销：POST /compliance/deactivate 需密码确认。账号匿名化（邮箱/昵称替换、密码失效、
  is_active=False 即时封禁全部受保护接口），删除答题/聊天/收藏/测评/通知/批改/模考/
  学习计划等个人数据；订单与退费记录依《税收征管法》《会计档案管理办法》法定留存
  （附着于匿名化后的账号 id，不再关联任何可识别自然人信息）。
"""
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.routes.auth import get_current_user
from app.core.ratelimit import rate_limit
from app.core.security import verify_password
from app.db.session import get_db
from app.models import (
    AssessmentRecord,
    AbilityProfile,
    ChatMessage,
    ChatSession,
    EssayGradeRecord,
    ExamRecord,
    Favorite,
    Notification,
    Order,
    PasswordResetToken,
    PlanTask,
    RefundRequest,
    StudyPlan,
    User,
    UserAnswer,
)

router = APIRouter()


def _iso(v):
    if isinstance(v, datetime):
        return v.isoformat()
    return v


def _rows(db: Session, model, user_id: int) -> list[dict]:
    """通用行序列化：ORM 对象 → 干净 dict（datetime → ISO 字符串）。"""
    q = db.query(model).filter(model.user_id == user_id).all()
    out = []
    for r in q:
        d = {}
        for k, v in r.__dict__.items():
            if k.startswith("_"):
                continue
            d[k] = _iso(v)
        out.append(d)
    return out


@router.get("/export", response_class=Response)
def export_my_data(current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """导出本人全部个人信息（PIPL 第 45 条：查阅、复制权）。"""
    uid = current.id
    profile = {
        "id": uid,
        "email": current.email,
        "phone": current.phone,
        "nickname": current.nickname,
        "role": current.role,
        "province": current.province,
        "target_exam": current.target_exam,
        "target_exam_date": current.target_exam_date,
        "target_exam_name": current.target_exam_name,
        "plan": current.plan,
        "plan_expires_at": _iso(current.plan_expires_at),
        "created_at": _iso(current.created_at),
    }

    # 聊天（消息经 session 关联，非 user_id 直挂）
    sessions = db.query(ChatSession).filter(ChatSession.user_id == uid).order_by(ChatSession.id).all()
    chats = []
    for s in sessions:
        msgs = (
            db.query(ChatMessage)
            .filter(ChatMessage.session_id == s.id)
            .order_by(ChatMessage.id)
            .all()
        )
        chats.append(
            {
                "session_id": s.id,
                "title": s.title,
                "created_at": _iso(s.created_at),
                "messages": [
                    {
                        "role": m.role,
                        "content": m.content,
                        "citations": m.citations,
                        "created_at": _iso(m.created_at),
                    }
                    for m in msgs
                ],
            }
        )

    data = {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "notice": "本文件由公考平台按您的请求导出，包含平台存储的您的全部个人信息。",
        "profile": profile,
        "orders": _rows(db, Order, uid),
        "refund_requests": _rows(db, RefundRequest, uid),
        "answers": _rows(db, UserAnswer, uid),
        "ability_profiles": _rows(db, AbilityProfile, uid),
        "favorites": _rows(db, Favorite, uid),
        "assessments": _rows(db, AssessmentRecord, uid),
        "notifications": _rows(db, Notification, uid),
        "essay_grades": _rows(db, EssayGradeRecord, uid),
        "exam_records": _rows(db, ExamRecord, uid),
        "study_plans": _rows(db, StudyPlan, uid),
        "chats": chats,
    }

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    body = json.dumps(data, ensure_ascii=False, indent=2, default=str)
    return Response(
        content=body,
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="gwy_export_{uid}_{stamp}.json"'
        },
    )


class DeactivateIn(BaseModel):
    password: str  # 二次确认：注销为不可逆操作，需本人密码验证


@router.post("/deactivate")
def deactivate_account(
    payload: DeactivateIn,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _rl: str = Depends(rate_limit(5, 300, "deactivate")),  # 防暴力试密码
):
    """注销账号（PIPL 第 47 条：删除权）。

    匿名化账号本体（保留 id 供订单财务记录法定留存关联，但不再可识别自然人），
    删除全部学习/行为/聊天等个人数据，即时封禁登录与全部受保护接口。
    """
    if not verify_password(payload.password, current.hashed_password):
        raise HTTPException(status_code=400, detail="密码错误，无法注销")

    uid = current.id

    # 1) 删除个人学习/行为数据（显式删，避免依赖 SQLite FK PRAGMA 开关）
    db.query(UserAnswer).filter(UserAnswer.user_id == uid).delete(synchronize_session=False)
    db.query(AbilityProfile).filter(AbilityProfile.user_id == uid).delete(synchronize_session=False)
    db.query(Favorite).filter(Favorite.user_id == uid).delete(synchronize_session=False)
    db.query(AssessmentRecord).filter(AssessmentRecord.user_id == uid).delete(synchronize_session=False)
    db.query(Notification).filter(Notification.user_id == uid).delete(synchronize_session=False)
    db.query(EssayGradeRecord).filter(EssayGradeRecord.user_id == uid).delete(synchronize_session=False)
    db.query(ExamRecord).filter(ExamRecord.user_id == uid).delete(synchronize_session=False)
    db.query(PasswordResetToken).filter(PasswordResetToken.user_id == uid).delete(synchronize_session=False)

    # 2) 聊天：消息经 session 关联，先删消息再删会话
    session_ids = [r[0] for r in db.query(ChatSession.id).filter(ChatSession.user_id == uid).all()]
    if session_ids:
        db.query(ChatMessage).filter(ChatMessage.session_id.in_(session_ids)).delete(
            synchronize_session=False
        )
        db.query(ChatSession).filter(ChatSession.id.in_(session_ids)).delete(synchronize_session=False)

    # 3) 学习计划：任务经 plan 关联，先删任务再删计划
    plan_ids = [r[0] for r in db.query(StudyPlan.id).filter(StudyPlan.user_id == uid).all()]
    if plan_ids:
        db.query(PlanTask).filter(PlanTask.plan_id.in_(plan_ids)).delete(synchronize_session=False)
        db.query(StudyPlan).filter(StudyPlan.id.in_(plan_ids)).delete(synchronize_session=False)

    # 4) 账号匿名化（订单/退费记录法定留存，附着于匿名 id）
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    current.email = f"deleted_{uid}_{stamp}@deleted.local"
    current.phone = None
    current.nickname = "已注销用户"
    current.hashed_password = "!deactivated"  # 任何密码都无法匹配
    current.is_active = False  # get_current_user 校验 → 全部受保护接口即时 401
    current.province = None
    current.target_exam_date = None
    current.target_exam_name = None
    current.plan = "free"
    current.plan_expires_at = None

    db.commit()

    return {
        "ok": True,
        "message": "账号已注销。学习数据已删除，订单财务记录依法规留存（已与身份信息脱钩），"
        "同邮箱可重新注册全新账号。",
    }

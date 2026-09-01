"""认证路由（方案 c4 学员中心 / WBS 2.1）。

注册即签发 JWT，便于前端直接登录态进入学习；所有受保护接口通过 get_current_user 依赖校验。
"""
import logging
import secrets
import smtplib
import ssl
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from app.db.session import get_db
from app.models import PasswordResetToken, User
from app.services.notification_service import create_notification, NOTIF_MEMBERSHIP_EXPIRED
from app.schemas.user import (
    ChangePasswordIn,
    PasswordResetIn,
    PasswordResetRequestIn,
    TokenOut,
    UserLogin,
    UserOut,
    UserRegister,
    UserUpdate,
)

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def _maybe_downgrade_expired(user: User, db: Session) -> None:
    """会员过期则在请求期即时降级为 free（生产一致性保障）。

    过期 pro 用户不应再享受无限 AI 等会员权益；降级后其免费配额逻辑自然生效。
    """
    if user.plan in ("pro", "pro_year") and user.plan_expires_at is not None:
        exp = user.plan_expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp < datetime.now(timezone.utc):
            user.plan = "free"
            user.plan_expires_at = None
            create_notification(
                db, user.id, NOTIF_MEMBERSHIP_EXPIRED,
                "⏰ 会员已到期", "续费可恢复会员权益", "/membership",
            )
            db.commit()


def get_current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> User:
    cred_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="无效或过期的凭证",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise cred_exc
    sub = decode_access_token(token)
    if sub is None:
        raise cred_exc
    try:
        user_id = int(sub)
    except (TypeError, ValueError):
        raise cred_exc
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise cred_exc
    _maybe_downgrade_expired(user, db)
    return user


def get_optional_user(
    request: Request, db: Session = Depends(get_db)
) -> User | None:
    """非强制鉴权：携带有效 token 则返回用户，否则返回 None（不抛 401）。

    直接读取 Authorization 头而非依赖 oauth2_scheme（其 auto_error 会对匿名请求抛 401/403），
    用于「题库列表」这类既支持登录态自适应排序、又对匿名公开浏览保持兼容的接口。
    """
    auth = request.headers.get("Authorization")
    if not auth or not auth.startswith("Bearer "):
        return None
    token = auth[len("Bearer ") :]
    try:
        sub = decode_access_token(token)
    except Exception:
        return None
    if sub is None:
        return None
    try:
        user_id = int(sub)
    except (TypeError, ValueError):
        return None
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        return None
    return user


def require_roles(*roles: str):
    """构造依赖：仅当 current_user.role 命中允许的角色集合时放行，否则 403。

    用于内容双签审核、支付手动激活等敏感操作。
    """

    def checker(current: User = Depends(get_current_user)) -> User:
        if current.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="无权限执行该操作"
            )
        return current

    return checker


# 常用角色依赖：内容审核员或管理员；仅管理员。
require_reviewer = require_roles("reviewer", "admin")
require_admin = require_roles("admin")


@router.post("/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
def register(payload: UserRegister, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=409, detail="该邮箱已注册")
    user = User(
        email=payload.email,
        nickname=payload.nickname,
        province=payload.province,
        target_exam=payload.target_exam,
        hashed_password=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return TokenOut(access_token=create_access_token(user.id))


@router.post("/login", response_model=TokenOut)
def login(payload: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="邮箱或密码错误")
    return TokenOut(access_token=create_access_token(user.id))


@router.get("/me", response_model=UserOut)
def me(current: User = Depends(get_current_user)):
    return current


@router.patch("/me", response_model=UserOut)
def update_me(payload: UserUpdate, current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """更新学员画像（昵称 / 报考省份 / 目标考试 / 备考倒计时），供学习计划与个性化诊断使用。"""
    updates = payload.model_dump(exclude_unset=True)
    if "nickname" in updates and updates["nickname"] is not None:
        current.nickname = updates["nickname"] or current.nickname
    if "province" in updates:
        current.province = updates["province"]
    if "target_exam" in updates:
        current.target_exam = updates["target_exam"]
    if "target_exam_date" in updates:  # 显式 null = 清除倒计时
        current.target_exam_date = updates["target_exam_date"] or None
    if "target_exam_name" in updates:
        current.target_exam_name = updates["target_exam_name"] or None
    db.commit()
    db.refresh(current)
    return current


@router.post("/change-password", status_code=status.HTTP_200_OK)
def change_password(
    payload: ChangePasswordIn, current: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """修改密码：校验旧密码后设置新密码（≥6 位）。"""
    if not verify_password(payload.old_password, current.hashed_password):
        raise HTTPException(status_code=400, detail="原密码错误")
    if len(payload.new_password) < 6:
        raise HTTPException(status_code=400, detail="新密码至少 6 位")
    current.hashed_password = hash_password(payload.new_password)
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# 账号找回 / 密码重置（WBS 2.1 安全）
# ---------------------------------------------------------------------------
def _send_reset_email(email: str, token: str) -> bool:
    """发送密码重置邮件；未配置 SMTP_HOST 时返回 False（开发模式）。

    返回 False 时由调用方直接返回 dev_token，便于自托管演示与测试。
    真实发送：465 → SMTP_SSL；其他端口 → SMTP + STARTTLS。捕获所有异常并记日志，
    避免给前端返回 5xx —— 找回链路必须总是 200 防账号枚举。
    """
    if not settings.SMTP_HOST:
        return False
    reset_url = settings.PASSWORD_RESET_URL or "https://gwy.example/reset"
    link = f"{reset_url.rstrip('/')}?token={token}"
    msg = EmailMessage()
    msg["Subject"] = "AI 公考私教 · 密码重置"
    msg["From"] = settings.SMTP_SENDER
    msg["To"] = email
    msg.set_content(
        f"你好，\n\n我们收到了你的密码重置请求。点击下方链接重置密码（30 分钟内有效）：\n\n\n    {link}\n\n\n如果不是你本人的操作，请忽略此邮件。\n\n—— AI 公考私教"
    )
    try:
        if settings.SMTP_PORT == 465:
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, context=context, timeout=15) as s:
                if settings.SMTP_USER:
                    s.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                s.send_message(msg)
        else:
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as s:
                s.ehlo()
                s.starttls(context=ssl.create_default_context())
                s.ehlo()
                if settings.SMTP_USER:
                    s.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                s.send_message(msg)
        return True
    except Exception as e:
        logging.getLogger(__name__).warning("SMTP send failed: %s", e)
        return False


@router.post("/forgot-password", status_code=status.HTTP_200_OK)
def forgot_password(payload: PasswordResetRequestIn, db: Session = Depends(get_db)):
    """账号找回：提交注册邮箱，生成一次性重置令牌（30 分钟有效）。

    - 无论邮箱是否注册均返回 200，避免账号枚举。
    - 配置 SMTP 时发送邮件；未配置（开发/自托管）直接返回 dev_token。
    """
    user = db.query(User).filter(User.email == payload.email).first()
    if user is None:
        return {"ok": True, "message": "若该邮箱已注册，重置链接将发送至该邮箱"}

    # 作废该用户尚未使用的有效令牌，防止堆积多个可用令牌
    db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == user.id,
        PasswordResetToken.used.is_(False),
        PasswordResetToken.expires_at > datetime.now(timezone.utc),
    ).update({PasswordResetToken.used: True})

    token = secrets.token_urlsafe(32)
    rec = PasswordResetToken(
        user_id=user.id,
        token=token,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=30),
    )
    db.add(rec)
    db.commit()

    sent = _send_reset_email(user.email, token)
    if not sent:
        return {
            "ok": True,
            "dev_token": token,
            "message": "开发模式：未配置 SMTP，已直接返回重置令牌（请在生产环境启用邮件）。",
        }
    return {"ok": True, "message": "重置链接已发送至该邮箱"}


@router.post("/reset-password", status_code=status.HTTP_200_OK)
def reset_password(payload: PasswordResetIn, db: Session = Depends(get_db)):
    """使用令牌重置密码：令牌单次使用、30 分钟有效、新密码≥6 位。"""
    rec = db.query(PasswordResetToken).filter(PasswordResetToken.token == payload.token).first()
    if rec is None or rec.used:
        raise HTTPException(status_code=400, detail="无效或已使用的重置令牌")
    exp = rec.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="重置令牌已过期，请重新申请")
    if len(payload.new_password) < 6:
        raise HTTPException(status_code=400, detail="新密码至少 6 位")

    user = db.get(User, rec.user_id)
    if user is None:
        raise HTTPException(status_code=400, detail="无效的重置令牌")
    user.hashed_password = hash_password(payload.new_password)
    rec.used = True
    db.commit()
    return {"ok": True, "message": "密码已重置，请使用新密码登录"}

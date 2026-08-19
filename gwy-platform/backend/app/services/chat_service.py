"""AI 私教对话持久化服务（WBS 3.1）。

负责会话与消息的存取；发送时将全量历史交给 TutorAgent，并把用户/助手消息一并落库，
使"私教大脑"从一次性建议变成可回溯、可复盘的持久上下文。
"""
import json

from sqlalchemy.orm import Session

from app.ai.tutor_agent import TutorAgent
from app.models import AbilityProfile, ChatMessage, ChatSession, User


def _msg_to_out(m: ChatMessage) -> dict:
    try:
        raw = json.loads(m.citations) if m.citations else []
    except (json.JSONDecodeError, TypeError):
        raw = []
    # 兼容旧版：历史消息曾以字符串来源列表存储，归一化为 {source} 富引用
    cites = [c if isinstance(c, dict) else {"source": c} for c in raw]
    return {
        "id": m.id,
        "role": m.role,
        "content": m.content,
        "citations": cites,
        "model": m.model,
        "offline": m.offline,
        "created_at": m.created_at,
    }


def create_session(db: Session, user: User, title: str = "新对话") -> ChatSession:
    s = ChatSession(user_id=user.id, title=title)
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


def list_sessions(db: Session, user: User) -> list[ChatSession]:
    return (
        db.query(ChatSession)
        .filter(ChatSession.user_id == user.id)
        .order_by(ChatSession.updated_at.desc())
        .all()
    )


def get_session(db: Session, user: User, session_id: int) -> ChatSession | None:
    return (
        db.query(ChatSession)
        .filter(ChatSession.id == session_id, ChatSession.user_id == user.id)
        .first()
    )


def get_messages(db: Session, session: ChatSession) -> list[ChatMessage]:
    return (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session.id)
        .order_by(ChatMessage.id)
        .all()
    )


def session_to_out(s: ChatSession) -> dict:
    last = None
    if s.messages:
        last_msg = sorted(s.messages, key=lambda m: m.id)[-1]
        content = (last_msg.content or "").strip()
        last = (content[:60] + "…") if len(content) > 60 else content
    return {
        "id": s.id,
        "title": s.title,
        "created_at": s.created_at,
        "updated_at": s.updated_at,
        "message_count": len(s.messages),
        "last_message": last,
    }


def delete_session(db: Session, user: User, session_id: int) -> bool:
    s = get_session(db, user, session_id)
    if s is None:
        return False
    db.delete(s)
    db.commit()
    return True


def rename_session(db: Session, user: User, session_id: int, title: str) -> bool:
    """重命名会话（用户自定义标题，便于归档与快速识别）。"""
    s = get_session(db, user, session_id)
    if s is None:
        return False
    s.title = title.strip()[:50]
    db.commit()
    return True


def send_message(
    db: Session,
    user: User,
    session: ChatSession,
    content: str,
    kp_hint: str | None = None,
) -> dict:
    """落库用户消息 → 调 TutorAgent（全量历史）→ 落库助手消息 → 返回结果。

    首条用户消息自动成为会话标题；offline 由能力层在 LLM 不可用时返回 True。
    """
    user_msg = ChatMessage(session_id=session.id, role="user", content=content)
    db.add(user_msg)
    db.commit()
    db.refresh(user_msg)

    # 全量历史（含刚落库的用户消息）交给私教，保证多轮上下文连续
    history = [{"role": m.role, "content": m.content} for m in get_messages(db, session)]

    # 注入学员能力画像：取掌握度最低的若干知识点，让私教给出个性化、针对最薄弱处的建议
    abilities = (
        db.query(AbilityProfile)
        .filter(AbilityProfile.user_id == user.id)
        .order_by(AbilityProfile.mastery.asc())
        .all()
    )
    weak_points = (
        [
            {"knowledge_point": a.knowledge_point, "mastery": a.mastery}
            for a in abilities
            if a.mastery < 0.85
        ]
        if abilities
        else None
    )

    tutor = TutorAgent()
    resp = tutor.chat(history, kp_hint, weak_points=weak_points)

    assistant_msg = ChatMessage(
        session_id=session.id,
        role="assistant",
        content=resp.get("answer", ""),
        citations=json.dumps(resp.get("citations", []), ensure_ascii=False),
        model=resp.get("model"),
        offline=bool(resp.get("offline", False)),
    )
    db.add(assistant_msg)

    # 首条消息自动生成标题（仅取前 20 字）
    if not session.title or session.title == "新对话":
        session.title = (content or "新对话")[:20]
    db.commit()
    db.refresh(assistant_msg)

    return {
        "session_id": session.id,
        "message": _msg_to_out(assistant_msg),
        "title": session.title,
    }

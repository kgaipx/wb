"""AI 私教对话持久化路由（WBS 3.1 私教闭环：历史可查、刷新不丢）。

挂在 /api/ai 前缀下；所有端点受 get_current_user 保护，且只能访问本人会话。
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.routes.auth import get_current_user
from app.db.session import get_db
from app.models import User
from app.schemas.chat import (
    ChatMessageOut,
    ChatSendIn,
    ChatSendOut,
    ChatSessionOut,
    ChatSessionRenameIn,
)
from app.services import chat_service as cs

router = APIRouter()


@router.get("/chat/sessions", response_model=list[ChatSessionOut])
def list_my_sessions(
    current: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """当前用户的会话列表（按最近互动倒序）。"""
    return [ChatSessionOut(**cs.session_to_out(s)) for s in cs.list_sessions(db, current)]


@router.post("/chat/sessions", response_model=ChatSessionOut, status_code=201)
def create_my_session(
    current: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """新建一个空白会话（标题随后由首条消息自动生成）。"""
    s = cs.create_session(db, current)
    return ChatSessionOut(**cs.session_to_out(s))


@router.get("/chat/sessions/{session_id}/messages", response_model=list[ChatMessageOut])
def session_messages(
    session_id: int,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """取某会话的全部消息（按时间正序，可直接渲染）。"""
    s = cs.get_session(db, current, session_id)
    if s is None:
        raise HTTPException(status_code=404, detail="会话不存在")
    return [ChatMessageOut(**cs._msg_to_out(m)) for m in cs.get_messages(db, s)]


@router.post("/chat/sessions/{session_id}/messages", response_model=ChatSendOut)
def send_to_session(
    session_id: int,
    payload: ChatSendIn,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """向会话发送一条用户消息，私教基于全量历史回复并落库。"""
    s = cs.get_session(db, current, session_id)
    if s is None:
        raise HTTPException(status_code=404, detail="会话不存在")
    if not payload.content or not payload.content.strip():
        raise HTTPException(status_code=400, detail="消息内容不能为空")
    result = cs.send_message(db, current, s, payload.content, payload.kp_hint)
    return ChatSendOut(
        session_id=result["session_id"],
        message=ChatMessageOut(**result["message"]),
        title=result["title"],
    )


@router.delete("/chat/sessions/{session_id}", status_code=204)
def delete_my_session(
    session_id: int,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """删除会话及其全部消息（级联）。"""
    if not cs.delete_session(db, current, session_id):
        raise HTTPException(status_code=404, detail="会话不存在")


@router.patch("/chat/sessions/{session_id}", response_model=ChatSessionOut)
def rename_my_session(
    session_id: int,
    payload: ChatSessionRenameIn,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """重命名会话（用户自定义标题，便于归档与快速识别）。"""
    if not cs.rename_session(db, current, session_id, payload.title):
        raise HTTPException(status_code=404, detail="会话不存在")
    s = cs.get_session(db, current, session_id)
    return ChatSessionOut(**cs.session_to_out(s))

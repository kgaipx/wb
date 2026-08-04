"""学员中心 / 学情看板路由（方案 c4 方向1 / WBS 2.1）。

/student/me 返回用户画像 + 答题统计 + 能力图谱，是"AI 私教"诊断面板的数据来源。
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.routes.auth import get_current_user
from app.db.session import get_db
from app.models import AbilityProfile, User, UserAnswer
from app.schemas.progress import AbilityOut, StudentDashboard
from app.schemas.user import UserOut

router = APIRouter()


@router.get("/me", response_model=StudentDashboard)
def dashboard(current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    total = db.query(UserAnswer).filter(UserAnswer.user_id == current.id).count()
    correct = (
        db.query(UserAnswer)
        .filter(UserAnswer.user_id == current.id, UserAnswer.is_correct == True)
        .count()
    )
    rate = round(correct / total, 3) if total else 0.0
    abilities = (
        db.query(AbilityProfile)
        .filter(AbilityProfile.user_id == current.id)
        .order_by(AbilityProfile.mastery)
        .all()
    )
    return StudentDashboard(
        user=UserOut.model_validate(current),
        total_answers=total,
        correct_rate=rate,
        ability=[AbilityOut.model_validate(a) for a in abilities],
    )


@router.get("/ability", response_model=list[AbilityOut])
def ability(current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return (
        db.query(AbilityProfile)
        .filter(AbilityProfile.user_id == current.id)
        .order_by(AbilityProfile.mastery)
        .all()
    )

"""AI 学习计划生成（方案 c3 私教大脑 / 闭合「诊断→计划→执行→复盘」）。

把分散在各处的数据资产聚合为一个「私教大脑」输出：
- 学情能力图谱（掌握度最低的知识点）
- 错题本（反复错的知识点）
- 收藏夹（用户主动标记的重点）
- 自适应诊断薄弱点
最终生成带日程的个性化学习计划。

LLM 可用时生成结构化 JSON 计划；LLM 不可用时（无 key / 网络异常 / 解析失败）
自动降级为规则生成，保证接口永不 500，对应「离线轻量 / 信任保障」差异点。
"""
from __future__ import annotations

import json
import re
from typing import Any

from sqlalchemy import func

from app.ai.llm_gateway import LLMGateway
from app.ai.tutor_agent import TutorAgent
from app.models import AbilityProfile, Favorite, Question, User, UserAnswer


def _priority_knowledge_points(
    abilities: list[AbilityProfile],
    wrong_rows: list[tuple[str, int]],
    fav_kps: list[str],
) -> list[str]:
    """聚合优先级知识点：自适应薄弱点 → 高频错题 → 收藏重点，去重保序。"""
    weak = TutorAgent.diagnose_mistakes(abilities)  # 已在内部按掌握度升序
    wrong_kps = [kp for kp, _ in sorted(wrong_rows, key=lambda x: -x[1])]
    ordered: list[str] = []
    for kp in weak + wrong_kps + list(fav_kps):
        if kp and kp not in ordered:
            ordered.append(kp)
    return ordered


def _extract_json(text: str) -> str:
    """从 LLM 输出中容错提取 JSON（兼容 ```json 围栏 / 前后噪声）。"""
    text = text.strip()
    m = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if m:
        return m.group(1).strip()
    # 退而求其次：截取首个 { 到末个 }
    s, e = text.find("{"), text.rfind("}")
    if s != -1 and e != -1:
        return text[s : e + 1]
    return text


def _rule_based_plan(
    db, user: User, days: int, priority: list[str], wrong_qid: dict[str, int], fav_qid: dict[str, int]
) -> dict:
    """离线规则生成：每天聚焦一个重点知识点，循环排布，含专项/错题/收藏/讲解/模考。"""
    if not priority:
        priority = ["行测综合基础", "申论写作基础"]
    items: list[dict[str, Any]] = []
    for d in range(1, days + 1):
        focus = priority[(d - 1) % len(priority)]
        qs = db.query(Question).filter(Question.knowledge_point == focus).limit(3).all()
        tasks: list[dict[str, Any]] = []
        if qs:
            tasks.append(
                {"kind": "practice", "title": f"刷 {len(qs)} 道「{focus}」专项题", "target": focus, "ref_id": qs[0].id}
            )
        if focus in wrong_qid:
            tasks.append(
                {"kind": "review_wrong", "title": f"复盘「{focus}」错题，避免再错", "target": focus, "ref_id": wrong_qid[focus]}
            )
        if focus in fav_qid:
            tasks.append(
                {"kind": "favorite", "title": f"重看收藏的「{focus}」好题", "target": focus, "ref_id": fav_qid[focus]}
            )
        tasks.append({"kind": "explain", "title": f"听 AI 私教讲透 1 道「{focus}」题", "target": focus, "ref_id": None})
        if d % 7 == 0 or d == days:
            tasks.append({"kind": "mock", "title": "做一套全真模考，检验本周成果", "target": None, "ref_id": None})
        items.append(
            {
                "day": d,
                "focus": focus,
                "summary": f"主攻「{focus}」：专项训练 + 错题复盘 + AI 讲解",
                "knowledge_points": [focus],
                "tasks": tasks,
            }
        )
    return {
        "days": days,
        "items": items,
        "model": None,
        "offline": True,
        "summary": "（离线模式）已根据你的学情、错题与收藏生成规则化计划；联网后将获得 AI 个性化编排。",
    }


def generate_plan(db, user: User, days: int = 7, target: str | None = None) -> dict:
    """生成个性化学习计划。聚合数据资产，优先 LLM，失败降级规则。"""
    days = max(1, min(int(days), 90))
    abilities = db.query(AbilityProfile).filter(AbilityProfile.user_id == user.id).all()

    wrong_rows = (
        db.query(Question.knowledge_point, func.count())
        .join(UserAnswer, Question.id == UserAnswer.question_id)
        .filter(UserAnswer.user_id == user.id, UserAnswer.is_correct == False)  # noqa: E712
        .group_by(Question.knowledge_point)
        .all()
    )
    wrong_qid = {}
    for kp, _ in wrong_rows:
        q = (
            db.query(Question.id)
            .join(UserAnswer, Question.id == UserAnswer.question_id)
            .filter(Question.knowledge_point == kp, UserAnswer.user_id == user.id, UserAnswer.is_correct == False)  # noqa: E712
            .first()
        )
        if q:
            wrong_qid[kp] = q.id

    fav_kps_raw = (
        db.query(Question.knowledge_point)
        .join(Favorite, Question.id == Favorite.question_id)
        .filter(Favorite.user_id == user.id)
        .all()
    )
    fav_kps = [kp for (kp,) in fav_kps_raw if kp]
    fav_qid = {}
    for kp in fav_kps:
        q = (
            db.query(Question.id)
            .join(Favorite, Question.id == Favorite.question_id)
            .filter(Question.knowledge_point == kp, Favorite.user_id == user.id)
            .first()
        )
        if q:
            fav_qid[kp] = q.id

    priority = _priority_knowledge_points(abilities, wrong_rows, fav_kps)
    if not priority:
        return _rule_based_plan(db, user, days, priority, wrong_qid, fav_qid)

    # —— 尝试 LLM 生成 ——
    kp_mastery = {a.knowledge_point: round(a.mastery, 3) for a in abilities}
    data_block = {
        "目标考试": target or user.target_exam or "公务员笔试",
        "重点知识点及掌握度": [
            {"kp": kp, "mastery": kp_mastery.get(kp, 0.0)}
            for kp in priority[:12]
        ],
        "错题高频知识点": [kp for kp, _ in wrong_rows],
        "收藏重点": fav_kps,
        "计划天数": days,
    }
    system = (
        "你是资深公务员考试私教。根据用户学情，生成一份个性化学习计划。"
        "只输出一个 JSON 对象，不要任何额外文字或解释。结构如下：\n"
        '{"summary": string, "items": [{"day": int, "focus": string, '
        '"summary": string, "knowledge_points": [string], '
        '"tasks": [{"kind": "practice|review_wrong|favorite|mock|explain|read", '
        '"title": string, "target": string|null, "ref_id": int|null}]}]}'
    )
    user_prompt = (
        "请基于以下学情生成 {0} 天学习计划，重点优先照顾掌握度低与反复出错的知识点：\n".format(days)
        + json.dumps(data_block, ensure_ascii=False)
    )

    try:
        gw = LLMGateway()
        resp = gw.complete(user_prompt, system=system, temperature=0.4, max_tokens=2048)
        data = json.loads(_extract_json(resp.content))
        items = data.get("items")
        if not isinstance(items, list) or not items:
            raise ValueError("plan items empty")
        return {
            "days": days,
            "items": items,
            "model": resp.model,
            "offline": False,
            "summary": data.get("summary"),
        }
    except Exception:  # noqa: BLE001 - LLM 不可用/解析失败均降级
        return _rule_based_plan(db, user, days, priority, wrong_qid, fav_qid)

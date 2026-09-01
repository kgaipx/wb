"""题库自动识别审核（程序初筛，c11 内容可信闭环的自动化前置）。

目标：把 12,090 道待核实题的人工全量双签，变成「程序自动识别可疑题 → 人工优先复核可疑项」。
纯规则实现（无 LLM、可解释、可复现），9 类识别规则：

硬伤（suspect，需要人工复核）：
  incomplete       题干/选项/答案缺失或不完整
  bad_answer       答案字母不在选项集内
  answer_conflict  答案对应的选项未被标记为正确（答案与选项矛盾）
  correct_mismatch 正确项数量与答案字母数不一致（单选多答/多选少答）
  dup_options      存在内容重复的选项
  mangled_stem     题干含乱码字符（U+FFFD）或残留 URL
  dup_question     同科目下题干重复（去空白后）——疑似重复导入

提示（notice，不阻塞，供运营参考）：
  qtype_mismatch   qtype 与答案长度不匹配（single 但多字母 / multiple 但单字母）
  no_explanation   缺少解析

不自动改库、不自动置 verified —— 识别结果只用于给管理员排序待审队列。
"""
import re
from collections import Counter

from sqlalchemy.orm import Session

from app.models import Question

# 乱码字符检测：U+FFFD 替换符 / 孤立代理区 / 控制符
_MANGLED_RE = re.compile(r"[\ufffd\u0000-\u0008\u000b\u000c\u000e-\u001f]")
_URL_RE = re.compile(r"https?://\S+", re.I)

# 识别结果代码 → 中文说明
REASON_LABELS: dict[str, str] = {
    "incomplete": "题干/选项/答案不完整",
    "bad_answer": "答案字母不在选项集内",
    "answer_conflict": "答案与选项正确性矛盾",
    "correct_mismatch": "正确项数量与答案不一致",
    "dup_options": "存在重复选项",
    "mangled_stem": "题干含乱码/残留URL",
    "dup_question": "题干重复（疑似重复导入）",
    "qtype_mismatch": "题型与答案长度不匹配",
    "no_explanation": "缺少解析",
}


def _normalize(s: str | None) -> str:
    return re.sub(r"\s+", "", s or "")


def _resolve_answer(q: Question):
    """把答案解析为「选项字母集」形式，兼容两种入库格式：

    1. 字母格式：answer="A" / "AB"（导入题）
    2. 文本格式：answer="精益求精"（种子题，答案存的是正确选项的内容）

    返回 (labels: set[str] | None, form: "letter"|"text"|"bad")
    """
    answer = _normalize(q.answer)
    if not answer:
        return None, "bad"
    opts = q.options or []
    labels = [o.label.strip().upper() for o in opts if o.label]
    # 字母格式：全部字符都在选项标签集内
    if labels and all(ch in labels for ch in answer) and len(set(answer)) <= len(set(labels)):
        return set(answer), "letter"
    # 文本格式：去空白后与某个选项内容一致 → 映射到该标签
    content_map: dict[str, str] = {}
    for o in opts:
        if o.label and o.content:
            content_map[_normalize(o.content)] = o.label.strip().upper()
    if answer in content_map:
        return {content_map[answer]}, "text"
    # 既不是字母也不是选项内容 → 无法解析
    return None, "bad"


def _check_question(q: Question) -> list[str]:
    """返回该题命中的所有识别规则代码（空列表 = 无嫌疑）。"""
    reasons: list[str] = []
    stem = q.stem or ""
    opts = q.options or []
    labels = [o.label.strip().upper() for o in opts if o.label]
    answer = _normalize(q.answer)

    # 1) 完整性
    if len(_normalize(stem)) < 6 or len(opts) < 2 or not answer:
        reasons.append("incomplete")
    # 2/3/4) 答案解析 + 一致性（兼容字母/文本两种格式）
    resolved, form = _resolve_answer(q)
    if form == "bad" and answer:
        reasons.append("bad_answer")
    elif resolved:
        correct_labels = {o.label.strip().upper() for o in opts if o.is_correct}
        # 答案指向的选项必须是正确项
        if not resolved <= correct_labels:
            reasons.append("answer_conflict")
        # 正确项数量 vs 答案字母数（文本格式视为 1 个答案）
        if correct_labels and len(resolved) != len(correct_labels):
            reasons.append("correct_mismatch")
        # 题型与答案长度（仅字母格式有意义）
        if form == "letter" and q.qtype == "single" and len(resolved) > 1:
            reasons.append("qtype_mismatch")
        elif form == "letter" and q.qtype == "multiple" and len(resolved) == 1:
            reasons.append("qtype_mismatch")
    # 5) 重复选项（去空白比较）
    if len(opts) >= 2:
        seen: dict[str, str] = {}
        for o in opts:
            key = _normalize(o.content)
            if key and key in seen:
                reasons.append("dup_options")
                break
            seen[key] = o.label
    # 6) 题干乱码 / URL
    if _MANGLED_RE.search(stem) or _URL_RE.search(stem):
        reasons.append("mangled_stem")
    # 7) 缺少解析（提示级）
    if not _normalize(q.explanation):
        reasons.append("no_explanation")
    return reasons


def auto_scan(
    db: Session,
    subject: str | None = None,
    source: str | None = None,
    limit: int = 200,
    exclude_handled: bool = True,
) -> dict:
    """全库/按科目/按来源扫描，返回统计 + 按类型聚合 + 按科目分组 + 可疑题样本。

    exclude_handled=True 时跳过已处置题（audit_status != 'pending'），
    让识别结果始终聚焦「尚未处置」的可疑题。
    """
    q = db.query(Question)
    if exclude_handled:
        q = q.filter(Question.audit_status == "pending")
    if subject:
        q = q.filter(Question.subject == subject)
    if source:
        q = q.filter(Question.source == source)

    rows = q.order_by(Question.id.asc()).all()

    # 重复题检测：同科目下去空白 stem 出现次数 > 1
    stem_count: Counter = Counter()
    for r in rows:
        stem_count[(r.subject, _normalize(r.stem))] += 1

    by_type: Counter = Counter()
    grouped: Counter = Counter()  # 按 subject 聚合硬伤数（工作台分组视图）
    suspects: list[dict] = []
    hard_suspect = 0
    notice_only = 0
    ok = 0

    for r in rows:
        reasons = _check_question(r)
        dup_key = (r.subject, _normalize(r.stem))
        if stem_count[dup_key] > 1:
            reasons.append("dup_question")
        hard = [c for c in reasons if c != "no_explanation"]
        if not hard:
            if reasons:
                notice_only += 1  # 仅有提示级（缺解析），不算硬伤
            else:
                ok += 1
            continue
        hard_suspect += 1
        grouped[r.subject] += 1
        for code in reasons:
            by_type[code] += 1
        if len(suspects) < limit:
            suspects.append(
                {
                    "id": r.id,
                    "subject": r.subject,
                    "category": r.category,
                    "qtype": r.qtype,
                    "source": r.source,
                    "stem": (r.stem or "")[:80],
                    "answer": r.answer,
                    "audit_status": r.audit_status,
                    "reasons": reasons,
                    "reason_labels": [REASON_LABELS[c] for c in reasons],
                }
            )

    return {
        "scanned": len(rows),
        "ok_count": ok,
        "notice_count": notice_only,
        "suspect_count": hard_suspect,
        "ok_rate": round(ok / len(rows), 3) if rows else 0.0,
        "by_type": {k: by_type[k] for k in sorted(by_type, key=lambda x: -by_type[x])},
        "grouped": {k: grouped[k] for k in sorted(grouped, key=lambda x: -grouped[x])},
        "suspects": suspects,
        "limit": limit,
    }

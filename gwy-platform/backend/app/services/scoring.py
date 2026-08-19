"""统一判分与可判分题过滤（无答案题体验加固，2026-08-16）。

背景：题库中存在一批「标准答案缺失」的题——既可能是 `Question.answer IS NULL`，
也可能是 `answer` 非空但选项没有任何 `is_correct` 标记。后者尤其隐蔽：此前会
被静默判错（`correct_labels=[]` → `is_correct` 恒 False）并污染正确率/能力图谱。

本模块提供两样东西：
1. `has_correct_option_filter()`：可判分题的 SQLAlchemy 过滤条件（至少一项
   `QuestionOption.is_correct=True`），用于把无标准答案的题移出学生刷题/模考轮换。
2. `score_selection()`：统一的客观题判分，返回 `(correct_labels, is_correct, scorable)`。
   当 `scorable=False`（无正确选项标记）时，调用方**不应**写入 `is_correct=False`、
   不应更新能力图谱，而应走「跳过」分支，避免污染统计。
"""
from sqlalchemy import exists

from app.models import Question, QuestionOption


def has_correct_option_filter():
    """可判分题过滤条件：该题为客观题且至少有一项正确选项标记。"""
    return exists().where(QuestionOption.question_id == Question.id).where(
        QuestionOption.is_correct == True  # noqa: E712
    )


def score_selection(selected: str, options, qtype: str):
    """客观题判分。

    返回 (correct_labels, is_correct, scorable)：
    - correct_labels：正确选项标签列表（如 ["A"] / ["AB"]）。
    - is_correct：用户选择集合是否与正确标签集合一致（essay 恒 False，交由批改引擎）。
    - scorable：该题是否可判分。False 表示选项无正确标记（无标准答案），
      调用方应跳过、不记录、不污染统计。
    """
    correct_labels = [o.label for o in options if o.is_correct]
    if qtype == "essay":
        return correct_labels, False, True
    if not correct_labels:
        # 无正确选项标记 → 无标准答案，不可判分
        return correct_labels, False, False
    is_correct = set(selected.split()) == set(correct_labels)
    return correct_labels, is_correct, True

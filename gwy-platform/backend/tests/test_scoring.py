"""score_selection 判分单测：覆盖单选/多选（含此前 split() 误判的 "AB" 多选 bug）。

纯函数测试，不依赖数据库。
"""
from types import SimpleNamespace

from app.services.scoring import score_selection


def _opt(label, is_correct):
    return SimpleNamespace(label=label, is_correct=is_correct)


def test_single_correct():
    opts = [_opt("A", True), _opt("B", False), _opt("C", False)]
    labels, ok, scorable = score_selection("A", opts, "single")
    assert labels == ["A"]
    assert ok is True
    assert scorable is True


def test_single_wrong():
    opts = [_opt("A", True), _opt("B", False)]
    _, ok, _ = score_selection("B", opts, "single")
    assert ok is False


def test_multi_correct_joined():
    # 多选：正确答案是 A+B；前端 join 无空格发送 "AB"
    opts = [_opt("A", True), _opt("B", True), _opt("C", False)]
    labels, ok, scorable = score_selection("AB", opts, "single")
    assert set(labels) == {"A", "B"}
    assert ok is True  # 此前 split() 把 "AB" 当成 ['AB'] 会判 False
    assert scorable is True


def test_multi_correct_with_space():
    opts = [_opt("A", True), _opt("B", True), _opt("C", False)]
    ok = score_selection("A B", opts, "single")[1]
    assert ok is True


def test_multi_partial_wrong():
    opts = [_opt("A", True), _opt("B", True), _opt("C", False)]
    ok = score_selection("A", opts, "single")[1]
    assert ok is False


def test_multi_over_selected():
    opts = [_opt("A", True), _opt("B", True), _opt("C", False)]
    ok = score_selection("ABC", opts, "single")[1]
    assert ok is False


def test_no_correct_option_not_scorable():
    opts = [_opt("A", False), _opt("B", False)]
    labels, ok, scorable = score_selection("A", opts, "single")
    assert scorable is False
    assert ok is False


def test_essay_always_false_scorable():
    opts = [_opt("A", True)]
    labels, ok, scorable = score_selection("A", opts, "essay")
    assert scorable is True
    assert ok is False


def test_empty_selected_single():
    opts = [_opt("A", True), _opt("B", False)]
    ok = score_selection("", opts, "single")[1]
    assert ok is False

"""给 knowledge_point='待标注' 的题补标行测大类（并同步修正 category）。

策略：
- 主路径：调用 DeepSeek（LLMGateway）按题干片段将每题归入行测五大类之一。
- 兜底：若 LLM 调用异常，退化为关键词启发式（资料分析特征极强，优先命中）。
- 幂等：仅更新 knowledge_point 仍为 '待标注' 的题；重跑安全。

kp 直接取大类名（资料分析/数量关系/判断推理/言语理解与表达/常识判断），
与现有 3471 道大类题行为一致，RAG 检索器靠 _CATEGORY_KP 映射上浮对应片段。
"""
import os
import re
import json

from sqlalchemy import create_engine, text

from app.ai.llm_gateway import LLMGateway

CATEGORIES = ["资料分析", "数量关系", "判断推理", "言语理解与表达", "常识判断"]

SYSTEM = (
    "你是公务员考试题库标注助手。给定若干行测题目（仅题干片段），"
    "请判断每道题所属的行测大类，只能从以下五类中选一个："
    "资料分析、数量关系、判断推理、言语理解与表达、常识判断。"
    "返回 JSON 数组，元素格式：{\"id\": 题目id, \"category\": 大类名}。"
    "只输出 JSON 数组，不要任何解释或多余文字。"
)

SIGNALS = [
    ("资料分析", ["根据资料", "以下说法正确的是", "能够从上述材料", "占", "比重", "增长率",
                  "同比", "环比", "年", "表格", "图形", "材料", "其中", "累计", "亿元", "万吨", "百分点"]),
    ("数量关系", ["甲", "乙", "倍", "如果", "那么", "至少", "最多", "相遇", "效率", "概率",
                  "溶液", "浓度", "排列", "组合", "工程", "行程", "几个", "多少名"]),
    ("判断推理", ["下列属于", "不符合", "由此可以推出", "削弱", "加强", "前提", "定义",
                  "类比", "逻辑", "图形", "推理", "批评", "质疑"]),
    ("言语理解与表达", ["填入划横线", "这段文字", "主旨", "概括", "排序", "意在", "划线", "语境"]),
    ("常识判断", ["不属于", "表述正确", "法律", "宪法", "民法", "科技", "生物", "物理",
                  "化学", "历史", "地理", "下列说法", "不正确的是"]),
]


def parse_json(text: str):
    m = re.search(r"\[.*\]", text, re.DOTALL)
    if not m:
        raise ValueError("响应中未找到 JSON 数组")
    return json.loads(m.group(0))


def call_llm(batch: list[dict]) -> dict[int, str]:
    gw = LLMGateway()
    lines = "\n".join(f"id={q['id']}: {q['stem']}" for q in batch)
    prompt = f"请标注以下题目的行测大类：\n{lines}"
    resp = gw.complete(prompt, system=SYSTEM, temperature=0.0, max_tokens=2000, use_fallback=True)
    arr = parse_json(resp.content)
    out: dict[int, str] = {}
    for item in arr:
        if isinstance(item, dict) and "id" in item and item.get("category") in CATEGORIES:
            out[int(item["id"])] = item["category"]
    return out


def heuristic(q: dict) -> str:
    s = q["stem"]
    for cat, kws in SIGNALS:
        if any(k in s for k in kws):
            return cat
    return "资料分析"  # 默认（这些题多为资料分析读图训练）


def main() -> None:
    db = os.environ["DATABASE_URL"]
    engine = create_engine(db)

    with engine.connect() as c:
        rows = c.execute(text(
            "SELECT id, substr(stem,1,160) FROM questions WHERE knowledge_point='待标注'"
        )).fetchall()
    qs = [{"id": int(r[0]), "stem": (r[1] or "")} for r in rows]
    print(f"待标注题总数: {len(qs)}")
    if not qs:
        return

    batch_size = 40
    results: dict[int, str] = {}
    for i in range(0, len(qs), batch_size):
        batch = qs[i:i + batch_size]
        try:
            got = call_llm(batch)
            for q in batch:
                results[q["id"]] = got.get(q["id"], heuristic(q))
            print(f"批次 {i // batch_size + 1}: LLM 标注 {len(got)}/{len(batch)} 条")
        except Exception as e:  # noqa: BLE001
            print(f"批次 {i // batch_size + 1} LLM 失败，启发式兜底: {e}")
            for q in batch:
                results[q["id"]] = heuristic(q)

    # 任何未覆盖的用启发式兜底
    for q in qs:
        results.setdefault(q["id"], heuristic(q))

    n = 0
    with engine.begin() as c:
        for qid, cat in results.items():
            c.execute(text(
                "UPDATE questions SET knowledge_point=:kp, category=:cat "
                "WHERE id=:id AND knowledge_point='待标注'"
            ), {"kp": cat, "cat": cat, "id": qid})
            n += 1
    print(f"已写回 {n} 条")

    with engine.connect() as c:
        remain = c.execute(text("SELECT count(*) FROM questions WHERE knowledge_point='待标注'")).scalar()
        stat = c.execute(text(
            "SELECT knowledge_point, count(*) FROM questions "
            "WHERE knowledge_point<>'待标注' GROUP BY knowledge_point ORDER BY 2 DESC LIMIT 8"
        )).fetchall()
        print("剩余待标注:", remain)
        print("新分布(前8):", [[r[0], r[1]] for r in stat])


if __name__ == "__main__":
    main()

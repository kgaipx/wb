"""生成三大行测大类（数量关系/资料分析/判断推理）的模块级方法论片段。

用途：题目 knowledge_point 绝大多数为粗粒度大类（数量关系 1658 / 资料分析 1525 /
判断推理 603 题），而知识库原只覆盖细分技能 kp。导致讲解大类题时 focus_kp 命不中，
RAG 缺「模块整体打法」锚点。本脚本补齐模块级总论，让 HybridRetriever 的 focus_kp
精确命中（kp==大类名，加成 0.35），讲解层次升级为「模块打法 → 本题技巧」。

输出 data/knowledge_bigcat.json：{"knowledge":[{kp,title,content,source}]}
幂等可重跑：已生成的大类会跳过。

生产执行（远端有 LLM_API_KEY）：
  PYTHONPATH=/opt/gwy/backend /opt/gwy/venv/bin/python scripts/gen_bigcat.py
"""
from __future__ import annotations

import json
import os
import sys
import time

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND not in sys.path:
    sys.path.insert(0, BACKEND)

from app.ai.llm_gateway import LLMGateway

OUT = os.path.join(BACKEND, "data", "knowledge_bigcat.json")
SYS = "你是资深公考行测讲师，擅长把模块级解题策略讲成可直接复用的干货。只输出严格 JSON。"

_BIG = {
    "数量关系": (
        "行测数量关系模块（数学运算）。题型含：工程/行程/容斥/利润/排列组合/几何/"
        "最值/年龄/时钟/溶液/牛吃草/植树/统筹等。特点是单题耗时高、区分度大。"
    ),
    "资料分析": (
        "行测资料分析模块（数据阅读+计算）。核心概念：增长率/增长量/比重/倍数/平均数/"
        "基期现期/进出口/贡献率等；依赖速算而非精算。"
    ),
    "判断推理": (
        "行测判断推理模块。四大题型：图形推理/定义判断/类比推理/逻辑判断"
        "（翻译推理/论证/削弱加强/前提假设）。重规律与逻辑模型。"
    ),
}
TARGET = 9


def _parse(txt: str) -> list[dict]:
    txt = txt.strip()
    if txt.startswith("```"):
        txt = txt.split("```", 2)[1]
        if txt.startswith("json"):
            txt = txt[4:]
    return json.loads(txt)


def gen_one(big: str, desc: str) -> list[dict]:
    g = LLMGateway()
    prompt = (
        f"为「{big}」模块撰写 {TARGET} 条通用备考方法论片段，用作 AI 私教讲解的模块级锚点。\n"
        f"模块说明：{desc}\n"
        "要求：每条聚焦一个可复用主题，建议覆盖（不限于）：\n"
        "  - 模块总论与考场时间预算（目标正确率、单题/单篇耗时红线）\n"
        "  - 整体取舍/抢分策略（哪些题型优先拿、哪些果断跳过）\n"
        "  - 核心解题工具或规律清单（如代入排除/赋值法；截位直除/差分法；图形规律/论证模型）\n"
        "  - 最高频易错陷阱（单位、范围、基期现期、偷换概念等）\n"
        "  - 与相邻模块的联动（如数量关系弱则资料分析也受影响）\n"
        '每条格式：{"title": "简洁标题", "content": "2-4 句干货，直击打法/易错/提速，可执行，避免空话与教科书腔"}\n'
        "只输出 JSON 数组，不要任何解释或代码块标记。"
    )
    resp = g.complete(prompt, system=SYS, temperature=0.4, max_tokens=2200)
    return _parse(resp.content)


def main() -> None:
    data: dict = {"knowledge": []}
    if os.path.exists(OUT):
        try:
            data = json.load(open(OUT, encoding="utf-8"))
        except Exception:
            data = {"knowledge": []}
    have = {d.get("kp") for d in data["knowledge"]}
    for big, desc in _BIG.items():
        if big in have:
            print("skip (already):", big, flush=True)
            continue
        print("generate:", big, flush=True)
        try:
            arr = gen_one(big, desc)
        except Exception as e:  # noqa: BLE001
            print("  ERR", big, repr(e), flush=True)
            continue
        for it in arr:
            title = (it.get("title") or "").strip()
            content = (it.get("content") or "").strip()
            if not title or not content:
                continue
            data["knowledge"].append(
                {
                    "kp": big,
                    "title": title,
                    "content": content,
                    "source": f"平台原创·行测{big}方法论",
                }
            )
        json.dump(data, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        print(f"  -> added {len(arr)} items; total={len(data['knowledge'])}", flush=True)
        time.sleep(1)
    print("DONE total=", len(data["knowledge"]), flush=True)


if __name__ == "__main__":
    main()

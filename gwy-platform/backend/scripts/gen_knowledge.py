"""语料批量生成：基于 DeepSeek 为 6 大类细分技能生成公考方法论文案。

产出 data/knowledge_gen.json（可断点续跑：已生成的 kp 跳过）。
每条 chunk: {kp, title, content, source}，content 含 公式/步骤/易错点/口诀（适用时）。
后续由 backfill_knowledge.py 按 content 幂等写入 knowledge_chunks（is_verified=True）。
"""
import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.ai.llm_gateway import LLMGateway

# (大类, kp 技能标签, 目标条数)
TAXONOMY = [
    # ===== 资料分析 =====
    ("资料分析", "增长率", 12),
    ("资料分析", "增长量", 8),
    ("资料分析", "基期现期", 8),
    ("资料分析", "比重", 12),
    ("资料分析", "平均数", 8),
    ("资料分析", "倍数", 6),
    ("资料分析", "速算技巧", 10),
    ("资料分析", "隔年增长率", 4),
    ("资料分析", "进出口", 6),
    ("资料分析", "拉动增长", 3),
    ("资料分析", "贡献率", 3),
    ("资料分析", "产销率", 2),
    ("资料分析", "利润率", 2),
    ("资料分析", "指数", 3),
    ("资料分析", "单位换算", 3),
    ("资料分析", "资料分析陷阱", 6),
    # ===== 数量关系 =====
    ("数量关系", "行程问题", 12),
    ("数量关系", "工程问题", 10),
    ("数量关系", "利润问题", 6),
    ("数量关系", "排列组合", 8),
    ("数量关系", "几何问题", 8),
    ("数量关系", "最值问题", 6),
    ("数量关系", "数列", 6),
    ("数量关系", "年龄问题", 3),
    ("数量关系", "时钟问题", 3),
    ("数量关系", "集合容斥", 4),
    ("数量关系", "代入排除法", 4),
    ("数量关系", "概率", 5),
    ("数量关系", "溶液", 3),
    ("数量关系", "牛吃草", 3),
    ("数量关系", "植树问题", 2),
    ("数量关系", "星期日期", 3),
    ("数量关系", "统筹优化", 3),
    ("数量关系", "过河问题", 2),
    # ===== 判断推理 =====
    ("判断推理", "图形推理", 16),
    ("判断推理", "定义判断", 6),
    ("判断推理", "类比推理", 8),
    ("判断推理", "翻译推理", 6),
    ("判断推理", "削弱论证", 6),
    ("判断推理", "加强论证", 6),
    ("判断推理", "逻辑判断", 8),
    ("判断推理", "集合推理", 4),
    ("判断推理", "前提假设", 4),
    ("判断推理", "解释评价", 4),
    # ===== 言语理解与表达 =====
    ("言语理解与表达", "逻辑填空", 14),
    ("言语理解与表达", "片段阅读", 16),
    ("言语理解与表达", "语句排序", 8),
    ("言语理解与表达", "病句辨析", 6),
    ("言语理解与表达", "语句填空", 6),
    ("言语理解与表达", "词语辨析", 6),
    ("言语理解与表达", "标点符号", 4),
    # ===== 常识判断 =====
    ("常识判断", "法律常识", 14),
    ("常识判断", "历史常识", 12),
    ("常识判断", "科技常识", 10),
    ("常识判断", "经济常识", 8),
    ("常识判断", "时政常识", 6),
    ("常识判断", "公文常识", 4),
    ("常识判断", "地理常识", 4),
    ("常识判断", "人文常识", 4),
    # ===== 申论 =====
    ("申论", "归纳概括", 8),
    ("申论", "提出对策", 8),
    ("申论", "综合分析", 10),
    ("申论", "贯彻执行", 8),
    ("申论", "大作文", 16),
]

_SYSTEM = (
    "你是资深公务员考试教研专家，精通行测与申论解题方法。只输出准确、可操作的方法论，"
    "不得编造错误公式或虚假法律条文。语言精炼、用中文。"
)

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "knowledge_gen.json")


def _load_done() -> list:
    """返回已生成的全部 chunk 列表（保留同 kp 的多条，勿按 kp 折叠）。"""
    if os.path.exists(OUT):
        try:
            data = json.load(open(OUT, encoding="utf-8"))
            return list(data.get("knowledge", []))
        except Exception:
            return []
    return []


def _parse_chunks(text: str) -> list[dict]:
    # 优先整体 JSON 数组
    m = re.search(r"\[.*\]", text, re.DOTALL)
    if m:
        try:
            arr = json.loads(m.group(0))
            if isinstance(arr, list):
                return [x for x in arr if isinstance(x, dict) and x.get("content")]
        except Exception:
            # 截断兜底：取最后一个 ] 之前的子串尝试解析
            end = m.group(0).rfind("]")
            if end > 0:
                try:
                    arr = json.loads(m.group(0)[: end + 1])
                    if isinstance(arr, list):
                        return [x for x in arr if isinstance(x, dict) and x.get("content")]
                except Exception:
                    pass
    # 兜底：按 ```json 代码块
    m = re.search(r"```json\s*(.*?)```", text, re.DOTALL)
    if m:
        try:
            arr = json.loads(m.group(1))
            if isinstance(arr, list):
                return [x for x in arr if isinstance(x, dict) and x.get("content")]
        except Exception:
            pass
    return []


def _gen_one(gw: LLMGateway, cat: str, kp: str, n: int) -> list[dict]:
    prompt = (
        f"针对公务员考试的【{cat}】模块下的知识点【{kp}】，生成 {n} 条相互独立的方法论文案，"
        f"覆盖该知识点最常见、最易考的子类或题型。\n\n"
        f"每条文案要求：\n"
        f"1. title：简短标题（如『增长率-间隔增长率公式』），不超过 20 字；\n"
        f"2. content：200 字内，结构含【核心公式/结论】【解题步骤】【易错点】【记忆口诀（如适用）】四部分，"
        f"公式必须准确（如增长率 r=增长量/基期量=(现期-基期)/基期），步骤可操作，易错点具体。\n\n"
        f"返回严格 JSON 数组，元素格式：{{\"title\": str, \"content\": str}}。不要任何解释文字，只返回 JSON。"
    )
    # n 较大时放大 token 预算，避免 JSON 被截断导致解析失败
    max_tokens = min(4000, 400 + 260 * n)
    resp = gw.complete(prompt, system=_SYSTEM, temperature=0.4, max_tokens=max_tokens, use_fallback=True)
    chunks = _parse_chunks(resp.content)
    out = []
    for c in chunks:
        out.append({
            "kp": kp,
            "title": str(c.get("title", kp))[:60],
            "content": str(c["content"]).strip(),
            "source": f"公考方法论-{cat}",
        })
    return out


def main() -> None:
    gw = LLMGateway()
    done = _load_done()
    # 已完成的 kp 集合（断点续跑，保留同 kp 的多条）
    done_kps = {c["kp"] for c in done}
    all_out: list[dict] = list(done)
    total_target = sum(n for _, _, n in TAXONOMY)
    print(f"taxonomy 目标条数={total_target}; 已完成 kp={len(done_kps)}; 已生成条数={len(all_out)}")

    pending = [(cat, kp, n) for (cat, kp, n) in TAXONOMY if kp not in done_kps]
    print(f"待生成 kp 数={len(pending)}")

    for i, (cat, kp, n) in enumerate(pending, 1):
        try:
            chunks = _gen_one(gw, cat, kp, n)
        except Exception as e:  # noqa: BLE001
            print(f"[{i}/{len(pending)}] {kp} 生成失败: {e}")
            time.sleep(2)
            continue
        # 去重（按 content 前 40 字）
        seen = {c["content"][:40] for c in all_out}
        added = 0
        for c in chunks:
            key = c["content"][:40]
            if key not in seen:
                seen.add(key)
                all_out.append(c)
                added += 1
        print(f"[{i}/{len(pending)}] {kp}: 生成 {len(chunks)} 条, 新增 {added} 条 (累计 {len(all_out)})")
        # 每完成一个 kp 即落盘，断点续跑
        json.dump({"knowledge": all_out}, open(OUT, "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)
        time.sleep(0.5)

    json.dump({"knowledge": all_out}, open(OUT, "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print(f"完成：共 {len(all_out)} 条生成文案 -> {OUT}")


if __name__ == "__main__":
    main()

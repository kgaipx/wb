"""政治理论 1000 题 PDF 解析 → 标准 JSON（供 ingest 入库）。
处理要点：
- 文本层 PDF（fitz 提取），清理页码噪声
- 题号切分：识别行首题号 + 行内粘连题号（"D、xxx89．xxx" 选项与下一题粘连）
- 选项提取 A-H，兼容同行内联/多行
- 题型：单选 1-700 / 多选 701-900 / 判断 901-1000（判断题无选项，( ) 填空 → 答案对/错）
- 已知：PDF 原档缺 981 题（980 后直接 982）
"""
import fitz
import json
import re
import sys
from pathlib import Path

PDF = Path(r"C:/Users/hp/WorkBuddy/2026-08-04-15-27-40/gwy-platform/backend/data/incoming/【2026年国省考】政治理论题1000题.pdf")
OUT = Path(__file__).resolve().parent / "politics_theory_1000.json"

doc = fitz.open(str(PDF))
full = "\n".join(doc[i].get_text() for i in range(len(doc)))

# --- 清理 ---
full = re.sub(r"(?m)^\s*\d{1,3}\s*/\s*\d{1,3}\s*$", "", full)  # 页码 "153 / 155"
full = re.sub(r"(?m)^\s*\d{1,3}\s*$", "", full)                  # 孤立页码
full = full.replace("( | )", "()").replace("(  )", "()").replace("(   )", "()").replace("( )", "()")

# --- 分段 ---
i1 = full.find("一、单选题")
i2 = full.find("二、多选题")
i3 = full.find("三、判断题")
assert i1 >= 0 and i2 >= 0 and i3 >= 0, "找不到题型分段"

RE_QNUM = re.compile(r"(?<!\d)(\d{1,4})[．.、]\s*")

def split_questions(seg):
    """按题号切分，兼容行内粘连：一行内出现多个 'N．' 时按题号切。"""
    qs, cur = [], None
    for raw_ln in seg.split("\n"):
        ln = raw_ln.rstrip()
        hits = list(RE_QNUM.finditer(ln))
        # 保留行首题号 + 行内粘连题号。行内粘连判定（双规则）：
        #  (a) 该题号之前的同一行内出现过选项标记 [A-H][、.．)]（选项文本以汉字/引号等结尾紧跟下一题号）
        #  (b) 前一字符是句子结束标点/引号/书名号（如 '。942．'）
        valid = []
        for h in hits:
            if h.start() == 0:
                valid.append(h)
            else:
                pre = ln[: h.start()]
                has_opt_marker = bool(re.search(r"[A-Ha-h][、.．)]", pre))
                last_ch = pre.strip()[-1:] if pre.strip() else ""
                has_end_punct = bool(re.search(r"[。！？；：，、）)」》\"]", last_ch))
                if has_opt_marker or has_end_punct:
                    valid.append(h)
        if not valid:
            if cur:
                cur["lines"].append(ln)
            continue
        for idx, h in enumerate(valid):
            body = ln[h.end():]
            if idx == 0 and cur is not None and h.start() > 0:
                # 行首之前还有上一题残余文本，追加到上一题
                cur["lines"].append(ln[: h.start()].rstrip())
            if cur:
                qs.append(cur)
            cur = {"n": int(h.group(1)), "lines": [body] if body.strip() else []}
    if cur:
        qs.append(cur)
    return qs

RE_OPT = re.compile(r"(?<![A-Za-z])([A-H])[、.．]\s*")

def parse_options(qtext):
    """提取选项。返回 (opts_dict, stem_clean)。stem 含题干，opts 按 A-H 键。
    特例：若选项序列从 B/C/D 开始（A、前缀在文本层丢失），自动补 'A、'。"""
    markers = list(RE_OPT.finditer(qtext))
    if not markers:
        return {}, qtext.strip()
    # 从第一个 A 开始（要求后续有 B/C/D 连续）
    start = None
    for i, m in enumerate(markers):
        if m.group(1) == "A":
            seq = [mk.group(1) for mk in markers[i : i + 4]]
            if seq and seq[0] == "A" and (len(seq) == 1 or seq[1] in "BCD"):
                start = i
                break
    if start is None:
        # 无 A 起始：检查是否从 B/C/D 开始（A、丢失）
        if markers and markers[0].group(1) in "BCD":
            first_pos = markers[0].start()
            repaired = qtext[:first_pos] + "A、" + qtext[first_pos:]
            return parse_options(repaired)
        return {}, qtext.strip()
    opts = {}
    ms = markers[start:]
    for j, m in enumerate(ms):
        s = m.end()
        e = ms[j + 1].start() if j + 1 < len(ms) else len(qtext)
        opts[m.group(1)] = qtext[s:e].strip().replace("\n", " ").strip()
    stem = qtext[: ms[0].start()].strip()
    return opts, stem

def clean_stem(stem, n):
    stem = re.sub(rf"^\s*{n}[．.、]\s*", "", stem).strip()
    # 清理残留 "( )" 与多余空格
    stem = re.sub(r"\s+", " ", stem)
    return stem

def build(seg, qtype, exp_range):
    qs = split_questions(seg)
    out = []
    nums = [q["n"] for q in qs]
    # 校验连续性
    missing = [n for n in exp_range if n not in set(nums)]
    dup = {n for n in nums if nums.count(n) > 1}
    for q in qs:
        joined = "\n".join(q["lines"])
        if qtype == "judge":
            # 判断题无选项；但若解析出 A-D 选项（如判断题区混入的客观题 929），
            # 标为 pending，待答案阶段按答案字母数定为 single/multi
            opts, stem_raw = parse_options(joined)
            if len(opts) >= 2:
                stem = clean_stem(stem_raw, q["n"])
                out.append({
                    "n": q["n"], "qtype": "pending", "stem": stem,
                    "options": opts, "answer": None, "analysis": None,
                })
            else:
                stem = clean_stem(joined, q["n"])
                out.append({
                    "n": q["n"], "qtype": "judge", "stem": stem,
                    "options": [], "answer": None, "analysis": None,
                })
        else:
            opts, stem_raw = parse_options(joined)
            stem = clean_stem(stem_raw, q["n"])
            out.append({
                "n": q["n"], "qtype": "single" if qtype == "single" else "multi",
                "stem": stem, "options": opts,
                "answer": None, "analysis": None,
            })
    return out, missing, dup

dan, m1, d1 = build(full[i1:i2], "single", range(1, 701))
duo, m2, d2 = build(full[i2:i3], "multi", range(701, 901))
pan, m3, d3 = build(full[i3:], "judge", range(901, 1001))

print(f"单选: {len(dan)} 题 | 缺: {m1} | 重复: {sorted(d1) if d1 else []}")
print(f"多选: {len(duo)} 题 | 缺: {m2} | 重复: {sorted(d2) if d2 else []}")
print(f"判断: {len(pan)} 题 | 缺: {m3} | 重复: {sorted(d3) if d3 else []}")
total = len(dan) + len(duo) + len(pan)
print(f"合计: {total} 题")

# 质量抽查：选项缺失/题干过短
bad_opt = [q["n"] for q in dan if len(q["options"]) < 4]
bad_opt += [q["n"] for q in duo if len(q["options"]) < 4]
short = [q["n"] for q in dan + duo + pan if len(q["stem"]) < 8]
print(f"选项<4个: {bad_opt[:15]} | 题干过短: {short[:15]}")

# 样例
q1 = next(q for q in dan if q["n"] == 5)
print("样例5:", q1["stem"][:60], "| opts:", {k: v[:15] for k, v in q1["options"].items()})
qj = next(q for q in pan if q["n"] == 901)
print("样例901(判断):", qj["stem"][:60])

# 特例修复：
# 1) 466：PDF 中选项为 ①②③④ 组合陈述（ABCD 组合行丢失，无法还原）→ 标记跳过（不入库）
# 2) 757：选项跨页乱序（B/C/D 被提取到 758 文本后）→ 依据答案 ABD + 解析手工重建选项
# 3) 981：题目 PDF 原档缺失（980 后直接 982），答案 PDF 有 981 → 标记缺失
allq = [{"n": q["n"], "qtype": q["qtype"], "stem": q["stem"], "options": q["options"],
         "answer": None, "analysis": None, "subject": "政治理论"} for q in dan + duo + pan]
allq.sort(key=lambda q: q["n"])
for q in allq:
    if q["n"] == 466:
        q["_skip"] = True
        q["_reason"] = "选项为①②③④组合陈述，ABCD组合行在PDF中缺失"
    if q["n"] == 757:
        q["options"] = {
            "A": "培育增长新动力",
            "B": "形成先发新优势",
            "C": "扩大出口新的途径",
            "D": "实现创新引领发展",
        }

# 写 JSON
allq = [q for q in allq if not q.get("_skip")]
with open(OUT, "w", encoding="utf-8") as f:
    json.dump({"total": len(allq), "questions": allq}, f, ensure_ascii=False, indent=1)
print(f"\n已写出 {OUT} 共 {len(allq)} 题（跳过 466，缺 981）")

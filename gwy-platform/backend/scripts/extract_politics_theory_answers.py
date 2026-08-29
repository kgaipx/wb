"""政治理论 1000 题 · 答案/解析 PDF 提取 → 合并到题目 JSON（v2 健壮版）。
兼容格式：
- 题号单独一行 "1." / 题号与【答案】同行 "147．【答案】C" / 题干+选项+【答案】同行 "253．题干...【答案】C"
- 【答案】后直接换行接【解析】；"答案】"缺左括号；答案行后行首残留字母（"A【解析】"）
- 判断题: 【答案】正确/错误
"""
import fitz
import json
import re
from pathlib import Path

ANSWER_PDF = Path(r"C:/Users/hp/WorkBuddy/2026-08-04-15-27-40/gwy-platform/backend/data/incoming/政治理论1000题（答案） (1).pdf")
QUESTIONS_JSON = Path(__file__).resolve().parent / "politics_theory_1000.json"

doc = fitz.open(str(ANSWER_PDF))
full = "\n".join(doc[i].get_text() for i in range(len(doc)))
full = re.sub(r"(?m)^\s*\d{1,3}\s*\|?\s*$", "", full)  # 页码 "1 |" / "24"

# 分段
i2 = full.find("二、多选题")
i3 = full.find("三、判断题")
seg_single = full[:i2]
seg_multi = full[i2:i3]
seg_judge = full[i3:]

RE_ANY_QNUM = re.compile(r"(\d{1,4})[．.、]")

def split_ans(seg, rng=None):
    """题号切分：行首 N．即视为新题起点。
    防护 1：同行出现 ≥2 个 'N.' → 视为解析正文的列举（如 '1.合法行政；2.xxx'），跳过。
    防护 2：rng 限定各段合法题号范围（单选1-700 / 多选701-900 / 判断901-1000）。"""
    entries, cur_n, cur_txt = [], None, []

    def accept(n):
        return True if rng is None else (rng[0] <= n <= rng[1])

    for raw_ln in seg.split("\n"):
        ln = raw_ln.rstrip()
        hits = list(RE_ANY_QNUM.finditer(ln))
        # 防护1：同行多个 'N.' → 解析正文的列举（如 '1.合法行政；2.xxx'），整行归入当前块
        if len(hits) >= 2:
            if cur_n is not None:
                cur_txt.append(ln)
            continue
        # 判定新题起点：行首题号，或行内题号且前一字符是句末标点（粘连，如 '答案选C。390．'）
        new_hit = None
        if hits:
            h = hits[0]
            if h.start() == 0:
                new_hit = h
            else:
                pre_ch = ln[: h.start()].strip()[-1:] if ln[: h.start()].strip() else ""
                if re.search(r"[。！？；]", pre_ch):
                    new_hit = h
        if new_hit is not None:
            n = int(new_hit.group(1))
            if accept(n):
                # 行内粘连时，题号前的残余文本归属上一题
                if new_hit.start() > 0 and cur_n is not None:
                    cur_txt.append(ln[: new_hit.start()].rstrip())
                if cur_n is not None:
                    entries.append((cur_n, "\n".join(cur_txt)))
                cur_n = n
                rest = ln[new_hit.end():]
                cur_txt = [rest] if rest.strip() else []
                continue
        if cur_n is not None:
            cur_txt.append(ln)
    if cur_n is not None:
        entries.append((cur_n, "\n".join(cur_txt)))
    return entries

# 答案提取：兼容 【答案】/答案】 后跟 单字母/多字母/正确/错误，跨行
RE_ANS_ABC = re.compile(r"[【\[]?\s*答案\s*[】\]]?\s*([A-H][A-H、，, ]*)")
RE_JUDGE_ANS = re.compile(r"[【\[]?\s*答案\s*[】\]]?\s*(正确|错误|对|错)")
RE_XUAN = re.compile(r"故\s*选\s*([A-H][A-H、，, ]*)")

def parse_single(text):
    # 多选/单选：取【答案】后 A-H 串
    m = RE_ANS_ABC.search(text)
    if m:
        raw = m.group(1)
        letters = re.findall(r"[A-H]", raw)
        if letters:
            return "".join(letters)
    mx = RE_XUAN.search(text)
    if mx:
        letters = re.findall(r"[A-H]", mx.group(1))
        if letters:
            return "".join(letters)
    return None

def parse_judge(text):
    m = RE_JUDGE_ANS.search(text)
    if m:
        return {"正确": "正确", "错误": "错误", "对": "正确", "错": "错误"}[m.group(1)]
    if re.search(r"故\s*正确", text): return "正确"
    if re.search(r"故\s*错误", text): return "错误"
    return None

def parse_explanation(text):
    m = re.search(r"[【\[]?\s*解析\s*[】\]]?\s*(.*)$", text, re.S)
    if m:
        return re.sub(r"\s+", "", m.group(1)).strip()
    return None

entries = []
for seg, jd, rng in ((seg_single, False, (1, 700)),
                     (seg_multi, False, (701, 900)),
                     (seg_judge, True, (901, 1000))):
    for n, txt in split_ans(seg, rng):
        entries.append((n, txt, jd))

ans_map = {}
prev = None  # (n, txt)
for n, txt, jd in entries:
    # 排版错位修复：同一题号出现两次时，若前一块"只有解析无答案"（如 836 的解析被错标成 837），
    # 则该解析归属前一题（N-1），前提 N-1 缺解析。
    if prev is not None and prev[0] == n and n in ans_map:
        p_txt = prev[1]
        if not re.search(r"答案\s*[】\]]", p_txt) and re.search(r"解析\s*[】\]]", p_txt):
            tgt = n - 1
            if tgt in ans_map and not ans_map[tgt].get("analysis"):
                ans_map[tgt]["analysis"] = parse_explanation(p_txt)
    d = ans_map.setdefault(n, {})
    d["answer"] = parse_judge(txt) if jd else parse_single(txt)
    # judge 段若混入客观题（如 929 实际是多选），额外保存字母型答案
    d["answer_abc"] = parse_single(txt) if jd else None
    d["analysis"] = parse_explanation(txt)
    prev = (n, txt)

# 载入题目 JSON
data = json.loads(QUESTIONS_JSON.read_text(encoding="utf-8"))
qs = data["questions"]
missing_ans, missing_ana = [], []
for q in qs:
    info = ans_map.get(q["n"])
    if not info:
        missing_ans.append(q["n"]); missing_ana.append(q["n"]); continue
    if q["qtype"] == "pending":
        # 判断题区混入的客观题（如 929 实为多选）→ 按字母答案定题型
        a = info.get("answer_abc")
        if a and all(c in "ABCDEFGH" for c in a):
            q["answer"] = a
            q["qtype"] = "single" if len(a) == 1 else "multi"
        else:
            q["answer"] = info.get("answer")
            q["qtype"] = "judge"
    else:
        q["answer"] = info.get("answer")
    q["analysis"] = info.get("analysis")
    if not q["answer"]: missing_ans.append(q["n"])
    if not q["analysis"]: missing_ana.append(q["n"])
extra = sorted(set(ans_map) - {q["n"] for q in qs})
print(f"答案覆盖: {len(ans_map)} 题号 | 题目数: {len(qs)}")
print(f"缺答案: {missing_ans} (共{len(missing_ans)})")
print(f"缺解析: {missing_ana} (共{len(missing_ana)})")
print(f"多余题号: {extra}")

judge_bad = [q["n"] for q in qs if q["qtype"]=="judge" and q.get("answer") not in ("正确","错误")]
print(f"判断题答案异常: {judge_bad}")
single_bad = [q["n"] for q in qs if q["qtype"]=="single" and q.get("answer") and len(q["answer"])!=1]
print(f"单选答案长度异常: {single_bad}")
multi_bad = [q["n"] for q in qs if q["qtype"]=="multi" and q.get("answer") and not re.fullmatch(r"[A-H]{2,6}", q["answer"] or "")]
print(f"多选答案格式异常: {multi_bad}")

for n in [1, 5, 43, 90, 253, 539, 702, 901, 924, 929]:
    q = next((q for q in qs if q["n"] == n), None)
    if q:
        print(f"题{n}: answer={q['answer']} ana={len(q['analysis'] or '')}")

with open(QUESTIONS_JSON, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=1)
print(f"\n已合并写入 {QUESTIONS_JSON}")

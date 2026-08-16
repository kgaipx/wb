"""OCR 上岸村 数量 解析册 -> 按回退分节的 list[{local_qnum: letter}]，支持断点续跑。

上岸村解析册每题明确写成  NN.【答案】X  （数字与【答案】之间可能为 . 。 、 或无分隔符）。
解析册与题本同为「按专项小节重排题号」结构（小节内从 1 重新编号），
因此不能用药扁平字典 {qnum:letter}（会跨小节互相覆盖，正是 ZG 资料分析翻车根因）。
本脚本仿 ingest_ocr.merge_answers 的切节逻辑：qnum 回退即新节起点，
产出 list[dict]（每节一个 {local_qnum:letter}），直接喂给 merge 阶段顺序配对。

把每页所有 OCR item 拼成整块再抽，防止 "5." 与 "【答案】B" 被拆成两条 item 漏匹配。
每 ckpt_every 页落盘（含未完成页索引，可断点续跑），防长任务被回收丢失。
"""
import sys, re, json, time
from pathlib import Path
sys.path.insert(0, "C:/Users/hp/.workbuddy/binaries/python/pkg")
sys.path.insert(0, "C:/Users/hp/WorkBuddy/2026-08-04-15-27-40/gwy-platform/backend")
from rapidocr_onnxruntime import RapidOCR
import fitz
from scripts.ingest_ocr import ocr_page

BASE = Path(r"C:/Users/hp/WorkBuddy/2026-08-04-15-27-40/gwy-platform/backend/data/incoming/【02】最新版上岸村刷题万题册")
P = list((BASE / "数量").glob("数量解析*.pdf"))[0]
OUT = "C:/Users/hp/WorkBuddy/2026-08-04-15-27-40/_daan_intermediate.json"
CKPT = "C:/Users/hp/WorkBuddy/2026-08-04-15-27-40/_daan_ckpt.json"
RE_ANS = re.compile(r"(\d{1,3})\s*[.。、．]?\s*【答案】\s*([ABCD])")

ocr = RapidOCR()
doc = fitz.open(str(P))
n = len(doc)

# ---- 断点续跑：恢复已完成的页索引 / sections / cur / prev_q ----
start_page = 0
sections = []
cur = {}
prev_q = None
if Path(CKPT).exists():
    try:
        snap = json.load(open(CKPT, encoding="utf-8"))
        start_page = snap["page"]
        sections = [dict(s) for s in snap["sections"]]
        cur = dict(snap["cur"])
        prev_q = snap.get("prev_q")
        print(f"[resume] from page {start_page+1}/{n}  sections={len(sections)} cur={len(cur)}", flush=True)
    except Exception as e:
        print(f"[resume] ckpt 损坏，从头开始: {e}", flush=True)
        start_page, sections, cur, prev_q = 0, [], {}, None

t0 = time.time()
for k in range(start_page, n):
    pi = k
    try:
        items = ocr_page(ocr, doc, pi, dpi=200)
    except Exception as e:
        print(f"  !! page {pi+1} OCR ERR {type(e).__name__}: {e}", flush=True)
        continue
    blob = " ".join(it["text"] for it in items)
    for qs, letter in RE_ANS.findall(blob):
        q = int(qs)
        if prev_q is not None and q < prev_q and cur:
            sections.append(cur)   # 回退 = 新专项节
            cur = {}
        cur[q] = letter            # 同节内后写覆盖（解析顺序安全）
        prev_q = q
    if (k - start_page) > 0 and (k - start_page) % 20 == 0:
        snap = {"page": k, "sections": sections, "cur": cur, "prev_q": prev_q}
        json.dump(snap, open(CKPT, "w", encoding="utf-8"), ensure_ascii=False)
        tot = sum(len(s) for s in sections) + len(cur)
        bounds = [(min(s), max(s)) for s in sections[-3:]]
        print(f"  [ckpt] page {pi+1}/{n}  sections={len(sections)} cur={len(cur)} answers={tot}  "
              f"sec_bounds={bounds}  {time.time()-t0:.0f}s", flush=True)
# 收尾
final = sections + ([cur] if cur else [])
json.dump(final, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
tot = sum(len(s) for s in final)
bounds = [(min(s), max(s)) for s in final]
print(f"DONE sections={len(final)} answers={tot} -> {OUT}  elapsed={time.time()-t0:.0f}s", flush=True)
print("section bounds (min,max):", bounds, flush=True)

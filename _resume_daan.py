import json, re, time, sys
from pathlib import Path
from rapidocr_onnxruntime import RapidOCR
import fitz
sys.path.insert(0, "C:/Users/hp/WorkBuddy/2026-08-04-15-27-40/gwy-platform/backend")
from scripts.ingest_ocr import ocr_page

CKPT = "C:/Users/hp/WorkBuddy/2026-08-04-15-27-40/_daan_ckpt.json"
OUT  = "C:/Users/hp/WorkBuddy/2026-08-04-15-27-40/_daan_final.json"
BASE = Path(r"C:/Users/hp/WorkBuddy/2026-08-04-15-27-40/gwy-platform/backend/data/incoming/【02】最新版上岸村刷题万题册")
P = list((BASE / "数量").glob("数量解析*.pdf"))[0]
RE_ANS = re.compile(r"(\d{1,3})\s*[.。、．]?\s*【答案】\s*([ABCD])")

ck = json.load(open(CKPT, encoding="utf-8"))
sections, cur, prev_q = ck["sections"], ck["cur"], ck["prev_q"]
start_pi = ck["page"]   # page=280 => pi 279 done, resume at pi=280

ocr = RapidOCR(); doc = fitz.open(str(P)); n = len(doc)
t0 = time.time()
print(f"resume from pi={start_pi} (page {start_pi+1}), total pages={n}", flush=True)
for pi in range(start_pi, n):
    items = ocr_page(ocr, doc, pi, dpi=200)
    j = "\n".join(it["text"] for it in items)
    for q, letter in RE_ANS.findall(j):
        q = int(q)
        if prev_q is not None and q <= prev_q:   # 小节结束，下一节开始
            sections.append(cur); cur = {}
        cur[q] = letter
        prev_q = q
doc.close()

final = sections + ([cur] if cur else [])
json.dump(final, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
tot = sum(len(s) for s in final)
bounds = [(min(s), max(s)) for s in final]
print(f"DONE sections={len(final)} answers={tot} -> {OUT}  elapsed={time.time()-t0:.0f}s", flush=True)
print("section bounds (min,max):", bounds, flush=True)

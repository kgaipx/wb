"""OCR 上岸村 数量 解析册 -> flat {qnum: letter} via 'NN.【答案】X'."""
import sys, re, json, time
from pathlib import Path
sys.path.insert(0, "C:/Users/hp/.workbuddy/binaries/python/pkg")
sys.path.insert(0, "C:/Users/hp/WorkBuddy/2026-08-04-15-27-40/gwy-platform/backend")
from rapidocr_onnxruntime import RapidOCR
import fitz
from scripts.ingest_ocr import ocr_page

BASE = Path(r"C:/Users/hp/WorkBuddy/2026-08-04-15-27-40/gwy-platform/backend/data/incoming/【02】最新版上岸村刷题万题册")
P = list((BASE / "数量").glob("数量解析*.pdf"))[0]
OUT = "C:/Users/hp/WorkBuddy/2026-08-04-15-27-40/_sc_sl_daan.json"
CKPT = "C:/Users/hp/WorkBuddy/2026-08-04-15-27-40/_sc_sl_daan_ckpt.json"
# 解析册答案头格式不稳定：数字与【答案】之间可能有点/句号/顿号/或无分隔符
RE_ANS = re.compile(r"(\d{1,3})\s*[.。、．]?\s*【答案】\s*([ABCD])")

ocr = RapidOCR()
doc = fitz.open(str(P))
n = len(doc)
ans = {}
t0 = time.time()
for pi in range(n):
    try:
        items = ocr_page(ocr, doc, pi, dpi=200)
    except Exception as e:
        print(f"  !! page {pi+1} OCR ERR {type(e).__name__}: {e}", flush=True)
        continue
    for it in items:
        for m in RE_ANS.finditer(it["text"]):
            q = int(m.group(1)); L = m.group(2)
            ans[q] = L   # last occurrence wins (解析 is sequential; safe)
    if (pi + 1) % 20 == 0:
        with open(CKPT, "w", encoding="utf-8") as f:
            json.dump(ans, f, ensure_ascii=False)
        print(f"  page {pi+1}/{n}  answers={len(ans)}  {time.time()-t0:.0f}s", flush=True)
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(ans, f, ensure_ascii=False, indent=2)
print(f"DONE answers={len(ans)} -> {OUT}  elapsed={time.time()-t0:.0f}s", flush=True)

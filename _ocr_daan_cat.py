import json, re, sys, time
from pathlib import Path
from rapidocr_onnxruntime import RapidOCR
import fitz
sys.path.insert(0, "C:/Users/hp/WorkBuddy/2026-08-04-15-27-40/gwy-platform/backend")
from scripts.ingest_ocr import ocr_page

CAT = sys.argv[1]
BASE = Path(r"C:/Users/hp/WorkBuddy/2026-08-04-15-27-40/gwy-platform/backend/data/incoming/【02】最新版上岸村刷题万题册")
# 所有解析本，按名序；去重（同大小视为副本，如 资料解析1.pdf == 资料解析1 (1).pdf）
PDFS = sorted([p for p in (BASE / CAT).glob("*解析*.pdf")], key=lambda p: p.name)
seen, uniq = set(), []
for p in PDFS:
    sz = p.stat().st_size
    if sz in seen:
        continue
    seen.add(sz); uniq.append(p)
PDFS = uniq
OUT = f"C:/Users/hp/WorkBuddy/2026-08-04-15-27-40/_daan_{CAT}.json"
CKPT = f"C:/Users/hp/WorkBuddy/2026-08-04-15-27-40/_daan_{CAT}_ckpt.json"
RE_ANS = re.compile(r"(\d{1,3})\s*[.。、．]?\s*【答案】\s*([ABCD])")

# flatten (pdf, page) across all 解析本
pages = []
for p in PDFS:
    d = fitz.open(str(p))
    for pi in range(len(d)):
        pages.append((str(p), pi))
    d.close()

# resume
if Path(CKPT).exists():
    ck = json.load(open(CKPT, encoding="utf-8"))
    sections, cur, prev_q, start_idx = ck["sections"], ck["cur"], ck["prev_q"], ck["idx"]
    print(f"[resume] {CAT} from page {start_idx}", flush=True)
else:
    sections, cur, prev_q, start_idx = [], {}, None, 0

ocr = RapidOCR(); t0 = time.time()
print(f"[{CAT}] 解析 {len(PDFS)} 本 共 {len(pages)} 页: {[p.name for p in PDFS]}", flush=True)
for i in range(start_idx, len(pages)):
    p, pi = pages[i]
    d = fitz.open(p)
    items = ocr_page(ocr, d, pi, dpi=200)
    d.close()
    j = "\n".join(it["text"] for it in items)
    for q, letter in RE_ANS.findall(j):
        q = int(q)
        if prev_q is not None and q <= prev_q:
            sections.append(cur); cur = {}
        cur[q] = letter
        prev_q = q
    if (i - start_idx) > 0 and (i - start_idx) % 20 == 0:
        snap = sections + ([cur] if cur else [])
        json.dump({"sections": snap, "cur": cur, "prev_q": prev_q, "idx": i + 1},
                  open(CKPT, "w", encoding="utf-8"), ensure_ascii=False)
        print(f"  [ckpt] {CAT} page {i+1}/{len(pages)} sec={len(snap)} ans={sum(len(s) for s in snap)} {time.time()-t0:.0f}s", flush=True)

final = sections + ([cur] if cur else [])
json.dump(final, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
print(f"[{CAT}] DONE sec={len(final)} ans={sum(len(s) for s in final)} -> {OUT} {time.time()-t0:.0f}s", flush=True)
print(f"[{CAT}] section bounds:", [(min(s), max(s)) for s in final], flush=True)

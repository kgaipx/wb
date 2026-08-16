import json, sys, time
from pathlib import Path
sys.path.insert(0, "C:/Users/hp/WorkBuddy/2026-08-04-15-27-40/gwy-platform/backend")
from rapidocr_onnxruntime import RapidOCR
import fitz
from scripts.ingest_ocr import ocr_page, parse_tiben_page

CAT = sys.argv[1]
CAT_MAP = {"常识": "常识判断", "言语": "言语理解与表达", "判断": "判断推理", "资料": "资料分析"}
CATEGORY = CAT_MAP[CAT]
SOURCE = f"上岸村·{CATEGORY}"
BASE = Path(r"C:/Users/hp/WorkBuddy/2026-08-04-15-27-40/gwy-platform/backend/data/incoming/【02】最新版上岸村刷题万题册")
# 题本 = 该科目录下不含"解析"的 pdf，按名序（一/二/三 对应 解析1/2/3）
PDFS = sorted([p for p in (BASE / CAT).glob("*.pdf") if "解析" not in p.name], key=lambda p: p.name)
OUT = f"C:/Users/hp/WorkBuddy/2026-08-04-15-27-40/_tiben_{CAT}.json"
CKPT = f"C:/Users/hp/WorkBuddy/2026-08-04-15-27-40/_tiben_{CAT}_ckpt.json"

# resume
if Path(CKPT).exists():
    ck = json.load(open(CKPT, encoding="utf-8"))
    all_qs, start_idx = ck["all_qs"], ck["idx"]
    print(f"[resume] {CAT} from page {start_idx}", flush=True)
else:
    all_qs, start_idx = [], 0

# flatten (pdf, page) list across all 题本
pages = []
for p in PDFS:
    d = fitz.open(str(p))
    for pi in range(len(d)):
        pages.append((str(p), pi))
    d.close()
print(f"[{CAT}] 题本 {len(PDFS)} 本, 共 {len(pages)} 页: {[p.name for p in PDFS]}", flush=True)

ocr = RapidOCR(); t0 = time.time()
for i in range(start_idx, len(pages)):
    p, pi = pages[i]
    d = fitz.open(p)
    items = ocr_page(ocr, d, pi, dpi=200)
    d.close()
    qs = parse_tiben_page(items, SOURCE, subject="行测", category=CATEGORY, qtype="single")
    all_qs.extend(qs)
    if (i - start_idx) > 0 and (i - start_idx) % 20 == 0:
        json.dump({"all_qs": all_qs, "idx": i + 1}, open(CKPT, "w", encoding="utf-8"), ensure_ascii=False)
        print(f"  [ckpt] {CAT} page {i+1}/{len(pages)} qs={len(all_qs)} {time.time()-t0:.0f}s", flush=True)

json.dump(all_qs, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
print(f"[{CAT}] DONE qs={len(all_qs)} -> {OUT} {time.time()-t0:.0f}s", flush=True)

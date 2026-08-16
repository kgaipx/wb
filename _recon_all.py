import fitz, re, sys, time
from pathlib import Path
sys.path.insert(0, "C:/Users/hp/WorkBuddy/2026-08-04-15-27-40/gwy-platform/backend")
from rapidocr_onnxruntime import RapidOCR
from scripts.ingest_ocr import ocr_page

BASE = Path(r"C:/Users/hp/WorkBuddy/2026-08-04-15-27-40/gwy-platform/backend/data/incoming/【02】最新版上岸村刷题万题册")
RE_ANS = re.compile(r"(\d{1,3})\s*[.。、．]?\s*【答案】\s*([ABCD])")
RE_TIBEN_Q = re.compile(r"^\s*(\d{1,3})[\.、．)]\s*")
ocr = RapidOCR()
t0 = time.time()

for cat in ["常识", "言语", "判断", "资料"]:
    cdir = BASE / cat
    if not cdir.exists():
        print(f"[{cat}] MISSING dir", flush=True); continue
    pdfs = sorted(cdir.glob("*.pdf"))
    tb = [p for p in pdfs if "解析" not in p.name]
    da = [p for p in pdfs if "解析" in p.name]
    print(f"\n=== {cat} ===", flush=True)
    print(f"  题本: {[p.name for p in tb]}", flush=True)
    print(f"  解析: {[p.name for p in da]}", flush=True)
    # 解析册答案格式抽样（前 8 页）
    if da:
        doc = fitz.open(str(da[0]))
        hits = 0; npages = len(doc)
        for pi in range(min(8, npages)):
            items = ocr_page(ocr, doc, pi, dpi=200)
            j = "\n".join(it["text"] for it in items)
            hits += len(RE_ANS.findall(j))
        print(f"  解析册(n={npages}) 前8页 【答案】命中={hits}", flush=True)
        doc.close()
    # 题本 qnum 抽样（前 3 页）
    if tb:
        doc = fitz.open(str(tb[0]))
        qn = 0
        for pi in range(min(3, len(doc))):
            items = ocr_page(ocr, doc, pi, dpi=200)
            for it in items:
                if RE_TIBEN_Q.match(it["text"]):
                    qn += 1
        print(f"  题本(n={len(doc)}) 前3页 题号行={qn}", flush=True)
        doc.close()

print(f"\nDONE recon in {time.time()-t0:.0f}s", flush=True)

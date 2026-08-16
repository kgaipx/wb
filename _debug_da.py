"""Debug 上岸村 数量 解析册 答案格式：OCR 前若干页，统计 NN.【答案】X 命中并抽样文本。"""
import sys, re, time
from pathlib import Path
sys.path.insert(0, "C:/Users/hp/.workbuddy/binaries/python/pkg")
sys.path.insert(0, "C:/Users/hp/WorkBuddy/2026-08-04-15-27-40/gwy-platform/backend")
from rapidocr_onnxruntime import RapidOCR
import fitz
from scripts.ingest_ocr import ocr_page

BASE = Path(r"C:/Users/hp/WorkBuddy/2026-08-04-15-27-40/gwy-platform/backend/data/incoming/【02】最新版上岸村刷题万题册")
P = list((BASE / "数量").glob("数量解析*.pdf"))[0]
RE_ANS = re.compile(r"(\d{1,3})\s*【答案】\s*([ABCD])")
RE_ANS2 = re.compile(r"(\d{1,3})\s*[.、]\s*(?:【?答案】?|答案[:：])\s*([ABCD])")
ocr = RapidOCR()
doc = fitz.open(str(P))
n = len(doc)
print("解析册 pages:", n)
total = 0
for pi in range(0, min(40, n)):
    items = ocr_page(ocr, doc, pi, dpi=200)
    texts = [it["text"] for it in items]
    joined = "\n".join(texts)
    m1 = RE_ANS.findall(joined)
    # also count any '答案' occurrences
    ans_kw = joined.count("答案")
    if pi < 6 or m1:
        print(f"\n=== page {pi+1}  re_ans={len(m1)} '答案'kw={ans_kw} ===")
        for t in texts[:20]:
            if "答案" in t or re.match(r"^\s*\d{1,3}", t):
                print("   ", t[:80])
    total += len(m1)
print("\nTOTAL matches in first 40 pages:", total)
doc.close()

"""Recon 上岸村 数量 pair: page counts + answer format + watermark."""
import sys, re
from pathlib import Path
sys.path.insert(0, "C:/Users/hp/.workbuddy/binaries/python/pkg")
from rapidocr_onnxruntime import RapidOCR
import fitz

BASE = Path(r"C:/Users/hp/WorkBuddy/2026-08-04-15-27-40/gwy-platform/backend/data/incoming/【02】最新版上岸村刷题万题册")
ocr = RapidOCR()
DPI = 150

def find(sub, pat):
    hits = list((BASE / sub).glob(pat))
    return hits[0] if hits else None

def peek(path, n_pages):
    doc = fitz.open(str(path))
    npages = len(doc)
    lines = []
    for pi in range(min(n_pages, npages)):
        pix = doc[pi].get_pixmap(dpi=DPI)
        tmp = f"C:/Users/hp/AppData/Local/Temp/_sc_{Path(path).stem}_{pi}.png"
        pix.save(tmp)
        res, _ = ocr(tmp)
        for box, t, sc in (res or []):
            if t and t.strip():
                lines.append(t.strip())
    doc.close()
    return npages, lines

tb = find("数量", "数量*.pdf")
da = find("数量", "数量解析*.pdf")
for label, p, npg in [("题本", tb, 2), ("解析", da, 3)]:
    if p is None:
        print(f"{label}: NOT FOUND"); continue
    n, lines = peek(p, npg)
    blob = "\n".join(lines)
    has_kuai = "答案速查" in blob
    has_xuan = bool(re.search(r"本题选[ABCD]|选择[ABCD]选项|答案为[ABCD]", blob))
    print(f"\n===== {label}: {p.name}  pages={n} =====")
    print(f"  答案速查格式: {has_kuai} | 本题选X格式: {has_xuan}")
    print(f"  --- first 25 OCR lines (page1-2) ---")
    for l in lines[:25]:
        print("   ", l[:70])

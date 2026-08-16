"""Probe 上岸村 数量 题本 middle pages: watermark + sample question layout."""
import sys
from pathlib import Path
sys.path.insert(0, "C:/Users/hp/.workbuddy/binaries/python/pkg")
from rapidocr_onnxruntime import RapidOCR
import fitz

BASE = Path(r"C:/Users/hp/WorkBuddy/2026-08-04-15-27-40/gwy-platform/backend/data/incoming/【02】最新版上岸村刷题万题册")
p = list((BASE / "数量").glob("数量*.pdf"))[0]
ocr = RapidOCR()
for pi in [9, 49, 99]:  # 0-based: pages 10, 50, 100
    doc = fitz.open(str(p))
    pix = doc[pi].get_pixmap(dpi=200)
    tmp = f"C:/Users/hp/AppData/Local/Temp/_sl_probe_{pi}.png"
    pix.save(tmp)
    res, _ = ocr(tmp)
    lines = [(t.strip(), round(float(sc),2)) for box, t, sc in (res or []) if t and t.strip()]
    doc.close()
    print(f"\n===== page {pi+1} ({len(lines)} lines) =====")
    for t, s in lines[:45]:
        print(f"  {s:.2f}  {t[:75]}")

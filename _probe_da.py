"""Probe 上岸村 数量 解析 deeper pages: confirm 本题选X + section structure."""
import sys
from pathlib import Path
sys.path.insert(0, "C:/Users/hp/.workbuddy/binaries/python/pkg")
from rapidocr_onnxruntime import RapidOCR
import fitz, re

BASE = Path(r"C:/Users/hp/WorkBuddy/2026-08-04-15-27-40/gwy-platform/backend/data/incoming/【02】最新版上岸村刷题万题册")
p = list((BASE / "数量").glob("数量解析*.pdf"))[0]
ocr = RapidOCR()
RE_SEC = re.compile(r"第[一二三四五六七八九十]+节")
RE_X = re.compile(r"本题选([ABCD])")
for pi in [29, 79, 149]:
    doc = fitz.open(str(p))
    pix = doc[pi].get_pixmap(dpi=200)
    tmp = f"C:/Users/hp/AppData/Local/Temp/_da_probe_{pi}.png"
    pix.save(tmp)
    res, _ = ocr(tmp)
    lines = [t.strip() for box, t, sc in (res or []) if t and t.strip()]
    doc.close()
    print(f"\n===== 解析 page {pi+1} ({len(lines)} lines) =====")
    sec = sum(1 for l in lines if RE_SEC.search(l))
    xs = sum(1 for l in lines if RE_X.search(l))
    print(f"  section-headers={sec}  本题选X={xs}")
    for l in lines[:40]:
        print("   ", l[:75])

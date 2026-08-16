"""Recon: OCR page-1 of each HT10000 PDF to classify (category, role) + page count."""
import os, sys, json, re
from pathlib import Path

BASE = r"C:/Users/hp/WorkBuddy/2026-08-04-15-27-40/gwy-platform/backend/data/incoming/【60】HT行测10000题PDF电子版共10册"
sys.path.insert(0, "C:/Users/hp/.workbuddy/binaries/python/pkg")
from rapidocr_onnxruntime import RapidOCR
import fitz

ocr = RapidOCR()
DPI = 150

KEYANS = re.compile(r"答案速查|本题选|详细解析|完整解析|思路点拨")
KEYCAT = {
    "常识": re.compile(r"常识"),
    "言语": re.compile(r"言语|逻辑填空|片段阅读"),
    "数量": re.compile(r"数量关系|数学运算"),
    "资料": re.compile(r"资料分析"),
    "判断": re.compile(r"判断推理|图形推理|逻辑判断|定义判断|类比推理"),
}

results = []
pdfs = sorted([p for p in Path(BASE).glob("*.pdf")], key=lambda p: int(p.stem))
for p in pdfs:
    try:
        doc = fitz.open(str(p))
        n = len(doc)
        pix = doc[0].get_pixmap(dpi=DPI)
        tmp = f"C:/Users/hp/AppData/Local/Temp/_recon_{p.stem}.png"
        pix.save(tmp)
        res, _ = ocr(tmp)
        lines = [t.strip() for box, t, sc in (res or []) if t and t.strip()]
        blob = "\n".join(lines)
        # classify role
        role = "答案册" if KEYANS.search(blob) else "题本?"
        # classify category: look at first ~40 lines for keywords
        cat = "未知"
        for name, rx in KEYCAT.items():
            if rx.search(blob[:1500]):
                cat = name
                break
        # also detect 答案速查 specifically
        if "答案速查" in blob:
            role = "答案册(速查)"
        results.append({
            "file": p.name, "pages": n, "role": role, "cat": cat,
            "head": blob[:160].replace("\n", " / ")
        })
        doc.close()
    except Exception as e:
        results.append({"file": p.name, "pages": -1, "role": "ERR", "cat": "?", "head": f"{type(e).__name__}: {e}"})

for r in results:
    print(f"{r['file']:>6s}  pages={r['pages']:>4d}  role={r['role']:<12s} cat={r['cat']:<4s}  {r['head'][:90]}")
json.dump(results, open("_recon_ht.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("\nsaved _recon_ht.json ; total PDFs:", len(results))

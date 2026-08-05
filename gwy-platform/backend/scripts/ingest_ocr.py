"""
OCR-based question-bank ingestion for SCANNED PDFs (no text layer).
Designed for 中公 5000题 format:
  - 题本: single-column stem + 2-column options (A/B top row, C/D bottom row)
  - 答案册: 章节开头有「答案速查」, answers in groups of 5 as letter runs

Pipeline: PyMuPDF renders pages -> rapidocr-onnxruntime OCR ->
spatial layout parse (bbox y/x sort) -> optional answer merge by q-num.

Outputs:
  Dry-run (default): writes _preview.json with parsed questions + stats.
  --import: writes to DB (Question + QuestionOption), dedupe by stem.

Usage:
  python scripts/ingest_ocr.py --tiben 路径/题本.pdf --daan 路径/答案.pdf [--import]
  python scripts/ingest_ocr.py --tiben ... --daan ... --pages 1 50   # only pages 1..50

NOTE: heavy. ~3-6 sec OCR per page. 160-page 题本 ~10 min locally.
"""
from __future__ import annotations
import argparse, json, os, re, sys, time
from pathlib import Path

# ensure backend/ on sys.path so `app.*` is importable when --import is used
_HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(_HERE.parent))

# ---------- layout constants ----------
RE_Q_START = re.compile(r"^\s*(\d{1,3})[\.、．)]\s*")  # 题号 5.
RE_Q_START_YEAR = re.compile(r"^\s*(\d{1,3})[\.、．)]\s*[（(]\d{4}")  # 5.（2018…
RE_OPT = re.compile(r"^\s*([A-D])[\.、．)]\s*(.*)$")
RE_FRAC = re.compile(r"^\d+/\d+$|^\d+\s+\d+/\d+$|^\d+$|^\.\s*\d+")
RE_ESSAY = re.compile(r"作答要求|请根据.*作答|请就.*作答|结合.*作答")

# Answer-key extraction (答案册)
RE_ANSWER_RANGE = re.compile(r"(\d{1,3})\s*[~\-～]\s*(\d{1,3})")
RE_ANSWER_KEY_HDR = re.compile(r"答案速查")
RE_LETTERS_ONLY = re.compile(r"^[A-D]+$")


def ocr_page(ocr_engine, doc, page_idx: int, dpi: int = 200) -> list[dict]:
    """Render one PDF page and OCR it. Return list of {box, text, score, y, x}."""
    pix = doc[page_idx].get_pixmap(dpi=dpi)
    tmp = f"C:/Users/hp/AppData/Local/Temp/_ocr_p{page_idx+1}.png"
    pix.save(tmp)
    res, _ = ocr_engine(tmp)
    out = []
    for box, txt, score in (res or []):
        t = (txt or "").strip()
        if not t:
            continue
        # box = [[x1,y1],[x2,y2],[x3,y3],[x4,y4]]
        xs = [pt[0] for pt in box]
        ys = [pt[1] for pt in box]
        y_top = min(ys)
        x_left = min(xs)
        try:
            sc = float(score)
        except Exception:
            sc = 0.0
        out.append({"box": box, "text": t, "score": sc, "y": y_top, "x": x_left,
                    "y_bot": max(ys), "x_right": max(xs)})
    # sort top->bottom, left->right
    out.sort(key=lambda r: (r["y"], r["x"]))
    return out


def cluster_rows(items: list[dict], y_tol: float = 12) -> list[list[dict]]:
    """Cluster items into rows by y_top within tolerance."""
    rows: list[list[dict]] = []
    for it in sorted(items, key=lambda r: r["y"]):
        placed = False
        for row in rows:
            ref = sum(r["y"] for r in row) / len(row)
            if abs(it["y"] - ref) <= y_tol:
                row.append(it)
                placed = True
                break
        if not placed:
            rows.append([it])
    # sort each row left->right and rows top->bottom
    for row in rows:
        row.sort(key=lambda r: r["x"])
    rows.sort(key=lambda row: sum(r["y"] for r in row) / len(row))
    return rows


# ---------- 题本 parser ----------
def is_question_start(text: str) -> int | None:
    """Return question number if line starts a question, else None."""
    # Common forms: "5." / "5、" / "5．" / "5."  followed by optional "（2018·江西）"
    if RE_Q_START_YEAR.match(text):
        m = RE_Q_START.match(text)
        return int(m.group(1)) if m else None
    # Plain "5." but only if the rest of the line is short (likely header) or starts a stem
    m = RE_Q_START.match(text)
    if m:
        num = int(m.group(1))
        # Heuristic: question numbers on these PDFs are 1..~1500. Reject
        # if num is huge (year fragments) or 0.
        if 1 <= num <= 2000:
            return num
    return None


def parse_tiben_page(items: list[dict], fname: str) -> list[dict]:
    """Parse one OCR'd 题本 page into 0..N questions using spatial layout."""
    if not items:
        return []
    # Filter obvious watermark/footer lines
    noise_kw = ("微信公众号", "登科及第", "全网考试资源免费分享",
                "QQ202", "来源于微", "RQQ", "国考小宝", "言语钩")
    cleaned = [it for it in items
               if not any(k in it["text"] for k in noise_kw)
               and len(it["text"]) >= 1]
    if not cleaned:
        return []

    # Cluster into rows
    rows = cluster_rows(cleaned, y_tol=10)

    # Build a flat list with row indices, then detect question starts
    flat = []  # (row_idx, item)
    for ri, row in enumerate(rows):
        for it in row:
            flat.append((ri, it))

    # Find question start indices (in flat list)
    q_indices = []
    for i, (_, it) in enumerate(flat):
        n = is_question_start(it["text"])
        if n is not None:
            # Disambiguate: if same row has another item that's clearly
            # an option label after a "5." we treat as question-start.
            q_indices.append((i, n))
    if not q_indices:
        return []

    questions = []
    for qi, (start_flat_idx, qnum) in enumerate(q_indices):
        end_flat_idx = q_indices[qi + 1][0] if qi + 1 < len(q_indices) else len(flat)
        block = flat[start_flat_idx + 1: end_flat_idx]
        if not block:
            continue

        # Include the question-start line's text (minus qnum prefix) in the stem
        qs_item = flat[start_flat_idx][1]
        qs_text = re.sub(r"^\s*\d{1,3}[\.、．)]\s*", "", qs_item["text"]).strip()

        # Within this question block, find option labels (rows containing A. B. C. D.)
        # First, identify rows that contain an option-start item
        opt_row_indices = {}  # row_idx -> list of item indices in block
        for bi, (ri, it) in enumerate(block):
            m = RE_OPT.match(it["text"])
            if m:
                opt_row_indices.setdefault(ri, []).append(bi)
        if not opt_row_indices:
            # No options on this page-block -> skip (likely a continuation)
            continue
        first_opt_row = min(opt_row_indices.keys())
        # Stem items: all items in rows before first_opt_row (within this q-block)
        stem_items = [(ri, it) for ri, it in block if ri < first_opt_row]
        stem_tail = "".join(it["text"] for _, it in stem_items).strip()
        stem_text = (qs_text + " " + stem_tail).strip() if stem_tail else qs_text
        stem_text = re.sub(r"\s+", " ", stem_text)

        # Options: for each option-row, walk items left->right, splitting on label boundaries
        opt_block_by_row = {}
        for bi, (ri, it) in enumerate(block):
            if ri >= first_opt_row:
                opt_block_by_row.setdefault(ri, []).append(it)
        opt_rows_ri = sorted(opt_block_by_row.keys())
        options = []
        for ri in opt_rows_ri:
            row_items = sorted(opt_block_by_row.get(ri, []), key=lambda r: r["x"])
            current = None  # [label, content, is_correct]
            for it in row_items:
                m = RE_OPT.match(it["text"])
                if m:
                    if current:
                        options.append(current)
                    current = [m.group(1), (m.group(2) or "").strip(), False]
                else:
                    if current:
                        current[1] = (current[1] + " " + it["text"].strip()).strip()
            if current:
                options.append(current)
        # cleanup: collapse internal whitespace in option content
        for o in options:
            o[1] = re.sub(r"\s+", " ", o[1]).strip()
        if len(options) < 2 or len(options) > 4:
            continue
        options.sort(key=lambda o: o[0])

        questions.append({
            "subject": "行测",
            "category": "数量关系",
            "qtype": "single",
            "stem": stem_text,
            "difficulty": 3,
            "knowledge_point": "数量关系",
            "answer": None,  # filled later from 答案册
            "explanation": None,
            "options": options,
            "source": fname,
            "copyright_owner": "导入-待核实",
            "is_verified": False,
            "_qnum": qnum,
        })
    return questions


# ---------- 答案册 parser ----------
def extract_answer_keys(ocr_engine, doc, fname: str,
                        page_indices: list[int] | None = None) -> dict[int, str]:
    """OCR the 答案 PDF, extract {qnum: 'A'} from 「答案速查」 sections.
    Each 答案速查 block contains entries like '1~5 BABCC' (group of 5).
    """
    if page_indices is None:
        page_indices = list(range(len(doc)))
    answers: dict[int, str] = {}
    in_key_section = False
    last_end_qnum = 0
    for pi in page_indices:
        items = ocr_page(ocr_engine, doc, pi)
        if not items:
            continue
        text_blob = " ".join(it["text"] for it in items)
        # Toggle key-section state
        if RE_ANSWER_KEY_HDR.search(text_blob):
            in_key_section = True
        # Only parse while in key section
        if not in_key_section:
            continue
        # Process each item looking for ranges and following letters
        for i, it in enumerate(items):
            t = it["text"]
            # Range form: "1~5" or "1 ~ 5" or "1-5"
            m = RE_ANSWER_RANGE.search(t)
            if not m:
                # Pure letters: attach to last seen range
                if RE_LETTERS_ONLY.match(t) and last_end_qnum:
                    n = len(t)
                    start_q = last_end_qnum - n + 1
                    for j, ch in enumerate(t):
                        answers[start_q + j] = ch
                continue
            start_q = int(m.group(1))
            end_q = int(m.group(2))
            # Letters may be on same line (e.g. "16~20CABCD") or next lines
            # Same-line remainder after range
            after = t[m.end():].strip()
            letters = ""
            if after and all(c in "ABCD" for c in after):
                letters = after
            else:
                # Look ahead in next items
                for j in range(i + 1, min(i + 4, len(items))):
                    nxt = items[j]["text"]
                    if RE_LETTERS_ONLY.match(nxt):
                        letters = nxt
                        break
                    if RE_ANSWER_RANGE.search(nxt) or RE_ANSWER_KEY_HDR.search(nxt):
                        break
                    if "[" in nxt or "完整解析" in nxt or "思路点拨" in nxt:
                        break
            if letters:
                for j, ch in enumerate(letters):
                    q = start_q + j
                    if q <= end_q:
                        answers[q] = ch
            last_end_qnum = end_q if end_q else last_end_qnum
    return answers


def merge_answers(questions: list[dict], answers: dict[int, str]) -> tuple[int, int]:
    """Map answers by question number. Returns (mapped_count, dropped_count)."""
    mapped = 0
    dropped = 0
    for q in questions:
        n = q.get("_qnum")
        if n is None:
            dropped += 1
            continue
        ans = answers.get(n)
        if ans and any(o[0] == ans for o in q["options"]):
            q["answer"] = ans
            # mark the correct option
            for o in q["options"]:
                o[2] = (o[0] == ans)
            mapped += 1
        else:
            dropped += 1
    return mapped, dropped


# ---------- DB import ----------
def import_to_db(questions: list[dict]):
    from app.db.session import SessionLocal
    from app.models import Question, QuestionOption
    db = SessionLocal()
    try:
        n_added = 0
        n_dup = 0
        for q in questions:
            # dedupe by stem (first 60 chars)
            stem_key = (q["stem"] or "")[:60]
            exists = db.query(Question).filter(
                Question.stem.like(stem_key + "%")
            ).first()
            if exists:
                n_dup += 1
                continue
            db_q = Question(
                subject=q["subject"],
                category=q["category"],
                qtype=q["qtype"],
                stem=q["stem"],
                difficulty=q["difficulty"],
                knowledge_point=q["knowledge_point"],
                answer=q.get("answer"),
                explanation=q.get("explanation"),
                source=q["source"],
                copyright_owner=q["copyright_owner"],
                is_verified=q["is_verified"],
            )
            db.add(db_q)
            db.flush()
            for label, content, is_correct in q["options"]:
                db.add(QuestionOption(
                    question_id=db_q.id,
                    label=label,
                    content=content,
                    is_correct=is_correct,
                ))
            n_added += 1
        db.commit()
        return n_added, n_dup
    finally:
        db.close()


# ---------- main ----------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tiben", required=True, help="题本 PDF 路径")
    ap.add_argument("--daan", help="答案 PDF 路径（可选）")
    ap.add_argument("--pages", nargs="+", type=int, help="仅处理题本指定 1-based 页码（调试用）")
    ap.add_argument("--daan-pages", nargs="+", type=int, help="仅 OCR 答案册指定 1-based 页码（调试用）")
    ap.add_argument("--import", dest="do_import", action="store_true",
                    help="写入数据库（默认仅预览）")
    ap.add_argument("--preview", default="_preview_ocr.json")
    ap.add_argument("--dpi", type=int, default=200)
    ap.add_argument("--source-name", help="覆盖 source 字段")
    args = ap.parse_args()

    from rapidocr_onnxruntime import RapidOCR
    import fitz

    print("[OCR] init engine...", flush=True)
    ocr = RapidOCR()

    # --- 题本 OCR + parse ---
    print(f"[题本] {args.tiben}", flush=True)
    doc_tiben = fitz.open(args.tiben)
    fname = args.source_name or os.path.basename(args.tiben)
    pages = list(range(len(doc_tiben)))
    if args.pages:
        pages = [p - 1 for p in args.pages if 1 <= p <= len(doc_tiben)]
    all_qs = []
    t0 = time.time()
    for pi in pages:
        items = ocr_page(ocr, doc_tiben, pi, dpi=args.dpi)
        qs = parse_tiben_page(items, fname)
        all_qs.extend(qs)
        if (pi - pages[0]) % 10 == 0:
            print(f"  page {pi+1}/{len(pages)}  qs so far={len(all_qs)}  "
                  f"elapsed={time.time()-t0:.0f}s", flush=True)
    print(f"[题本] parsed {len(all_qs)} questions from {len(pages)} pages "
          f"in {time.time()-t0:.0f}s", flush=True)

    # --- 答案册 OCR + extract ---
    answers = {}
    if args.daan:
        print(f"[答案] {args.daan}", flush=True)
        doc_daan = fitz.open(args.daan)
        daan_pages = list(range(len(doc_daan)))
        if args.daan_pages:
            daan_pages = [p - 1 for p in args.daan_pages if 1 <= p <= len(doc_daan)]
        answers = extract_answer_keys(ocr, doc_daan, os.path.basename(args.daan),
                                      page_indices=daan_pages)
        print(f"[答案] extracted answers for {len(answers)} question numbers",
              flush=True)

    # --- merge answers ---
    mapped, dropped = merge_answers(all_qs, answers)
    print(f"[merge] answer mapped={mapped}, dropped={dropped}", flush=True)

    # --- filter: keep only 2-4 options + (have answer OR keep anyway) ---
    valid = [q for q in all_qs if 2 <= len(q["options"]) <= 4]
    # drop garbage stem
    valid = [q for q in valid if len(q["stem"]) >= 5
             and not q["stem"].startswith("[")]

    # --- preview stats ---
    from collections import Counter
    print("\n=== PREVIEW STATS ===", flush=True)
    print(f"total parsed: {len(all_qs)}", flush=True)
    print(f"valid (2-4 opts, stem>=5): {len(valid)}", flush=True)
    ans_have = sum(1 for q in valid if q.get("answer"))
    print(f"with answer: {ans_have} ({ans_have / max(1, len(valid)) * 100:.0f}%)",
          flush=True)
    bad_ans = sum(1 for q in valid if q.get("answer") and
                  not any(o[0] == q["answer"] for o in q["options"]))
    print(f"WRONG-answer (not in options): {bad_ans}", flush=True)
    optc = Counter(len(q["options"]) for q in valid)
    print(f"options dist: {dict(sorted(optc.items()))}", flush=True)

    # write preview
    with open(args.preview, "w", encoding="utf-8") as f:
        json.dump(valid, f, ensure_ascii=False, indent=2)
    print(f"preview -> {args.preview}", flush=True)

    # show 3 samples
    for i, q in enumerate(valid[:3]):
        print(f"\n  sample#{i} qnum={q.get('_qnum')} ans={q.get('answer')}", flush=True)
        print(f"    stem: {q['stem'][:80]}", flush=True)
        for o in q["options"]:
            mark = " *" if o[2] else ""
            print(f"    {o[0]}. {o[1][:60]}{mark}", flush=True)

    # --- import ---
    if args.do_import:
        n_added, n_dup = import_to_db(valid)
        print(f"\n[DB] inserted={n_added}  duplicates={n_dup}", flush=True)
    else:
        print("\n[dry-run] pass --import to write to DB", flush=True)


if __name__ == "__main__":
    main()
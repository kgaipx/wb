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


def parse_tiben_page(items: list[dict], fname: str,
                     subject: str = "行测",
                     category: str = "数量关系",
                     qtype: str = "single") -> list[dict]:
    """Parse one OCR'd 题本 page into 0..N questions using spatial layout.

    subject/category/qtype are configurable because OCR 题库不止数量关系
    (常识判断 / 判断推理 也需要用本管线).
    """
    if not items:
        return []
    # Filter obvious watermark/footer lines
    noise_kw = ("微信公众号", "登科及第", "全网考试资源免费分享",
                "QQ202", "来源于微", "RQQ", "国考小宝", "言语钩",
                "名师一点", "胜庸师百万", "名师教育", "花生十三",
                "齐麟数资", "站长申论", "李梦娇常识", "欣说言语")
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
            "subject": subject,
            "category": category,
            "qtype": qtype,
            "stem": stem_text,
            "difficulty": 3,
            "knowledge_point": category,
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
                        page_indices: list[int] | None = None,
                        ckpt_path: str | None = None,
                        ckpt_every: int = 20,
                        page_texts: list | None = None) -> list[dict[int, str]]:
    """OCR 答案册，按「答案速查」分节抽取，返回 [ {qnum:letter}, ... ]。

    公考答案册每小节独立编号（1..N），每节一条「答案速查」（如 p4 第一节夯实基础、
    p11 高分进阶 各自从 1 重新编号）。若用扁平字典 {qnum:letter} 会不同小节互相覆盖，
    故必须按节分开放。每 ckpt_every 页将节列表落盘，防长任务被回收丢失。
    """
    if page_indices is None:
        page_indices = list(range(len(doc)))
    sections: list[dict[int, str]] = []
    cur: dict[int, str] = {}
    in_key = False
    quick_ref_ended = False
    last_end_qnum = 0
    t0 = time.time()
    for k, pi in enumerate(page_indices):
        try:
            if page_texts is not None:
                items = [{"text": t} for t in page_texts[pi]]
            else:
                items = ocr_page(ocr_engine, doc, pi)
        except Exception as e:
            print(f"  !! daan page {pi+1} OCR ERROR: {type(e).__name__}: {e}", flush=True)
            continue
        if not items:
            continue
        text_blob = " ".join(it["text"] for it in items)
        # 新小节边界：遇到「答案速查」头，收尾上一节并开始新节
        if RE_ANSWER_KEY_HDR.search(text_blob):
            if cur:
                sections.append(cur)
            cur = {}
            in_key = True
            quick_ref_ended = False
            last_end_qnum = 0
        if not in_key:
            continue
        # 处理本页 range + letters 写入当前节 cur
        for i, it in enumerate(items):
            t = it["text"]
            # 进入详细解析段：本页后续 item 不再抽答案（防解析段误抽字母）
            # 必须按文本顺序判断，因「答案速查」与「详细解析」常同页（速查在前）
            if "详细解析" in t or "完整解析" in t or "思路点拨" in t:
                quick_ref_ended = True
                break
            # 逐匹配提取范围及其紧跟字母（处理 "1~5 CCBDC 6~10 CDADC" 同条情况）
            hit_range = False
            for rm in RE_ANSWER_RANGE.finditer(t):
                hit_range = True
                start_q = int(rm.group(1))
                end_q = int(rm.group(2))
                # 同一条 item 内、紧跟范围之后的字母
                rest = t[rm.end():]
                lm = re.match(r"\s*([ABCD]+)", rest)
                letters = lm.group(1) if lm else None
                if not letters:
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
                    for jj, ch in enumerate(letters):
                        q = start_q + jj
                        if q <= end_q:
                            cur[q] = ch
                    last_end_qnum = end_q
            if hit_range:
                continue
            # 纯字母串：归属到上一个范围（兜底）
            if RE_LETTERS_ONLY.match(t) and last_end_qnum:
                n = len(t)
                start_q = last_end_qnum - n + 1
                for jj, ch in enumerate(t):
                    cur[start_q + jj] = ch
        # 每 5 页一行进度（诊断卡页用，flush 保证实时落盘）
        if k % 5 == 0:
            print(f"  [daan] page {pi+1}/{len(doc)}  "
                  f"sections={len(sections)}  elapsed={time.time()-t0:.0f}s", flush=True)
        # 每 ckpt_every 页 checkpoint 落盘，防进程被回收/崩溃丢失
        # 注意：把当前未闭合的 cur 也一并落盘，避免崩溃时丢失最后一个小节
        if ckpt_path and k > 0 and k % ckpt_every == 0:
            snapshot = sections + ([cur] if cur else [])
            with open(ckpt_path, "w", encoding="utf-8") as f:
                json.dump(snapshot, f, ensure_ascii=False)
            tot = sum(len(s) for s in snapshot)
            print(f"  [ckpt] daan page {pi+1}/{len(doc)}  "
                  f"sections={len(snapshot)} answers={tot}  "
                  f"elapsed={time.time()-t0:.0f}s -> {ckpt_path}", flush=True)
    # 收尾：把最后一个未闭合小节并入（与 checkpoint 快照一致，不重复）
    return sections + ([cur] if cur else [])
    return sections


def merge_answers(questions: list[dict], answers) -> tuple[int, int]:
    """按小节配对答案。answers 可为：
    - list[dict[qnum,letter]]：分节答案（推荐；公考每节重编号，扁平字典会互相覆盖）
    - dict[qnum,letter]：旧版扁平答案（仅适合全局编号场景，本类书慎用）
    题本按 _qnum 回退切分小节，与答案小节按顺序配对；返回 (mapped, dropped)。
    每节打印配对率，便于发现小节错位。
    """
    # --- 题本切分小节：_qnum 回退（减小）即新节起点 ---
    tiben_secs: list[list[dict]] = []
    cur_sec: list[dict] = []
    prev_q = None
    for q in questions:
        n = q.get("_qnum")
        if n is None:
            cur_sec.append(q)
            continue
        if prev_q is not None and n < prev_q:
            if cur_sec:
                tiben_secs.append(cur_sec)
            cur_sec = []
        cur_sec.append(q)
        prev_q = n
    if cur_sec:
        tiben_secs.append(cur_sec)
    # 折叠过小的小节（解析噪声产生的伪小节）到前一节
    MIN_SEC = 4
    folded: list[list[dict]] = []
    for sec in tiben_secs:
        if folded and len(sec) < MIN_SEC:
            folded[-1].extend(sec)
        else:
            folded.append(sec)
    tiben_secs = folded

    # --- 答案分节 ---
    if isinstance(answers, dict):
        ans_secs: list[dict] = [answers]   # 旧版扁平：退化成单节
    else:
        ans_secs = answers or []

    mapped = 0
    dropped = 0
    for i, sec in enumerate(tiben_secs):
        ans_sec = ans_secs[i] if i < len(ans_secs) else {}
        sec_map = 0
        for q in sec:
            n = q.get("_qnum")
            if n is None:
                dropped += 1
                continue
            ans = ans_sec.get(str(n)) if isinstance(ans_sec, dict) else None
            if ans is None and isinstance(ans_sec, dict):
                ans = ans_sec.get(n)  # 兼容 int 键
            if ans and any(o[0] == ans for o in q["options"]):
                q["answer"] = ans
                for o in q["options"]:
                    o[2] = (o[0] == ans)
                mapped += 1
                sec_map += 1
            else:
                dropped += 1
        rate = sec_map / max(1, len(sec)) * 100
        print(f"  [sec {i}] tiben={len(sec)} ans_avail={len(ans_sec)} "
              f"mapped={sec_map} ({rate:.0f}%)", flush=True)
    if len(tiben_secs) != len(ans_secs):
        print(f"  [WARN] 题本小节数 {len(tiben_secs)} != 答案小节数 {len(ans_secs)}，"
              f"可能存在小节错位，请核对样本", flush=True)
    return mapped, dropped


# ---------- DB import ----------
def import_to_db(questions: list[dict], require_answer: bool = True,
                 min_options: int = 4):
    """写入 Question + QuestionOption。质量闸门：
    - min_options: 选项数不足则跳过（避免残缺题）
    - require_answer: 答案无效（空或不在选项内）则跳过（避免无法判分）
    返回 (n_added, n_dup, n_skipped)。
    """
    from app.db.session import SessionLocal
    from app.models import Question, QuestionOption
    db = SessionLocal()
    try:
        n_added = 0
        n_dup = 0
        n_skipped = 0
        for q in questions:
            opts = q.get("options", [])
            labels = [o[0] for o in opts]
            if min_options and len(opts) < min_options:
                n_skipped += 1
                continue
            ans = q.get("answer")
            if require_answer and (not ans or ans not in labels):
                n_skipped += 1
                continue
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
        return n_added, n_dup, n_skipped
    finally:
        db.close()


# ---------- main ----------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tiben", help="题本 PDF 路径（OCR 模式，与 --from-json 二选一）")
    ap.add_argument("--daan", help="答案 PDF 路径（可选，OCR 模式）")
    ap.add_argument("--pages", nargs="+", type=int, help="仅处理题本指定 1-based 页码（调试用）")
    ap.add_argument("--daan-pages", nargs="+", type=int, help="仅 OCR 答案册指定 1-based 页码（调试用）")
    ap.add_argument("--from-json", help="直接从已生成的预览 JSON 导入（跳过 OCR，无需 PDF/引擎）")
    ap.add_argument("--import", dest="do_import", action="store_true",
                    help="写入数据库（默认仅预览）")
    ap.add_argument("--preview", default="_preview_ocr.json")
    ap.add_argument("--dpi", type=int, default=200)
    ap.add_argument("--source-name", help="覆盖 source 字段")
    ap.add_argument("--subject", default="行测", help="题目大类（默认 行测）")
    ap.add_argument("--category", default="数量关系",
                    help="题目细分科目；常识判断/判断推理 等须显式指定")
    ap.add_argument("--qtype", default="single", help="题型（默认 single 单选）")
    ap.add_argument("--min-options", type=int, default=4,
                    help="导入最少选项数（默认 4：只导入完整 4 选项题；设 2 可放宽）")
    ap.add_argument("--stage", choices=["all", "tiben", "daan", "daan-collect", "merge"], default="all",
                    help="分阶段运行：tiben=仅OCR题本(落盘), daan=仅OCR答案册(落盘), "
                         "daan-collect=拼接所有 _daan_chunk_*.json 为 daan-out, "
                         "merge=从中间文件配对+预览+导入, all=原全流程。避免长任务被杀丢失")
    ap.add_argument("--tiben-out", default="_tiben_intermediate.json",
                    help="题本中间结果落盘路径（stage=tiben 写 / merge 读）")
    ap.add_argument("--daan-out", default="_daan_intermediate.json",
                    help="答案册中间结果落盘路径（stage=daan 写 / merge 读）")
    args = ap.parse_args()

    # ---------- 直接 JSON 导入模式（无需 OCR 引擎，可在服务器运行） ----------
    if args.from_json:
        print(f"[from-json] {args.from_json}", flush=True)
        valid = json.load(open(args.from_json, encoding="utf-8"))
        # 与 OCR 路径一致的轻量过滤
        valid = [q for q in valid
                 if 2 <= len(q.get("options", [])) <= 4
                 and len(q.get("stem") or "") >= 5
                 and not (q.get("stem") or "").startswith("[")]
        from collections import Counter
        print("\n=== FROM-JSON STATS ===", flush=True)
        print(f"loaded: {len(valid)}", flush=True)
        ans_ok = sum(1 for q in valid
                     if q.get("answer") and any(o[0] == q["answer"] for o in q["options"]))
        print(f"with valid answer: {ans_ok} ({ans_ok / max(1, len(valid)) * 100:.0f}%)",
              flush=True)
        print(f"options dist: {dict(sorted(Counter(len(q['options']) for q in valid).items()))}",
              flush=True)
        if args.do_import:
            n_added, n_dup, n_skipped = import_to_db(
                valid, require_answer=True, min_options=args.min_options)
            print(f"\n[DB] inserted={n_added}  duplicates={n_dup}  "
                  f"skipped(no-ans/<{args.min_options}-opt)={n_skipped}", flush=True)
        else:
            print("\n[dry-run] pass --import to write to DB", flush=True)
        return

    # ---------- OCR 模式（需要 rapidocr + PyMuPDF） ----------
    from rapidocr_onnxruntime import RapidOCR
    import fitz

    if not args.tiben and args.stage in ("all", "tiben"):
        ap.error("--tiben 必填（除非使用 --from-json 或纯 --stage merge）")

    all_qs = None
    answers = {}
    if args.stage not in ("merge", "daan-collect"):
        print("[OCR] init engine...", flush=True)
        ocr = RapidOCR()

    # --- 题本 OCR + parse（可独立落盘，防长任务被杀）---
    if args.stage in ("all", "tiben"):
        print(f"[题本] {args.tiben}", flush=True)
        doc_tiben = fitz.open(args.tiben)
        fname = args.source_name or os.path.basename(args.tiben)
        pages = list(range(len(doc_tiben)))
        if args.pages:
            pages = [p - 1 for p in args.pages if 1 <= p <= len(doc_tiben)]
        all_qs = []
        t0 = time.time()
        for pi in pages:
            try:
                items = ocr_page(ocr, doc_tiben, pi, dpi=args.dpi)
                qs = parse_tiben_page(items, fname,
                                       subject=args.subject,
                                       category=args.category,
                                       qtype=args.qtype)
                all_qs.extend(qs)
            except Exception as e:
                print(f"  !! page {pi+1} ERROR: {type(e).__name__}: {e}", flush=True)
            # 每 20 页 checkpoint 落盘，避免进程被杀丢失
            if (pi - pages[0]) % 20 == 0:
                with open(args.tiben_out, "w", encoding="utf-8") as f:
                    json.dump(all_qs, f, ensure_ascii=False)
                print(f"  [ckpt] page {pi+1}/{len(pages)}  qs={len(all_qs)}  "
                      f"elapsed={time.time()-t0:.0f}s -> {args.tiben_out}", flush=True)
        with open(args.tiben_out, "w", encoding="utf-8") as f:
            json.dump(all_qs, f, ensure_ascii=False)
        print(f"[题本] parsed {len(all_qs)} questions -> {args.tiben_out} "
              f"in {time.time()-t0:.0f}s", flush=True)
        if args.stage == "tiben":
            return  # 仅题本阶段，落盘后退出

    # --- 答案册 OCR + extract ---
    if args.stage in ("all", "daan"):
        if args.daan:
            print(f"[答案] {args.daan}", flush=True)
            try:
                doc_daan = fitz.open(args.daan)
                daan_pages = list(range(len(doc_daan)))
                if args.daan_pages:
                    daan_pages = [p - 1 for p in args.daan_pages if 1 <= p <= len(doc_daan)]
                answers = extract_answer_keys(ocr, doc_daan, os.path.basename(args.daan),
                                              page_indices=daan_pages,
                                              ckpt_path=args.daan_out,
                                              ckpt_every=20)
                with open(args.daan_out, "w", encoding="utf-8") as f:
                    json.dump(answers, f, ensure_ascii=False)
                tot = sum(len(s) for s in answers)
                print(f"[答案] extracted {len(answers)} sections, {tot} answers "
                      f"-> {args.daan_out}", flush=True)
            except Exception as e:
                print(f"[答案] ERROR: {type(e).__name__}: {e}", flush=True)
        else:
            print("[答案] 无 --daan，跳过答案册", flush=True)
        if args.stage == "daan":
            return

    # --- daan-collect 阶段：拼接所有 _daan_chunk_*.json（按页范围排序）---
    if args.stage == "daan-collect":
        import glob as _glob
        chunks = _glob.glob("_daan_chunk_*.json")
        if not chunks:
            print("[daan-collect] 未找到 _daan_chunk_*.json", flush=True)
            return
        # 解析文件名中的起始页用于排序，如 _daan_chunk_1_60.json -> 1
        def _start(f):
            try:
                return int(f.replace("\\", "/").split("_daan_chunk_")[1].split("_")[0])
            except Exception:
                return 0
        chunks.sort(key=_start)
        merged: list = []
        for c in chunks:
            part = json.load(open(c, encoding="utf-8"))
            if isinstance(part, list):
                merged.extend(part)
        with open(args.daan_out, "w", encoding="utf-8") as f:
            json.dump(merged, f, ensure_ascii=False)
        tot = sum(len(s) for s in merged)
        print(f"[daan-collect] {len(chunks)} 块 -> {len(merged)} 小节 / {tot} 答案 "
              f"-> {args.daan_out}", flush=True)
        return

    # --- merge 阶段（all 或单独 merge 从中间文件读）---
    if args.stage in ("all", "merge"):
        if all_qs is None:
            if not os.path.exists(args.tiben_out):
                print(f"[merge] 缺少 {args.tiben_out}，请先 --stage tiben", flush=True)
                return
            all_qs = json.load(open(args.tiben_out, encoding="utf-8"))
            print(f"[merge] loaded {len(all_qs)} 题本 from {args.tiben_out}", flush=True)
        if not answers and os.path.exists(args.daan_out):
            answers = json.load(open(args.daan_out, encoding="utf-8"))
            if isinstance(answers, list):
                tot = sum(len(s) for s in answers)
                print(f"[merge] loaded {len(answers)} 答案小节 / {tot} 答案 "
                      f"from {args.daan_out}", flush=True)
            else:
                print(f"[merge] loaded {len(answers)} 答案(from legacy) "
                      f"from {args.daan_out}", flush=True)

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
            n_added, n_dup, n_skipped = import_to_db(
                valid, require_answer=True, min_options=args.min_options)
            print(f"\n[DB] inserted={n_added}  duplicates={n_dup}  "
                  f"skipped(no-ans/<{args.min_options}-opt)={n_skipped}", flush=True)
        else:
            print("\n[dry-run] pass --import to write to DB", flush=True)


if __name__ == "__main__":
    main()
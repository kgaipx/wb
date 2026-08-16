"""
Merge 上岸村 数量 题本(OCR) + 解析(OCR答案) by GLOBAL qnum.
题本: _sc_sl_tiben.json  (list of question dicts, each with _qnum)
解析: _sc_sl_daan.json  (flat {qnum:letter})
Output: _sc_sl_merged.json (questions with answer assigned where possible)
        + pairing/valid-answer stats (dry-run, NO DB write).
"""
import json, sys

TIBEN = "C:/Users/hp/WorkBuddy/2026-08-04-15-27-40/_sc_sl_tiben.json"
DAAN = "C:/Users/hp/WorkBuddy/2026-08-04-15-27-40/_sc_sl_daan.json"
OUT = "C:/Users/hp/WorkBuddy/2026-08-04-15-27-40/_sc_sl_merged.json"

tiben = json.load(open(TIBEN, encoding="utf-8"))
daan = json.load(open(DAAN, encoding="utf-8"))
print(f"题本 parsed: {len(tiben)} | 解析 answers: {len(daan)}", flush=True)

paired = 0
valid = 0          # answer present AND in options
no_ans = 0         # no matching daan entry
bad_ans = 0        # answer present but not in options (OCR letter mismatch)
opt_dist = {}
for q in tiben:
    labels = [o[0] for o in q.get("options", [])]
    opt_dist[len(labels)] = opt_dist.get(len(labels), 0) + 1
    qn = q.get("_qnum")
    L = daan.get(str(qn)) if qn is not None else None
    if L is None and qn is not None:
        L = daan.get(qn)
    if L is None:
        q["answer"] = None
        no_ans += 1
        continue
    paired += 1
    q["answer"] = L
    if L in labels:
        for o in q["options"]:
            o[2] = (o[0] == L)
        valid += 1
    else:
        bad_ans += 1
        # leave answer set but it will be rejected by quality gate / flagged

# keep only 2-4 option questions (mirror import filter) for the merged set
merged = [q for q in tiben if 2 <= len(q.get("options", [])) <= 4
          and len(q.get("stem") or "") >= 5
          and not (q.get("stem") or "").startswith("[")]
with_ans = sum(1 for q in merged if q.get("answer")
               and any(o[0] == q["answer"] for o in q["options"]))

print(f"\n=== PAIRING (all parsed) ===", flush=True)
print(f"  paired(qnum found in daan): {paired}", flush=True)
print(f"  valid answer(in options):   {valid}", flush=True)
print(f"  no daan entry:              {no_ans}", flush=True)
print(f"  bad answer(letter mismatch):{bad_ans}", flush=True)
print(f"  option-count dist: {dict(sorted(opt_dist.items()))}", flush=True)
print(f"\n=== MERGED (2-4 opts, stem>=5) ===", flush=True)
print(f"  merged total: {len(merged)}", flush=True)
print(f"  with valid answer: {with_ans} ({with_ans/max(1,len(merged))*100:.0f}%)", flush=True)

json.dump(merged, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print(f"\nmerged -> {OUT}", flush=True)

# show 3 samples (paired ones)
print("\n--- 3 sample paired questions ---", flush=True)
shown = 0
for q in merged:
    if q.get("answer"):
        print(f"  qnum={q.get('_qnum')} ans={q['answer']}  stem={q['stem'][:70]}", flush=True)
        for o in q["options"]:
            print(f"      {o[0]}. {o[1][:40]}{' *' if o[2] else ''}", flush=True)
        shown += 1
        if shown >= 3:
            break

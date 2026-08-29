"""政治理论题库入库（生产 gwy.db，幂等：按 stem 去重）。
用法（服务器端）：
  PYTHONPATH=/opt/gwy/backend /opt/gwy/venv/bin/python /tmp/import_politics_theory.py [--apply]
不带 --apply 为干跑预览。
"""
import json
import sqlite3
import sys
from datetime import datetime

DB = "/opt/gwy/data/gwy.db"
SRC = "/tmp/politics_theory_import.json"
APPLY = "--apply" in sys.argv

data = json.loads(open(SRC, encoding="utf-8").read())
qs = data["questions"]
print(f"待入库: {len(qs)} 题 | APPLY={APPLY}")

con = sqlite3.connect(DB)
cur = con.cursor()

# 已有题干集合（幂等去重）
existing = {r[0] for r in cur.execute("SELECT stem FROM questions").fetchall()}
print(f"库中现有题目: {len(existing)}")

to_insert = [q for q in qs if q["stem"] not in existing]
dup = [q["n"] for q in qs if q["stem"] in existing]
print(f"新增: {len(to_insert)} | 重复跳过: {len(dup)} {dup[:10]}")

if not APPLY:
    print("\n[干跑] 未写入。样例前 2 题：")
    for q in to_insert[:2]:
        print(f"  题{q['n']} [{q['qtype']}] {q['stem'][:50]}")
        for o in q["options"]:
            print(f"      {o['label']}. {o['content'][:30]} {'✓' if o['is_correct'] else ''}")
        print(f"      答案={q['answer']} 知识点={q['knowledge_point']} 解析={len(q['explanation'] or '')}字")
    con.close()
    sys.exit(0)

now = datetime.utcnow().isoformat(timespec="seconds")
inserted_q = inserted_o = 0
try:
    for q in to_insert:
        cur.execute(
            """INSERT INTO questions
               (subject, category, qtype, stem, difficulty, knowledge_point,
                answer, explanation, source, copyright_owner, is_verified, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (q["subject"], q["category"], q["qtype"], q["stem"], q["difficulty"],
             q["knowledge_point"], q["answer"], q["explanation"], q["source"],
             q["copyright_owner"], 0, now),
        )
        qid = cur.lastrowid
        inserted_q += 1
        for o in q["options"]:
            cur.execute(
                "INSERT INTO question_options (question_id, label, content, is_correct) VALUES (?,?,?,?)",
                (qid, o["label"], o["content"], 1 if o["is_correct"] else 0),
            )
            inserted_o += 1
    con.commit()
except Exception as e:
    con.rollback()
    print("入库失败，已回滚:", e)
    raise

print(f"\n已入库: {inserted_q} 题 / {inserted_o} 个选项")
print("政治理论分类题数:", cur.execute(
    "SELECT count(*) FROM questions WHERE subject='行测' AND category='政治理论'").fetchone()[0])
print("  按题型:", dict(cur.execute(
    "SELECT qtype, count(*) FROM questions WHERE category='政治理论' GROUP BY qtype").fetchall()))
print("全库总题数:", cur.execute("SELECT count(*) FROM questions").fetchone()[0])
print("无解析题数:", cur.execute(
    "SELECT count(*) FROM questions WHERE explanation IS NULL OR trim(explanation)=''").fetchone()[0])
con.close()

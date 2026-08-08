from app.db.session import SessionLocal
from app.models import KnowledgeChunk
from app.ai.rag import KnowledgeRetriever

r = KnowledgeRetriever()
db = SessionLocal()
cmap = {c.content: c.kp for c in db.query(KnowledgeChunk).all()}
db.close()

tests = [
    ("资料分析", "2023年某省GDP比上年增长多少，求增长率"),
    ("数量关系", "甲乙两人合作完成一项工程需要多少天"),
    ("判断推理", "下列选项中图形规律一致的是"),
    ("增长率", "求间隔增长率"),
    ("历史常识", "中国古代史相关题目"),
    ("经济利润", "某商品打折促销的利润率计算"),
    ("隔年增长率", "今年比前年增长百分之几"),
    ("大作文", "以乡村振兴为主题写一篇议论文"),
]
for fk, q in tests:
    chunks = r.retrieve(q, top_k=5, focus_kp=fk)
    print(f"=== focus_kp={fk} (q={q[:18]}…) ===")
    if not chunks:
        print("  (无召回)")
    for c in chunks:
        print(f"  score={c.score:<7} kp={cmap.get(c.content, '?')}")

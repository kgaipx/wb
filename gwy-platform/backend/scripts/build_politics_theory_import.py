"""政治理论 998 题 → 平台入库格式（questions + question_options）。
- 学科: 行测 / 分类: 政治理论（2026 国考新增板块）
- qtype: single(单选) / multiple(多选) / judge→single（判断题转 A=正确 B=错误，前端零改动即可作答）
- 知识点: 按题干关键词自动归类（后续可用 classify_pending_kp.py 细化）
- 版权: 第三方资料 → is_verified=False, copyright_owner="导入-待核实"
"""
import json
import re
from pathlib import Path

SRC = Path(__file__).resolve().parent / "politics_theory_1000.json"
OUT = Path(__file__).resolve().parent / "politics_theory_import.json"

# 知识点归类规则（按顺序命中，第一个匹配的为准）
# 注意：规则的“顺序 + 特异性”决定质量。泛词（文化/教育/历史/科技）已移除，避免误命中。
KP_RULES = [
    ("党的二十大", ["二十大", "二十届", "党的二十大报告"]),
    ("习近平新时代中国特色社会主义思想", [
        "习近平", "新时代中国特色社会主义思想", "中国式现代化", "四个意识", "四个自信", "两个维护",
        "两个确立", "人类命运共同体", "一带一路", "全过程人民民主", "新发展理念", "共同富裕",
        "总体国家安全观", "绿水青山就是金山银山", "精准扶贫", "脱贫攻坚", "中国式现代化道路"]),
    ("党史与党的建设", [
        "党章", "党史", "中共一大", "中共二大", "遵义会议", "延安整风", "三湾改编", "八七会议",
        "瓦窑堡", "古田会议", "党的七大", "党的八大", "十一届三中全会", "十二大", "十三大", "十四大",
        "十五大", "十六大", "十七大", "十八大", "十九大", "支部", "党员", "党纪", "党规", "廉政",
        "反腐败", "自我革命", "全面从严治党", "中央委员会", "政治局", "总书记", "党群", "统一战线",
        "党的领导", "党的建设", "党的作风", "入党", "党性"]),
    ("毛泽东思想", [
        "毛泽东", "毛泽东思想", "新民主主义", "《实践论》", "《矛盾论》", "《反对本本主义》",
        "农村包围城市", "星星之火", "井冈山", "《论持久战》", "为人民服务", "实事求是"]),
    ("中国特色社会主义理论体系", [
        "邓小平", "三个代表", "科学发展观", "江泽民", "胡锦涛", "社会主义初级阶段", "基本路线",
        "改革开放", "四项基本原则", "一国两制", "南方谈话", "社会主义市场经济", "小康社会"]),
    ("马克思主义基本原理", [
        "马克思主义", "马克思", "恩格斯", "辩证唯物主义", "历史唯物主义", "唯物论", "辩证法",
        "认识论", "生产力", "生产关系", "剩余价值", "《资本论》", "社会主义革命", "无产阶级",
        "科学社会主义", "意识形态", "社会存在", "社会意识"]),
    ("法治思想", ["法治", "依法治", "宪法", "民法典", "立法", "司法", "执法", "政法", "监察法",
                "行政处罚", "行政许可", "法律关系", "宪法修正案", "习近平法治思想"]),
    ("经济常识", ["经济", "供给侧", "金融", "财政", "税收", "市场", "宏观调控", "货币政策",
                "高质量发展", "新发展格局", "乡村振兴", "产业结构", "对外贸易", "国企改革"]),
    ("国家治理与公共管理", ["公共服务", "政府职能", "服务型政府", "行政管理", "公共管理", "公务员法",
                    "公文", "基层治理", "社会治理", "民族区域自治", "统一战线工作"]),
    ("时事政治", ["2022年", "2023年", "2024年", "2025年", "党的二十大以来", "今年以来", "近日", "当前"]),
]
DEFAULT_KP = "政治理论"

# 人工补答：答案册 PDF 原档缺这两题（417/649），经核对后补录。
# 来源标注为人工补答，is_verified 仍为 False（待核实），不冒充原书答案。
MANUAL_ANSWERS = {
    417: {
        "answer": "D",
        "explanation": (
            "1956年6月，周恩来在第一届全国人民代表大会第三次会议上首次公开提出和平解放台湾的主张，"
            "并宣布愿意在可能的条件下争取用和平方式解放台湾。1981年叶剑英发表“叶九条”进一步阐述，"
            "邓小平在此基础上提出“一国两制”构想，但首次公开提出者是周恩来。故选D。"
        ),
    },
    649: {
        "answer": "D",
        "explanation": (
            "毛泽东把辩证唯物主义和历史唯物主义的思想路线，用中国语言概括为“实事求是”四个大字。"
            "“实事求是”出自《汉书》，毛泽东在《改造我们的学习》中赋予其新的哲学内涵，"
            "使之成为党的思想路线的核心。故选D。"
        ),
    },
}


def classify_kp(stem: str) -> str:
    for kp, kws in KP_RULES:
        for kw in kws:
            if kw in stem:
                return kp
    return DEFAULT_KP


data = json.loads(SRC.read_text(encoding="utf-8"))
qs = data["questions"]

out = []
skipped = []
for q in qs:
    n, qtype, stem = q["n"], q["qtype"], q["stem"]
    ans = q.get("answer")
    ana = (q.get("analysis") or "").strip()
    manual = False
    if not ans and n in MANUAL_ANSWERS:
        # 答案册原档缺失 → 用人工核对后的补答，并在 source 中显式标注
        ans = MANUAL_ANSWERS[n]["answer"]
        ana = ana or MANUAL_ANSWERS[n]["explanation"]
        manual = True
    if not ans:
        skipped.append((n, "缺答案"))
        continue
    if not stem or len(stem) < 8:
        skipped.append((n, "题干过短"))
        continue

    opts = q.get("options") or {}
    if qtype == "judge":
        # 判断题 → single：A=正确 B=错误
        norm_ans = "A" if ans in ("正确", "对") else ("B" if ans in ("错误", "错") else None)
        if norm_ans is None:
            skipped.append((n, f"判断题答案异常 {ans}"))
            continue
        options = [
            {"label": "A", "content": "正确", "is_correct": norm_ans == "A"},
            {"label": "B", "content": "错误", "is_correct": norm_ans == "B"},
        ]
        final_qtype = "single"
        answer_text = "正确" if norm_ans == "A" else "错误"
    else:
        if len(opts) < 2:
            skipped.append((n, f"选项不足({len(opts)})"))
            continue
        final_qtype = "multiple" if qtype == "multi" else "single"
        letters = list(ans)
        unknown = [c for c in letters if c not in opts]
        if unknown:
            skipped.append((n, f"答案字母{unknown}不在选项中"))
            continue
        options = [
            {"label": lb, "content": opts[lb], "is_correct": lb in letters}
            for lb in sorted(opts.keys())
        ]
        answer_text = "".join(letters)

    out.append({
        "n": n,
        "subject": "行测",
        "category": "政治理论",
        "qtype": final_qtype,
        "stem": stem,
        "difficulty": 3,
        "knowledge_point": classify_kp(stem),
        "answer": answer_text,
        "explanation": ana or None,
        "source": "2026国省考政治理论1000题（人工补答·答案册原档缺失）" if manual else "2026国省考政治理论1000题",
        "copyright_owner": "导入-待核实",
        "is_verified": False,
        "options": options,
    })

print(f"可入库: {len(out)} 题 | 跳过: {len(skipped)}")
for s in skipped:
    print("   跳过:", s)

from collections import Counter
print("\n题型分布:", dict(Counter(q['qtype'] for q in out)))
print("知识点分布:")
for kp, c in Counter(q['knowledge_point'] for q in out).most_common():
    print(f"   {kp}: {c}")

no_ana = [q["n"] for q in out if not q["explanation"]]
print(f"\n无解析: {no_ana} (共{len(no_ana)})")

with open(OUT, "w", encoding="utf-8") as f:
    json.dump({"total": len(out), "questions": out}, f, ensure_ascii=False, indent=1)
print(f"\n已写出 {OUT}")

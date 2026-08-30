import { useEffect, useMemo, useRef, useState } from "react";
import { BrainIcon, PartyIcon, LightbulbIcon } from "../icons";

/* ============================================================
 * 考点速记卡 · 间隔重复（anki 式翻卡 + 艾宾浩斯排期）
 * 卡片内容：资料分析公式 / 常识速记 / 解题口诀 / 高频成语
 * 记忆状态（熟悉度 + 下次复习日）存本地，无后端依赖。
 * ============================================================ */

type DeckKey = "formula" | "common" | "trick" | "idiom";

interface Flashcard {
  id: string;
  deck: DeckKey;
  front: string;
  back: string;
  hint?: string;
}

interface CardState {
  level: number; // 0..6，6 = 已掌握
  due: string; // YYYY-MM-DD
}

const DECKS: Record<DeckKey, { label: string; color: string; bg: string }> = {
  formula: { label: "资料公式", color: "var(--brand)", bg: "var(--brand-050)" },
  common: { label: "常识速记", color: "var(--accent)", bg: "var(--accent-050)" },
  trick: { label: "解题口诀", color: "var(--warning)", bg: "var(--warning-050)" },
  idiom: { label: "高频成语", color: "var(--success)", bg: "var(--success-050)" },
};

// 艾宾浩斯复习间隔（天）：level 越高，间隔越长。
const SCHEDULE = [0, 1, 2, 4, 7, 15, 30];

const CARDS: Flashcard[] = [
  // —— 资料分析公式 ——
  { id: "f1", deck: "formula", front: "同比增长率", back: "r = (现期 − 基期) ÷ 基期 × 100%\n速算：r ≈ 现期/基期 − 1；增长量 = 现期 × r ÷ (1+r)" },
  { id: "f2", deck: "formula", front: "间隔增长率", back: "r = r₁ + r₂ + r₁ × r₂\n（连续两期增速分别为 r₁、r₂）" },
  { id: "f3", deck: "formula", front: "两期比重比较", back: "部分增速 > 整体增速 → 比重上升；\n比重差 = 现期比重 − 基期比重（同向，绝对值<两增速差）" },
  { id: "f4", deck: "formula", front: "平均数增长率", back: "r = (a − b) ÷ (1 + b)\na=总量增速，b=份数增速" },
  { id: "f5", deck: "formula", front: "拉动增长 / 贡献率", back: "拉动增长 = 部分增量 ÷ 整体基期 × 100%\n贡献率 = 部分增量 ÷ 总体增量 × 100%" },
  { id: "f6", deck: "formula", front: "百分点 vs 百分数", back: "百分点 = 百分数作差的单位（如 25%−20%=5 个百分点）\n不可与百分数直接加减混用" },
  { id: "f7", deck: "formula", front: "同比 vs 环比", back: "同比：与上年同期相比；\n环比：与紧邻的上一个统计周期相比" },
  { id: "f8", deck: "formula", front: "增长量速算（n 法）", back: "若 r = 1/n，则 增长量 = 现期 ÷ (n+1)\n例：r=25%=1/4 → 增量=现期/5" },
  { id: "f9", deck: "formula", front: "倍数与比重转换", back: "A 是 B 的 n 倍 → A/B=n；\n比重 = 部分/整体，与倍数互为倒数关系" },
  { id: "f10", deck: "formula", front: "平均数 = 总量 ÷ 份数", back: "注意“均/每/单位”提示平均数；\n倍数、比重、平均数统一为 A÷B 结构" },

  // —— 常识速记 ——
  { id: "c1", deck: "common", front: "根本政治制度", back: "人民代表大会制度", hint: "区别于基本政治制度（政协、民族区域自治、基层群众自治）" },
  { id: "c2", deck: "common", front: "《民法典》施行时间", back: "2021 年 1 月 1 日（新中国第一部以“法典”命名的法律）" },
  { id: "c3", deck: "common", front: "新发展理念", back: "创新、协调、绿色、开放、共享", hint: "创新居首位，是引领发展的第一动力" },
  { id: "c4", deck: "common", front: "三大攻坚战", back: "防范化解重大风险、精准脱贫、污染防治", hint: "脱贫已历史性解决，转入乡村振兴" },
  { id: "c5", deck: "common", front: "中国式现代化特征", back: "人口规模巨大、共同富裕、物质与精神协调、人与自然和谐、和平发展" },
  { id: "c6", deck: "common", front: "社会主义核心价值观", back: "国家：富强民主文明和谐；社会：自由平等公正法治；公民：爱国敬业诚信友善" },
  { id: "c7", deck: "common", front: "依宪治国定位", back: "宪法是根本法；依宪治国、依宪执政是全面依法治国的首要任务" },
  { id: "c8", deck: "common", front: "监察委员会", back: "独立于“一府两院”，行使国家监察职能的专责机关", hint: "2018 修宪设立" },
  { id: "c9", deck: "common", front: "乡村振兴总要求", back: "产业兴旺、生态宜居、乡风文明、治理有效、生活富裕" },
  { id: "c10", deck: "common", front: "全过程人民民主", back: "最广泛、最真实、最管用的民主", hint: "区别于西方选举式民主" },

  // —— 解题口诀 ——
  { id: "k1", deck: "trick", front: "言语·主旨题", back: "转折后是重点（但/然而）；\n因果结论是关键（因此/可见）；对策常是主旨" },
  { id: "k2", deck: "trick", front: "言语·逻辑填空", back: "找对应（前后文提示）、看搭配、辨色彩（褒贬中）", hint: "先语境后语素，不凭语感硬选" },
  { id: "k3", deck: "trick", front: "判断·图形推理", back: "点线角面素 + 对称 + 位置 + 遍历；\n属性（对称/曲直/封闭）优先于数量" },
  { id: "k4", deck: "trick", front: "判断·逻辑判断", back: "加强找搭桥、削弱找断桥；\n选项须紧扣论证结构，勿过度脑补" },
  { id: "k5", deck: "trick", front: "数量·代入排除", back: "选项代入、从简到繁、居中优先；\n不定方程、年龄、余数题首选", hint: "省时利器，能代就代" },
  { id: "k6", deck: "trick", front: "数量·工程问题", back: "赋值总量为公倍数；效率 = 总量 ÷ 时间", hint: "合作效率相加" },
  { id: "k7", deck: "trick", front: "资料·速算", back: "截位直除（选项差距大截两位）；\n分数比较：通分 / 差分 / 分子分母增速法" },
  { id: "k8", deck: "trick", front: "判断·类比推理", back: "先横后纵：先横向定关系，再纵向比词性/感情色彩", hint: "二级辨析保底" },
  { id: "k9", deck: "trick", front: "常识·排除法", back: "绝对化表述（“都/必然/绝对”）多错；\n符合主流价值与常识者优先", hint: "不会做时提分关键" },
  { id: "k10", deck: "trick", front: "数量·行程问题", back: "s = v × t；比例法优先；\n相遇合走、追及差走，画线段图" },

  // —— 高频成语 ——
  { id: "i1", deck: "idiom", front: "南辕北辙", back: "行动与目的相反", hint: "强调“方向错”，非简单“相反”" },
  { id: "i2", deck: "idiom", front: "相辅相成", back: "两者互相配合、互相促成，缺一不可" },
  { id: "i3", deck: "idiom", front: "一蹴而就", back: "一下子就成功（多用于否定：不能一蹴而就）", hint: "常误作褒义" },
  { id: "i4", deck: "idiom", front: "潜移默化", back: "不知不觉中受到影响（多用于好的方面）" },
  { id: "i5", deck: "idiom", front: "根深蒂固", back: "旧思想/旧习惯基础深、难改变（多含贬义）" },
  { id: "i6", deck: "idiom", front: "层出不穷", back: "接连不断地出现，没有穷尽" },
  { id: "i7", deck: "idiom", front: "息息相关 / 休戚相关", back: "息息相关：关系密切；\n休戚相关：祸福相连（含利害关系）", hint: "有祸福用休戚" },
  { id: "i8", deck: "idiom", front: "独树一帜", back: "独特新奇，自成一家或一派" },
  { id: "i9", deck: "idiom", front: "应运而生", back: "顺应时机而产生", hint: "强调“时代/需求催生”" },
  { id: "i10", deck: "idiom", front: "有的放矢", back: "说话做事有明确针对性（的=靶子）" },
];

const STATE_KEY = "gwy_flash_state";

function normDue(s: string | undefined): string {
  if (!s) return "2000-01-01";
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (!m) return s;
  const p = (x: string) => x.padStart(2, "0");
  return `${m[1]}-${p(m[2])}-${p(m[3])}`;
}
function loadState(): Record<string, CardState> {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    const obj = raw ? (JSON.parse(raw) as Record<string, CardState>) : {};
    // 兼容旧版未补零的 due（如 2026-8-5），统一为 YYYY-MM-DD 以便字典序比较
    for (const k of Object.keys(obj)) {
      if (obj[k]?.due) obj[k].due = normDue(obj[k].due);
    }
    return obj;
  } catch {
    return {};
  }
}
function saveState(s: Record<string, CardState>) {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
function dayStr(d: Date): string {
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function addDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return dayStr(d);
}
function dueFor(level: number): string {
  return addDays(SCHEDULE[Math.min(level, SCHEDULE.length - 1)]);
}
// 将 YYYY-MM-DD 显示为 M/D（如 2026-08-20 → 8/20），未掌握卡展示下次复习日。
function fmtDue(due?: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(due || "");
  if (!m) return "";
  return `${Number(m[2])}/${Number(m[3])}`;
}

export default function Flashcards() {
  const [states, setStates] = useState<Record<string, CardState>>(loadState);
  const [deck, setDeck] = useState<DeckKey | "all">("all");
  const [onlyDue, setOnlyDue] = useState(false);
  const [queue, setQueue] = useState<string[]>([]);
  const [qi, setQi] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reviewAll, setReviewAll] = useState(false); // 无待复习时强制复习全部
  const [sessionActive, setSessionActive] = useState(false); // 本轮学习是否已开始（用于区分初始页与完成页）
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => saveState(states), [states]);

  const allDue = useMemo(
    () => CARDS.filter((c) => (states[c.id]?.due || "2000-01-01") <= dayStr(new Date())),
    [states]
  );
  const mastered = useMemo(
    () => CARDS.filter((c) => (states[c.id]?.level ?? 0) >= 6).length,
    [states]
  );

  // 候选卡片（按 deck + 是否仅待复习筛选）
  const candidates = useMemo(() => {
    let list = CARDS;
    if (deck !== "all") list = list.filter((c) => c.deck === deck);
    if (onlyDue && !reviewAll) list = list.filter((c) => (states[c.id]?.due || "2000-01-01") <= dayStr(new Date()));
    return list;
  }, [deck, onlyDue, reviewAll, states]);

  const dueCount = allDue.length;
  const masteryPct = Math.round((mastered / CARDS.length) * 100);

  // 开始/重置本轮学习：取候选中的待复习卡；若无则取候选全部。
  function startSession() {
    const pool = candidates.filter(
      (c) => reviewAll || (states[c.id]?.due || "2000-01-01") <= dayStr(new Date())
    );
    const ids = (pool.length ? pool : candidates).map((c) => c.id);
    setQueue(ids);
    setQi(0);
    setFlipped(false);
    setSessionActive(true);
    setTimeout(() => cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  }

  const current = queue.length ? CARDS.find((c) => c.id === queue[qi]) : undefined;

  function grade(quality: "again" | "hard" | "good") {
    if (!current) return;
    const prev = states[current.id]?.level ?? 0;
    let level = prev;
    if (quality === "again") level = 0;
    else if (quality === "hard") level = Math.max(0, prev - 1);
    else level = Math.min(6, prev + 1);
    setStates((s) => ({ ...s, [current.id]: { level, due: dueFor(level) } }));
    // 进阶：again 的卡重新入队到末尾，其余跳过。
    // 队列重组后，原本 qi+1 的那张恰好落到新队列的索引 qi，
    // 故前进到 setQi(qi)（而非回到 0），避免每评一张被弹回队首。
    setQueue((q) => {
      const rest = q.slice(qi + 1);
      const trimmed = q.slice(0, qi);
      if (quality === "again") return [...trimmed, ...rest, current.id];
      return [...trimmed, ...rest];
    });
    setQi(qi);
    setFlipped(false);
  }

  function studyOne(id: string) {
    setQueue([id]);
    setQi(0);
    setFlipped(false);
    setSessionActive(true);
    setTimeout(() => cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  }

  // 完成态：本轮已开始，且当前卡已不存在（队列清空或指针越界）。
  // 注意：最后一张「认识/模糊」后队列被清空，原来 `queue.length>0` 的写法会让完成页永不可达。
  const sessionDone = sessionActive && !current;

  return (
    <section>
      {/* Hero */}
      <div className="hero flash-hero">
        <div className="hero__title">考点速记卡</div>
        <div className="hero__sub">间隔重复记忆 · 资料公式 / 常识 / 口诀 / 成语</div>
        <div className="flash-ring-wrap">
          <Ring pct={masteryPct} label="已掌握" />
        </div>
      </div>

      {/* 统计 */}
      <div className="grid-3 mat-stats">
        <div className="metric">
          <div className="metric__num">{CARDS.length}</div>
          <div className="metric__label">卡片总量</div>
        </div>
        <div className="metric">
          <div className="metric__num" style={{ color: dueCount ? "var(--warning)" : "var(--success)" }}>
            {dueCount}
          </div>
          <div className="metric__label">今日待复习</div>
        </div>
        <div className="metric">
          <div className="metric__num" style={{ color: "var(--success)" }}>{mastered}</div>
          <div className="metric__label">已掌握</div>
        </div>
      </div>

      {/* 筛选 */}
      <div className="chip-row mat-cats">
        <button className={"chip" + (deck === "all" ? " chip--on" : "")} onClick={() => setDeck("all")}>全部</button>
        {(Object.keys(DECKS) as DeckKey[]).map((k) => (
          <button key={k} className={"chip" + (deck === k ? " chip--on" : "")} onClick={() => setDeck(k)}>
            {DECKS[k].label}
          </button>
        ))}
        <button className={"chip" + (onlyDue ? " chip--on" : "")} onClick={() => setOnlyDue((v) => !v)}>
          ⏰ 仅待复习
        </button>
      </div>

      {/* 学习区 */}
      <div ref={cardRef} className="flash-study">
        {!current && !sessionDone && (
          <div className="card flash-start">
            <div className="flash-start__icon"><BrainIcon /></div>
            <div className="flash-start__title">
              {onlyDue && !reviewAll && candidates.filter((c) => (states[c.id]?.due || "2000-01-01") <= dayStr(new Date())).length === 0
                ? "该分类今天没有待复习卡片"
                : "开始本轮记忆"}
            </div>
            <div className="flash-start__desc muted">
              {onlyDue && !reviewAll
                ? "点「复习全部」可巩固已掌握内容，或切换分类。"
                : "按提示翻卡自测，凭记忆回想背面答案，再按掌握程度打分。"}
            </div>
            <button
              className="btn btn--primary btn--block"
              onClick={() => {
                if (onlyDue && !reviewAll && candidates.filter((c) => (states[c.id]?.due || "2000-01-01") <= dayStr(new Date())).length === 0) {
                  setReviewAll(true);
                }
                startSession();
              }}
            >
              {onlyDue && !reviewAll &&
              candidates.filter((c) => (states[c.id]?.due || "2000-01-01") <= dayStr(new Date())).length === 0
                ? "复习全部卡片"
                : "▶ 开始学习"}
            </button>
            {reviewAll && (
              <button className="btn btn--ghost btn--sm btn--block" style={{ marginTop: 8 }} onClick={() => { setReviewAll(false); }}>
                恢复「仅待复习」
              </button>
            )}
          </div>
        )}

        {sessionDone && (
          <div className="card flash-done">
            <div className="flash-done__icon"><PartyIcon /></div>
            <div className="flash-done__title">本轮复习完成！</div>
            <div className="flash-done__desc muted">坚持间隔重复，记忆会更牢固。明天还有 {dueCount} 张待复习。</div>
            <button className="btn btn--primary btn--block" onClick={startSession}>再练一轮</button>
          </div>
        )}

        {current && (
          <div>
            <div
              className={"flash-card" + (flipped ? " is-flipped" : "")}
              onClick={() => setFlipped((f) => !f)}
            >
              <div className="flash-card__inner">
                <div className="flash-card__face flash-card__front">
                  <span className="flash-card__deck" style={{ color: DECKS[current.deck].color, background: DECKS[current.deck].bg }}>
                    {DECKS[current.deck].label}
                  </span>
                  <div className="flash-card__q">{current.front}</div>
                  <div className="flash-card__tap">点击翻看答案</div>
                </div>
                <div className="flash-card__face flash-card__back">
                  <div className="flash-card__a">{current.back}</div>
                  {current.hint && (
                    <div className="flash-card__hint">
                      <LightbulbIcon /> {current.hint}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {!flipped ? (
              <button className="btn btn--primary btn--block flash-flip-btn" onClick={() => setFlipped(true)}>
                我回想一下，翻面 →
              </button>
            ) : (
              <div className="flash-grade">
                <button className="flash-grade__btn flash-grade__again" onClick={() => grade("again")}>
                  <b>忘记</b>
                  <span>立即重来</span>
                </button>
                <button className="flash-grade__btn flash-grade__hard" onClick={() => grade("hard")}>
                  <b>模糊</b>
                  <span>1 天后再练</span>
                </button>
                <button className="flash-grade__btn flash-grade__good" onClick={() => grade("good")}>
                  <b>认识</b>
                  <span>延长间隔</span>
                </button>
              </div>
            )}
            <div className="flash-progress muted">
              本轮剩余 {queue.length} 张
            </div>
          </div>
        )}
      </div>

      {/* 全部卡片（点击可单独学习） */}
      <div className="flash-all">
        <div className="section-title">全部卡片</div>
        <div className="flash-grid">
          {candidates.map((c) => {
            const st = states[c.id];
            const lvl = st?.level ?? 0;
            const isDue = (st?.due || "2000-01-01") <= dayStr(new Date());
            const cls = lvl >= 6 ? "done" : isDue ? "due" : "new";
            return (
              <button key={c.id} className={"flash-mini flash-mini--" + cls} onClick={() => studyOne(c.id)}>
                <span className="flash-mini__deck" style={{ color: DECKS[c.deck].color }}>{DECKS[c.deck].label}</span>
                <span className="flash-mini__front">{c.front}</span>
                <span className="flash-mini__status">
                  {lvl >= 6 ? "✓ 已掌握" : isDue ? `⏰ 待复习 · ${fmtDue(st?.due)}` : "○ 新卡"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mat-foot muted">
        记忆进度保存在本机。按艾宾浩斯曲线安排复习：忘记即当天重来，认识则逐步拉长间隔。
      </div>
    </section>
  );
}

function Ring({ pct, label }: { pct: number; label: string }) {
  const R = 34;
  const C = 2 * Math.PI * R;
  const off = C * (1 - pct / 100);
  return (
    <div className="flash-ring">
      <svg viewBox="0 0 80 80" width="84" height="84">
        <circle cx="40" cy="40" r={R} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="8" />
        <circle
          cx="40" cy="40" r={R} fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={off} transform="rotate(-90 40 40)"
          style={{ transition: "stroke-dashoffset .5s var(--ease-out)" }}
        />
        <text x="40" y="38" textAnchor="middle" fontSize="18" fontWeight="800" fill="#fff">{pct}%</text>
        <text x="40" y="54" textAnchor="middle" fontSize="12" fill="rgba(255,255,255,0.92)">{label}</text>
      </svg>
    </div>
  );
}

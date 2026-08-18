import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { copyText } from "../utils/exportUtils";
import EmptyState from "../components/EmptyState";

/* ============================================================
 * 申论素材库 —— 名言金句 / 政策热词 / 热点话题 / 写作模板
 * 纯前端 curated 内容，本地收藏与「今日已背」进度，无后端依赖。
 * ============================================================ */

type CatKey = "quote" | "policy" | "topic" | "template";

interface Material {
  id: string;
  cat: CatKey;
  title: string; // 金句 / 热词 / 话题名 / 模板名
  sub?: string; // 出处·释义 / 核心观点
  body?: string; // 模板文本 / 论证角度 / 详释
  tags?: string[];
  usage?: string; // 适用场景 / 关联考点 / 使用示例
}

const CATS: Record<CatKey, { label: string; color: string; bg: string; ico: JSX.Element }> = {
  quote: {
    label: "名言金句",
    color: "var(--brand)",
    bg: "var(--brand-050)",
    ico: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 7H4a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h2c1.5 0 3 1 3 3v1" />
        <path d="M17 7h3a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-2c-1.5 0-3 1-3 3v1" />
      </svg>
    ),
  },
  policy: {
    label: "政策热词",
    color: "var(--accent)",
    bg: "var(--accent-050)",
    ico: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
  },
  topic: {
    label: "热点话题",
    color: "var(--warning)",
    bg: "var(--warning-050)",
    ico: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3c2 3 4 4.5 4 8a4 4 0 0 1-8 0c0-1.5.5-2.5 1.3-3.5" />
        <path d="M12 3v9M9 21h6M12 15v6" />
      </svg>
    ),
  },
  template: {
    label: "写作模板",
    color: "var(--success)",
    bg: "var(--success-050)",
    ico: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 3h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
        <path d="M13 3v5h5M8.5 12.5h7M8.5 16h5" />
      </svg>
    ),
  },
};

const MATERIALS: Material[] = [
  // ——— 名言金句 ———
  { id: "q1", cat: "quote", title: "利民之事，丝发必兴；厉民之事，毫末必去。", sub: "《周官辨非》", tags: ["民生", "治理"], usage: "民生保障、政务服务的分论点或结尾升华。" },
  { id: "q2", cat: "quote", title: "治国有常，而利民为本。", sub: "《淮南子·泛论训》", tags: ["民生", "治理"], usage: "论证政策应以人民利益为出发点。" },
  { id: "q3", cat: "quote", title: "万物各得其和以生，各得其养以成。", sub: "《荀子·天论》", tags: ["生态文明", "绿色"], usage: "生态文明、绿色发展主题的立论句。" },
  { id: "q4", cat: "quote", title: "苟日新，日日新，又日新。", sub: "《礼记·大学》", tags: ["改革创新", "发展"], usage: "改革创新、科技进步类分论点引子。" },
  { id: "q5", cat: "quote", title: "大厦之成，非一木之材也；大海之阔，非一流之归也。", sub: "冯梦龙《东周列国志》", tags: ["团结", "汇聚"], usage: "强调凝聚合力、汇聚多方力量。" },
  { id: "q6", cat: "quote", title: "能用众力，则无敌于天下矣；能用众智，则无畏于圣人矣。", sub: "《三国志》", tags: ["基层治理", "汇聚"], usage: "基层治理、集思广益、共建共享。" },
  { id: "q7", cat: "quote", title: "为之于未有，治之于未乱。", sub: "《道德经》", tags: ["风险防范", "底线"], usage: "风险防控、底线思维、未雨绸缪。" },
  { id: "q8", cat: "quote", title: "宰相必起于州部，猛将必发于卒伍。", sub: "《韩非子·显学》", tags: ["人才", "基层"], usage: "重视基层历练、选拔实干人才。" },
  { id: "q9", cat: "quote", title: "功成不必在我，功成必定有我。", sub: "当代治理箴言", tags: ["政绩观", "担当"], usage: "正确政绩观、久久为功、担当作为。" },
  { id: "q10", cat: "quote", title: "路虽远，行则将至；事虽难，做则必成。", sub: "《荀子·修身》化用", tags: ["奋斗", "实干"], usage: "奋斗实干、攻坚克难类结尾。" },
  { id: "q11", cat: "quote", title: "民之所忧，我必念之；民之所盼，我必行之。", sub: "新年贺词", tags: ["民生", "初心"], usage: "民生关切、以人民为中心的立意。" },
  { id: "q12", cat: "quote", title: "不谋全局者，不足谋一域。", sub: "陈澹然《寤言》", tags: ["系统观念", "统筹"], usage: "系统思维、统筹发展与安全。" },

  // ——— 政策热词 ———
  { id: "p1", cat: "policy", title: "新质生产力", sub: "由技术革命性突破、生产要素创新性配置、产业深度转型升级而催生，以高科技、高效能、高质量为特征。", tags: ["发展", "科技"], usage: "高频考点：创新引领、产业升级、人才支撑。" },
  { id: "p2", cat: "policy", title: "高质量发展", sub: "能够很好满足人民日益增长的美好生活需要的发展，是体现新发展理念的发展。", tags: ["发展", "民生"], usage: "统领性概念，可贯穿经济、民生、生态各主题。" },
  { id: "p3", cat: "policy", title: "共同富裕", sub: "全体人民通过辛勤劳动和相互帮助，普遍达到生活富裕富足、精神自信自强、环境宜居宜业。", tags: ["民生", "分配"], usage: "收入分配、乡村振兴、区域协调的落脚点。" },
  { id: "p4", cat: "policy", title: "双碳目标", sub: "力争 2030 年前实现碳达峰、2060 年前实现碳中和。", tags: ["生态", "绿色"], usage: "绿色发展、能源转型、低碳生活的政策依据。" },
  { id: "p5", cat: "policy", title: "乡村振兴", sub: "产业、人才、文化、生态、组织「五个振兴」协同推进。", tags: ["乡村", "民生"], usage: "三农问题、城乡融合的核心战略。" },
  { id: "p6", cat: "policy", title: "全国统一大市场", sub: "高效规范、公平竞争、充分开放的国内市场，破除地方保护与市场分割。", tags: ["经济", "改革"], usage: "要素流动、营商环境、内需扩容。" },
  { id: "p7", cat: "policy", title: "人工智能+", sub: "推动 AI 与千行百业深度融合，赋能新型工业化与治理现代化。", tags: ["科技", "治理"], usage: "数字赋能、智能政务、产业焕新。" },
  { id: "p8", cat: "policy", title: "银发经济", sub: "面向老年人及备老人群，涵盖康养、服务、用品的综合性经济形态。", tags: ["养老", "民生"], usage: "养老服务、适老化改造、扩大内需。" },
  { id: "p9", cat: "policy", title: "专精特新", sub: "中小企业专业化、精细化、特色化、新颖化的发展路径。", tags: ["科技", "企业"], usage: "创新驱动、补链强链、市场主体活力。" },
  { id: "p10", cat: "policy", title: "新就业形态", sub: "平台用工、灵活就业等依托数字平台的劳动形态，需完善权益保障。", tags: ["就业", "民生"], usage: "就业优先、劳动者权益、社会保障。" },

  // ——— 热点话题 ———
  { id: "t1", cat: "topic", title: "人工智能治理", sub: "技术红利与伦理风险并存，需统筹发展与安全，建规章、防滥用、促向善。", body: "论证角度：① 赋能增效（政务、医疗、产业）；② 风险防控（算法偏见、数据安全、就业冲击）；③ 全球治理与规则共建。", tags: ["科技", "治理"], usage: "科技与治理交叉题首选话题。" },
  { id: "t2", cat: "topic", title: "基层治理现代化", sub: "重心下移、力量下沉，以网格化、数字化提升治理颗粒度与响应速度。", body: "论证角度：① 党建引领共建共治；② 数字赋能减负增效；③ 激发群众参与活力。", tags: ["治理", "基层"], usage: "社区、城管、信访等实务类主题。" },
  { id: "t3", cat: "topic", title: "文化自信", sub: "把马克思主义同中华优秀传统文化相结合，以文化滋养民族精神。", body: "论证角度：① 传承活化（非遗、文博）；② 创新表达（国潮、文创）；③ 价值引领。", tags: ["文化"], usage: "精神文明、教育、文旅主题。" },
  { id: "t4", cat: "topic", title: "数字经济", sub: "数据成为关键生产要素，平台与实体深度融合，重塑生产与生活方式。", body: "论证角度：① 新业态新动能；② 数字鸿沟与公平；③ 数据安全底线。", tags: ["经济", "科技"], usage: "产业升级、消费、就业综合题。" },
  { id: "t5", cat: "topic", title: "绿色发展", sub: "绿水青山就是金山银山，生态优先、绿色低碳的发展方式。", body: "论证角度：① 产业升级降碳；② 生态产品价值实现；③ 全民绿色生活。", tags: ["生态", "绿色"], usage: "环保、乡村振兴、高质量发展。" },
  { id: "t6", cat: "topic", title: "就业优先", sub: "就业是最大民生，强化政策协同，稳存量、扩增量、提质量。", body: "论证角度：① 援企稳岗；② 重点群体帮扶（青年、农民工）；③ 技能提升与创业带动。", tags: ["就业", "民生"], usage: "民生保障、经济复苏类主题。" },
  { id: "t7", cat: "topic", title: "数字政务", sub: "一网通办、跨省通办，以数据跑路代替群众跑腿，提升服务温度。", body: "论证角度：① 流程再造便民；② 数据壁垒待破；③ 适老化与数字包容。", tags: ["治理", "数字"], usage: "放管服、营商环境主题。" },
  { id: "t8", cat: "topic", title: "粮食安全", sub: "中国人的饭碗要牢牢端在自己手中，藏粮于地、藏粮于技。", body: "论证角度：① 耕地保护与种业振兴；② 节粮减损；③ 供应链韧性。", tags: ["安全", "乡村"], usage: "三农、国家安全交叉题。" },
  { id: "t9", cat: "topic", title: "养老服务", sub: "应对老龄化，构建居家社区机构相协调、医养康养相结合的体系。", body: "论证角度：① 兜底保障；② 市场化与社会化协同；③ 银发经济新空间。", tags: ["养老", "民生"], usage: "民生、社会治理综合题。" },
  { id: "t10", cat: "topic", title: "青年担当", sub: "把个人理想融入国家命运，在基层与实践中学真知、长真才。", body: "论证角度：① 立志与奋斗；② 基层历练；③ 创新创造生力军。", tags: ["青年", "奋斗"], usage: "青年、人才、价值观主题。" },

  // ——— 写作模板 ———
  { id: "m1", cat: "template", title: "开头·引经据典式", body: "「____」古训昭示我们：____。当下，____（时代背景）。唯有____，方能____（点题立意）。", usage: "示例：以「利民之事，丝发必兴」引出民生为本的立意。" },
  { id: "m2", cat: "template", title: "开头·现象导入式", body: "从____到____，从____到____，____（现象罗列）折射出____（本质）。面对____之问，我们当以____破题。", usage: "示例：用数字政务案例导入「以人民为中心」的治理主题。" },
  { id: "m3", cat: "template", title: "分论点·排比段首", body: "以____筑牢根基；以____激活动能；以____守住底线。（三句并列，层层递进）", usage: "用于主体段段首，增强节奏与气势。" },
  { id: "m4", cat: "template", title: "对策段·五步法", body: "一是强统筹（机制）；二是补短板（痛点）；三是重创新（手段）；四是优服务（对象）；五是建长效（制度）。", usage: "对策类段落结构化展开，避免空泛。" },
  { id: "m5", cat: "template", title: "结尾·升华式", body: "____（回望主题）不是终点，而是新的起点。唯有____，方能____，在____的新征程上书写____。", usage: "收束全文并拔高，呼应开头立意。" },
  { id: "m6", cat: "template", title: "过渡段·承上启下", body: "理念已明，关键在行。把____从「纸上」落到「地上」，还需在____上下功夫。", usage: "连接立意与对策，使行文连贯。" },
  { id: "m7", cat: "template", title: "辩证分析段", body: "既要看到____带来的____（机遇），也要警惕____衍生的____（风险）。统筹兼顾、趋利避害，方为上策。", usage: "科技、市场等双刃剑话题的辩证段。" },
  { id: "m8", cat: "template", title: "案例引述段", body: "看____（地/单位），以____破局，实现了____（成效）。这启示我们：____（观点）。", usage: "用具体案例支撑分论点，增强说服力。" },
];

const FAV_KEY = "gwy_material_favs";
const MEM_KEY = "gwy_material_mem";

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function saveJSON(key: string, val: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* 忽略容量异常 */
  }
}

// 复制逻辑统一复用 utils/exportUtils 的 copyText（见顶部 import）。

// 当日「已背」集合：以日期为键，跨天自动重置统计。
function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export default function MaterialLibrary() {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<CatKey | "all">("all");
  const [onlyFav, setOnlyFav] = useState(false);
  const [favs, setFavs] = useState<string[]>(() => loadJSON(FAV_KEY, []));
  const [mem, setMem] = useState<Record<string, string[]>>(() => loadJSON(MEM_KEY, {}));
  const [randomId, setRandomId] = useState<string | null>(null);

  const memToday = mem[todayKey()] || [];

  useEffect(() => saveJSON(FAV_KEY, favs), [favs]);
  useEffect(() => saveJSON(MEM_KEY, mem), [mem]);

  const toggleFav = (id: string) =>
    setFavs((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const toggleMem = (id: string) =>
    setMem((m) => {
      const tk = todayKey();
      const cur = m[tk] || [];
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      return { ...m, [tk]: next };
    });

  // 每日一素材：按年内的第几天稳定挑选，每天固定一条。
  const daily = useMemo(() => {
    const d = new Date();
    const start = new Date(d.getFullYear(), 0, 0);
    const dayOfYear = Math.floor((+d - +start) / 86400000);
    return MATERIALS[dayOfYear % MATERIALS.length];
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return MATERIALS.filter((m) => {
      if (cat !== "all" && m.cat !== cat) return false;
      if (onlyFav && !favs.includes(m.id)) return false;
      if (q) {
        const hay = (m.title + " " + (m.sub || "") + " " + (m.body || "") + " " + (m.tags || []).join(" ")).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [query, cat, onlyFav, favs]);

  // 随机一条（排除当前每日素材，提升新鲜感）
  function pickRandom() {
    const pool = MATERIALS.filter((m) => m.id !== daily.id);
    const newId = pool[Math.floor(Math.random() * pool.length)].id;
    setRandomId(newId);
    // 用局部 newId 滚动，避免读取尚未更新的 randomId 状态（陈旧闭包）
    setTimeout(() => {
      const el = document.getElementById("mat-" + newId);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
  }

  const totalCount = MATERIALS.length;

  return (
    <section>
      {/* Hero */}
      <div className="hero mat-hero">
        <div className="mat-hero__deco" />
        <div className="hero__title">申论素材库</div>
        <div className="hero__sub">论点弹药库 · 金句 / 热词 / 话题 / 模板，随取随用</div>
        <div className="hero__actions mat-hero__actions">
          <button className="btn btn--inverse btn--sm" onClick={pickRandom}>
            🎲 随机一条
          </button>
          <Link to="/essay" className="btn btn--ghost-on btn--sm">
            ✍️ 去练申论 →
          </Link>
        </div>
      </div>

      {/* 统计 */}
      <div className="grid-3 mat-stats">
        <div className="metric">
          <div className="metric__num">{totalCount}</div>
          <div className="metric__label">素材总量</div>
        </div>
        <div className="metric">
          <div className="metric__num">{favs.length}</div>
          <div className="metric__label">已收藏</div>
        </div>
        <div className="metric">
          <div className="metric__num">{memToday.length}</div>
          <div className="metric__label">今日已背</div>
        </div>
      </div>

      {/* 每日一素材 */}
      {cat === "all" && !query && (
        <div className="mat-daily">
          <div className="mat-daily__head">
            <span className="mat-daily__badge">📅 每日一素材</span>
            <span className="muted" style={{ fontSize: 12 }}>{CATS[daily.cat].label}</span>
          </div>
          <MaterialCard
            m={daily}
            fav={favs.includes(daily.id)}
            memorized={memToday.includes(daily.id)}
            onFav={() => toggleFav(daily.id)}
            onMem={() => toggleMem(daily.id)}
            highlight
          />
        </div>
      )}

      {/* 搜索 + 分类 */}
      <div className="mat-toolbar">
        <div className="mat-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
          <input
            value={query}
            placeholder="搜索金句、热词、话题或标签…"
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="mat-search__clear" onClick={() => setQuery("")} aria-label="清空">×</button>
          )}
        </div>
        <div className="chip-row mat-cats">
          <button className={"chip" + (cat === "all" ? " chip--on" : "")} onClick={() => setCat("all")}>全部</button>
          {(Object.keys(CATS) as CatKey[]).map((k) => (
            <button key={k} className={"chip" + (cat === k ? " chip--on" : "")} onClick={() => setCat(k)}>
              {CATS[k].label}
            </button>
          ))}
          <button className={"chip" + (onlyFav ? " chip--on" : "")} onClick={() => setOnlyFav((v) => !v)}>
            ⭐ 已收藏
          </button>
        </div>
      </div>

      {/* 列表 */}
      {filtered.length === 0 ? (
        <div className="card fav-empty">
          <EmptyState tight icon="search" title="没有匹配的素材" desc="换个关键词，或清空筛选条件试试。" />
        </div>
      ) : (
        <div className="mat-list">
          {filtered.map((m) => (
            <div id={"mat-" + m.id} key={m.id}>
              <MaterialCard
                m={m}
                fav={favs.includes(m.id)}
                memorized={memToday.includes(m.id)}
                highlight={randomId === m.id}
                onFav={() => toggleFav(m.id)}
                onMem={() => toggleMem(m.id)}
              />
            </div>
          ))}
        </div>
      )}

      <div className="mat-foot muted">
        收藏与「今日已背」进度保存在本机，换设备不互通；申论素材持续更新中。
      </div>
    </section>
  );
}

function MaterialCard({
  m,
  fav,
  memorized,
  onFav,
  onMem,
  highlight,
}: {
  m: Material;
  fav: boolean;
  memorized: boolean;
  onFav: () => void;
  onMem: () => void;
  highlight?: boolean;
}) {
  const c = CATS[m.cat];
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    const text = [m.title, m.sub, m.body, m.usage ? "适用：" + m.usage : ""]
      .filter(Boolean)
      .join("\n");
    const ok = await copyText(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }
  };
  return (
    <div className={"card mat-card" + (highlight ? " mat-card--hl" : "")}>
      <div className="mat-card__top">
        <span className="mat-card__cat" style={{ color: c.color, background: c.bg }}>
          <span className="mat-card__cat-ico">{c.ico}</span>
          {c.label}
        </span>
        <div className="mat-card__acts">
          <button
            className={"mat-act" + (copied ? " mat-act--on" : "")}
            onClick={onCopy}
            title="复制素材到剪贴板"
          >
            {copied ? "✓ 已复制" : "⧉ 复制"}
          </button>
          <button
            className={"mat-act" + (memorized ? " mat-act--on" : "")}
            onClick={onMem}
            title={memorized ? "取消今日已背" : "标为今日已背"}
          >
            {memorized ? "✓ 已背" : "○ 背过"}
          </button>
          <button
            className={"mat-act mat-star" + (fav ? " mat-star--on" : "")}
            onClick={onFav}
            title={fav ? "取消收藏" : "收藏"}
            aria-label="收藏"
          >
            {fav ? "★" : "☆"}
          </button>
        </div>
      </div>

      <div className="mat-card__title">{m.title}</div>
      {m.sub && <div className="mat-card__sub">{m.sub}</div>}
      {m.body && <div className="mat-card__body">{m.body}</div>}

      <div className="mat-card__foot">
        <div className="mat-card__tags">
          {(m.tags || []).map((t) => (
            <span key={t} className="tag">{t}</span>
          ))}
        </div>
        {m.usage && <div className="mat-card__usage">💡 {m.usage}</div>}
      </div>
    </div>
  );
}

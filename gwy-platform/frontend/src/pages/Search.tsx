import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, SearchHit } from "../api/client";

// 常见模块快速筛选（题库 category 字段为模块名；关键词检索不依赖此列表）
const CATEGORIES = [
  "言语理解与表达",
  "判断推理",
  "数量关系",
  "资料分析",
  "常识判断",
];

export default function Search() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [faved, setFaved] = useState<Set<number>>(new Set());
  const timer = useRef<number | null>(null);

  function doSearch(keyword: string, cat: string | null) {
    setLoading(true);
    api
      .questionSearch({ q: keyword, category: cat || undefined, limit: 30 })
      .then((r) => {
        setHits(r);
        setSearched(true);
      })
      .catch(() => setHits([]))
      .finally(() => setLoading(false));
  }

  // 关键词输入即时检索（防抖）；模块筛选切换也即时检索
  function onChange(keyword: string) {
    setQ(keyword);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => doSearch(keyword, category), 300);
  }

  function onCategory(cat: string | null) {
    setCategory(cat);
    doSearch(q, cat);
  }

  useEffect(() => {
    // 进入即给一次空关键词 + 全部模块的检索，列出题库样例
    doSearch("", null);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  async function fav(id: number) {
    try {
      await api.favoriteAdd(id);
      setFaved((s) => new Set(s).add(id));
    } catch {
      /* ignore */
    }
  }

  return (
    <section>
      <div className="page-title">搜题</div>
      <div className="search-bar">
        <span className="search-bar__ico">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
        </span>
        <input
          className="search-bar__input"
          placeholder="搜题干或知识点，如「排列组合」「类比推理」"
          value={q}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") doSearch(q, category);
          }}
          autoFocus
        />
        {q && (
          <button className="search-bar__clear" aria-label="清空" onClick={() => onChange("")}>
            ×
          </button>
        )}
      </div>

      <div className="chip-row" style={{ marginTop: 10 }}>
        <button
          className={"chip" + (category === null ? " chip--on" : "")}
          onClick={() => onCategory(null)}
        >
          全部
        </button>
        {CATEGORIES.map((s) => (
          <button
            key={s}
            className={"chip" + (category === s ? " chip--on" : "")}
            onClick={() => onCategory(category === s ? null : s)}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
        {searched
          ? `共找到 ${hits.length} 道题`
          : "正在加载题库…"}
      </div>

      <div style={{ marginTop: 10 }}>
        {loading && (
          <div className="skeleton-line" style={{ height: 64, marginBottom: 10 }} />
        )}
        {!loading && searched && hits.length === 0 && (
          <div className="empty empty--tight">
            <div className="empty__icon">🔍</div>
            <div className="empty__title">没找到相关题目</div>
            <div className="empty__desc">换个关键词，或清除科目筛选试试。</div>
          </div>
        )}
        {hits.map((h) => (
          <div className="q-item" key={h.id}>
            <div className="q-item__meta">
              <span className="tag tag--brand">{h.subject}</span>
              {h.category && <span className="tag">{h.category}</span>}
              {typeof h.difficulty === "number" && (
                <span className="tag tag--warning">难度 {h.difficulty}</span>
              )}
              {!h.is_verified && <span className="tag tag--ghost">待核实</span>}
            </div>
            <div className="q-item__stem">{h.stem}</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
              知识点：{h.knowledge_point}
            </div>
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <button
                className="btn btn--primary btn--sm"
                onClick={() => nav(`/practice?q=${h.id}`)}
              >
                去练习
              </button>
              <button
                className="btn btn--ghost btn--sm"
                disabled={faved.has(h.id)}
                onClick={() => fav(h.id)}
              >
                {faved.has(h.id) ? "已收藏 ★" : "收藏"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

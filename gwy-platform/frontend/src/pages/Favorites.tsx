import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, Question } from "../api/client";
import { triggerDownload, stamp } from "../utils/exportUtils";

export default function Favorites() {
  const nav = useNavigate();
  const [list, setList] = useState<Question[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("全部");
  const [toast, setToast] = useState("");

  function refresh() {
    setLoading(true);
    api.favoriteList().then(setList).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  }
  useEffect(() => {
    refresh();
  }, []);

  const subjects = useMemo(() => {
    const set = new Set<string>();
    list.forEach((q) => q.subject && set.add(q.subject));
    return Array.from(set);
  }, [list]);

  const filtered = useMemo(
    () => (filter === "全部" ? list : list.filter((q) => q.subject === filter)),
    [list, filter]
  );

  async function remove(qid: number) {
    setBusy(true);
    try {
      await api.favoriteRemove(qid);
      setList((prev) => prev.filter((q) => q.id !== qid));
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  function exportFav() {
    if (!list.length) return;
    const lines: string[] = ["# 我的收藏清单", "", `> 共 ${list.length} 题 · 导出时间 ${stamp()}`, ""];
    list.forEach((q, i) => {
      lines.push(`**${i + 1}. [${q.subject}] ${q.knowledge_point || ""}**`);
      lines.push(q.stem);
      q.options.forEach((o) => lines.push(`- ${o.label}. ${o.content}`));
      lines.push("");
    });
    triggerDownload(`我的收藏清单_${stamp()}.md`, lines.join("\n"));
    flash("已导出收藏清单（Markdown）");
  }

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
  }

  return (
    <section>
      <div className="row row--between" style={{ alignItems: "center" }}>
        <h2 className="page-title" style={{ marginBottom: 2 }}>我的收藏</h2>
        {list.length > 0 && <span className="tag tag--brand">{list.length} 题</span>}
      </div>
      <div className="card card--hint">
        把重点、易错、值得反复揣摩的题加入收藏，沉淀为你的个人备考清单。
      </div>
      {err && <div className="err-text">{err}</div>}
      {toast && <div className="ok-text ok-text--float">{toast}</div>}

      {/* 筛选 + 导出 */}
      {!loading && list.length > 0 && (
        <div className="fav-bar">
          <div className="chip-row fav-filters">
            <button
              className={"chip" + (filter === "全部" ? " chip--on" : "")}
              onClick={() => setFilter("全部")}
            >
              全部 {list.length}
            </button>
            {subjects.map((s) => {
              const c = list.filter((q) => q.subject === s).length;
              return (
                <button
                  key={s}
                  className={"chip" + (filter === s ? " chip--on" : "")}
                  onClick={() => setFilter(s)}
                >
                  {s} {c}
                </button>
              );
            })}
          </div>
          <button className="btn btn--ghost btn--sm fav-export" disabled={busy} onClick={exportFav}>
            导出清单
          </button>
        </div>
      )}

      {loading && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="skeleton-line" style={{ width: "40%" }} />
          <div className="skeleton-line" style={{ width: "90%", marginTop: 10 }} />
          <div className="skeleton-line" style={{ width: "70%", marginTop: 8 }} />
          <div className="skeleton-line" style={{ width: "55%", marginTop: 8 }} />
        </div>
      )}

      {!loading && list.length === 0 && (
        <div className="card fav-empty">
          <div className="muted">还没有收藏。</div>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            在「刷题」「模考」或「错题本」中可把题目加入收藏。
          </div>
          <button className="btn btn--primary btn--sm" style={{ marginTop: 12 }} onClick={() => nav("/practice")}>
            去题库练习 →
          </button>
        </div>
      )}

      {!loading && filtered.map((q) => (
        <div key={q.id} className="card" style={{ marginTop: 12 }}>
          <div className="q-item__meta">
            <span className="tag tag--brand">{q.subject}</span>
            <span>{q.knowledge_point}</span>
            {q.is_verified && <span className="tag tag--verified">✓ 已审核</span>}
          </div>
          <div className="q-item__stem" style={{ marginTop: 6 }}>{q.stem}</div>
          <div className="row fav-actions" style={{ marginTop: 8, gap: 8 }}>
            <button className="btn btn--primary" style={{ flex: 1 }} onClick={() => nav(`/practice?q=${q.id}`)}>
              去练习
            </button>
            <button className="btn btn--ghost" style={{ flex: 1 }} disabled={busy} onClick={() => remove(q.id)}>
              取消收藏
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}

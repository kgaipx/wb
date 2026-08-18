import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, FavoriteItem } from "../api/client";
import { triggerDownload, stamp } from "../utils/exportUtils";
import ExplainModal from "../components/ExplainModal";
import EmptyState from "../components/EmptyState";
import { TargetIcon } from "../icons";

// 自定义标签白名单（与后端 patch_favorite 校验一致）
const TAG_DEFS: { key: string; icon: string; label: string }[] = [
  { key: "易错", icon: "🔴", label: "易错" },
  { key: "重点", icon: "🟡", label: "重点" },
  { key: "已掌握", icon: "✅", label: "已掌握" },
];

export default function Favorites() {
  const nav = useNavigate();
  const [list, setList] = useState<FavoriteItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("全部");
  const [tagFilter, setTagFilter] = useState<string>("全部"); // 全部 | 易错 | 重点
  const [groupBy, setGroupBy] = useState<"list" | "kp">("list");
  const [toast, setToast] = useState("");
  const [explainId, setExplainId] = useState<number | null>(null);

  function refresh() {
    setLoading(true);
    api
      .favoriteList()
      .then(setList)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    refresh();
  }, []);

  // 云端保存笔记/标签后回写列表（保证 UI 与服务器一致）
  async function applyPatch(qid: number, patch: { note?: string; tags?: string[] }) {
    const updated = await api.favoriteUpdate(qid, patch);
    setList((prev) => prev.map((it) => (it.question.id === qid ? updated : it)));
    return updated;
  }

  const subjects = useMemo(() => {
    const set = new Set<string>();
    list.forEach((it) => it.question.subject && set.add(it.question.subject));
    return Array.from(set);
  }, [list]);

  const filtered = useMemo(() => {
    return list.filter((it) => {
      if (filter !== "全部" && it.question.subject !== filter) return false;
      if (tagFilter !== "全部" && !it.tags.includes(tagFilter)) return false;
      return true;
    });
  }, [list, filter, tagFilter]);

  const grouped = useMemo(() => {
    const m = new Map<string, FavoriteItem[]>();
    filtered.forEach((it) => {
      const k = it.question.knowledge_point || "未分类";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(it);
    });
    return m;
  }, [filtered]);

  const tagCounts = useMemo(() => {
    const c: Record<string, number> = { 易错: 0, 重点: 0, 已掌握: 0 };
    list.forEach((it) => it.tags.forEach((t) => (c[t] = (c[t] || 0) + 1)));
    return c;
  }, [list]);

  const batchIds = useMemo(() => {
    const all = list.map((it) => it.question.id);
    const err = list.filter((it) => it.tags.includes("易错")).map((it) => it.question.id);
    const key = list.filter((it) => it.tags.includes("重点")).map((it) => it.question.id);
    return { all, err, key };
  }, [list]);

  function practiceIds(ids: number[]) {
    if (!ids.length) {
      flash("该筛选下暂无可练习的收藏");
      return;
    }
    nav(`/practice?ids=${ids.join(",")}`);
  }

  async function remove(qid: number) {
    setBusy(true);
    try {
      await api.favoriteRemove(qid);
      setList((prev) => prev.filter((it) => it.question.id !== qid));
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  function exportFav() {
    if (!list.length) return;
    const lines: string[] = ["# 我的收藏清单", "", `> 共 ${list.length} 题 · 导出时间 ${stamp()}`, ""];
    list.forEach((it, i) => {
      const q = it.question;
      lines.push(`**${i + 1}. [${q.subject}] ${q.knowledge_point || ""}**`);
      if (it.tags.length) lines.push(`- 🏷 标签：${it.tags.map((t) => (t === "易错" ? "🔴易错" : t === "重点" ? "🟡重点" : "✅已掌握")).join("、")}`);
      lines.push(q.stem);
      q.options.forEach((o) => lines.push(`- ${o.label}. ${o.content}`));
      if (it.note && it.note.trim()) lines.push(`- 📝 笔记：${it.note.trim()}`);
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
        把重点、易错、值得反复揣摩的题加入收藏，沉淀为你的个人备考清单。可写云端笔记（多设备同步）、打自定义标签（🔴易错 / 🟡重点），并按科目 / 标签筛选、按知识点分组。
      </div>
      {err && <div className="err-text">{err}</div>}
      {toast && <div className="ok-text ok-text--float">{toast}</div>}

      {/* 分类方式 + 科目筛选 + 标签筛选 + 导出 */}
      {!loading && list.length > 0 && (
        <div className="fav-bar">
          <div className="fav-batch">
            <button className="btn btn--primary btn--sm" disabled={busy} onClick={() => practiceIds(batchIds.all)}>
              <><TargetIcon /> 练习全部（{list.length}）</>
            </button>
            <button
              className="btn btn--ghost btn--sm"
              disabled={busy || tagCounts["易错"] === 0}
              onClick={() => practiceIds(batchIds.err)}
              title="仅练习标记「易错」的收藏"
            >
              🔴 只练易错（{tagCounts["易错"] || 0}）
            </button>
            <button
              className="btn btn--ghost btn--sm"
              disabled={busy || tagCounts["重点"] === 0}
              onClick={() => practiceIds(batchIds.key)}
              title="仅练习标记「重点」的收藏"
            >
              🟡 只练重点（{tagCounts["重点"] || 0}）
            </button>
          </div>
          <div className="row row--between" style={{ gap: 8, marginBottom: 8 }}>
            <div className="chip-row fav-filters">
              <button className={"chip" + (groupBy === "list" ? " chip--on" : "")} onClick={() => setGroupBy("list")}>
                列表
              </button>
              <button className={"chip" + (groupBy === "kp" ? " chip--on" : "")} onClick={() => setGroupBy("kp")}>
                按知识点
              </button>
            </div>
            <button className="btn btn--ghost btn--sm fav-export" disabled={busy} onClick={exportFav}>
              导出清单
            </button>
          </div>
          <div className="chip-row fav-filters">
            <button className={"chip" + (filter === "全部" ? " chip--on" : "")} onClick={() => setFilter("全部")}>
              全部 {list.length}
            </button>
            {subjects.map((s) => {
              const c = list.filter((it) => it.question.subject === s).length;
              return (
                <button key={s} className={"chip" + (filter === s ? " chip--on" : "")} onClick={() => setFilter(s)}>
                  {s} {c}
                </button>
              );
            })}
          </div>
          <div className="chip-row fav-filters" style={{ marginTop: 8 }}>
            <button
              className={"chip" + (tagFilter === "全部" ? " chip--on" : "")}
              onClick={() => setTagFilter("全部")}
            >
              全部标签
            </button>
            {TAG_DEFS.map((t) => (
              <button
                key={t.key}
                className={"chip" + (tagFilter === t.key ? " chip--on" : "")}
                onClick={() => setTagFilter(t.key)}
              >
                {t.icon} {t.label} {tagCounts[t.key] || 0}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div className="sk-card" style={{ marginTop: 12 }}>
          <div className="sk sk-line" style={{ width: "40%" }} />
          <div className="sk sk-line" style={{ width: "90%" }} />
          <div className="sk sk-line" style={{ width: "70%" }} />
          <div className="sk sk-line" style={{ width: "55%" }} />
        </div>
      )}

      {!loading && list.length === 0 && (
        <div className="card fav-empty">
          <EmptyState tight icon="star" title="还没有收藏" desc="在「刷题」「模考」或「错题本」中可把题目加入收藏。" />
            <div className="empty__action">
              <button className="btn btn--primary btn--sm" onClick={() => nav("/practice")}>
                去题库练习 →
              </button>
            </div>
        </div>
      )}

      {!loading && list.length > 0 && groupBy === "kp" && (
        <>
          {Array.from(grouped.entries()).map(([kp, items]) => (
            <div key={kp}>
              <div className="fav-group-title">
                <span>{kp}</span>
                <span className="fav-group-right">
                  <span className="muted">{items.length} 题</span>
                  <button
                    className="btn btn--ghost btn--sm"
                    disabled={busy}
                    onClick={() => practiceIds(items.map((i) => i.question.id))}
                  >
                    练习这组
                  </button>
                </span>
              </div>
              {items.map((it) => (
                <FavCard key={it.question.id} item={it} busy={busy} onRemove={remove} onPatch={applyPatch} onExplain={setExplainId} />
              ))}
            </div>
          ))}
        </>
      )}

      {!loading && list.length > 0 && groupBy === "list" && (
        filtered.map((it) => (
          <FavCard key={it.question.id} item={it} busy={busy} onRemove={remove} onPatch={applyPatch} onExplain={setExplainId} />
        ))
      )}

      <ExplainModal
        questionId={explainId}
        onClose={() => setExplainId(null)}
        onFavToggle={(id, willFav) => {
          if (!willFav) remove(id);
        }}
      />
    </section>
  );
}

function FavCard({
  item,
  busy,
  onRemove,
  onPatch,
  onExplain,
}: {
  item: FavoriteItem;
  busy: boolean;
  onRemove: (id: number) => void;
  onPatch: (qid: number, patch: { note?: string; tags?: string[] }) => Promise<FavoriteItem>;
  onExplain?: (id: number) => void;
}) {
  const nav = useNavigate();
  const q = item.question;
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState(item.note);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function commitNote() {
    setSaving(true);
    try {
      await onPatch(q.id, { note });
      setNoteOpen(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {
      /* 静默：错误由页面级 err 兜底 */
    } finally {
      setSaving(false);
    }
  }

  async function toggleTag(tag: string) {
    const has = item.tags.includes(tag);
    const next = has ? item.tags.filter((t) => t !== tag) : [...item.tags, tag];
    try {
      await onPatch(q.id, { tags: next });
    } catch {
      /* 静默 */
    }
  }

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="q-item__meta">
        <span className="tag tag--brand">{q.subject}</span>
        <span>{q.knowledge_point}</span>
        {q.is_verified && <span className="tag tag--verified">✓ 已审核</span>}
      </div>
      <div className="q-item__stem" style={{ marginTop: 6 }}>{q.stem}</div>

      {/* 自定义标签 */}
      <div className="fav-tags" style={{ marginTop: 8 }}>
        {TAG_DEFS.map((t) => {
          const on = item.tags.includes(t.key);
          return (
            <button
              key={t.key}
              className={"fav-tag " + (on ? "fav-tag--on" : "")}
              onClick={() => toggleTag(t.key)}
              title={on ? `取消「${t.label}」标签` : `打上「${t.label}」标签`}
            >
              {t.icon} {t.label}
            </button>
          );
        })}
      </div>

      {!noteOpen && item.note.trim() && (
        <div className="fav-note-preview">📝 {item.note.trim()}</div>
      )}

      {noteOpen && (
        <div style={{ marginTop: 8 }}>
          <textarea
            className="fav-note-input"
            value={note}
            placeholder="写点私人笔记，比如易错点、口诀…（云端同步，多设备可见）"
            onChange={(e) => setNote(e.target.value)}
            rows={3}
          />
          <div className="row" style={{ gap: 8, marginTop: 6 }}>
            <button className="btn btn--primary btn--sm" onClick={commitNote} disabled={saving}>
              {saving ? "保存中…" : "保存笔记"}
            </button>
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => {
                setNoteOpen(false);
                setNote(item.note);
              }}
            >
              取消
            </button>
          </div>
        </div>
      )}

      <div className="row fav-actions" style={{ marginTop: 8, gap: 8 }}>
        <button className="btn btn--primary" style={{ flex: 1 }} onClick={() => nav(`/practice?q=${q.id}`)}>
          去练习
        </button>
        <button className="btn btn--ghost btn--sm" onClick={() => onExplain?.(q.id)}>
          看解析
        </button>
        <button
          className="btn btn--ghost btn--sm"
          onClick={() => setNoteOpen((v) => !v)}
        >
          {noteOpen ? "收起" : item.note.trim() ? "笔记" : "加笔记"}
        </button>
        <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => onRemove(q.id)}>
          取消收藏
        </button>
      </div>
      {saved && <div className="ok-text" style={{ fontSize: 12, marginTop: 4 }}>笔记已云端保存</div>}
    </div>
  );
}

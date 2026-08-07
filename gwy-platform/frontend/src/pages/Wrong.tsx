import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, WrongItem } from "../api/client";
import { triggerDownload, copyText, stamp } from "../utils/exportUtils";
import Markdown from "../components/Markdown";
import MasteryBadge from "../components/MasteryBadge";

interface ItemState {
  open: boolean;
  selected: string;
  result: any;
  explain: string;
  cites: string[];
}

export default function Wrong() {
  const nav = useNavigate();
  const [items, setItems] = useState<WrongItem[]>([]);
  const [states, setStates] = useState<Record<number, ItemState>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const [wf, setWf] = useState<string>("全部"); // 错题本科目筛选
  const [sortBy, setSortBy] = useState<"risk" | "attempts">("risk"); // 列表排序：复错风险↓ / 练习次数↓
  const [loading, setLoading] = useState(true);

  function refresh() {
    setLoading(true);
    api.wrongList().then(setItems).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  }
  useEffect(() => {
    refresh();
  }, []);

  function s(qid: number): ItemState {
    return states[qid] || { open: false, selected: "", result: null, explain: "", cites: [] };
  }
  function patch(qid: number, patch: Partial<ItemState>) {
    setStates((prev) => ({ ...prev, [qid]: { ...s(qid), ...patch } }));
  }

  const wSubjects = useMemo(
    () => ["全部", ...Array.from(new Set(items.map((it) => it.question.subject)))],
    [items]
  );
  const visible = wf === "全部" ? items : items.filter((it) => it.question.subject === wf);
  const sorted = useMemo(() => {
    const arr = [...visible];
    if (sortBy === "risk") arr.sort((a, b) => (b.recurrence_rate ?? 0) - (a.recurrence_rate ?? 0));
    else arr.sort((a, b) => b.attempts - a.attempts);
    return arr;
  }, [visible, sortBy]);

  // 全局概览（不受科目筛选影响，反映错题本全貌）
  const overview = useMemo(() => {
    if (!items.length) return null;
    const total = items.length;
    const highRisk = items.filter((it) => (it.recurrence_rate ?? 0) >= 0.6).length;
    const avgRate = items.reduce((a, it) => a + (it.recurrence_rate ?? 0), 0) / total;
    const bySubj = new Map<string, { count: number; sumRate: number }>();
    for (const it of items) {
      const subj = it.question.subject;
      const cur = bySubj.get(subj) || { count: 0, sumRate: 0 };
      cur.count += 1;
      cur.sumRate += it.recurrence_rate ?? 0;
      bySubj.set(subj, cur);
    }
    const subjRows = Array.from(bySubj.entries())
      .map(([subj, v]) => ({ subj, count: v.count, avg: v.sumRate / v.count }))
      .sort((a, b) => b.avg - a.avg); // 复错风险降序，最危险优先看
    return { total, highRisk, avgRate, subjRows };
  }, [items]);

  async function submit(qid: number) {
    const cur = s(qid);
    if (!cur.selected) return;
    setBusy(true);
    setErr("");
    try {
      const r = await api.practice(qid, cur.selected);
      patch(qid, { result: r });
      if (r.is_correct) {
        // 答对即视为已掌握，移出错题本，闭环降复错率
        await api.wrongReview(qid);
        setItems((prev) => prev.filter((it) => it.question.id !== qid));
        setToast(`已掌握「${r.correct_answer}」并移出错题本`);
        setTimeout(() => setToast(""), 2200);
      }
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function askTutor(qid: number) {
    setBusy(true);
    try {
      const r = await api.explain(qid, s(qid).selected || undefined);
      patch(qid, { explain: r.explanation, cites: r.citations });
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function markReviewed(qid: number) {
    setBusy(true);
    try {
      await api.wrongReview(qid);
      setItems((prev) => prev.filter((it) => it.question.id !== qid));
      setToast("已标记掌握并移出错题本");
      setTimeout(() => setToast(""), 2200);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  function wrongToMarkdown(): string {
    const lines: string[] = [
      "# 错题本导出",
      "",
      `> 导出时间：${stamp().replace(/_/, " ")} · 共 ${items.length} 道待复盘错题`,
      "",
    ];
    items.forEach((it, i) => {
      const q = it.question;
      lines.push(`## 第 ${i + 1} 题 · ${q.subject} · ${q.knowledge_point}（错 ${it.wrong_count} 次）`);
      lines.push("");
      lines.push(q.stem);
      lines.push("");
      q.options.forEach((o) => lines.push(`- ${o.label}. ${o.content}`));
      lines.push("");
      lines.push(`**上次作答**：${it.last_selected || "—"}`);
      lines.push("");
      lines.push("---");
      lines.push("");
    });
    return lines.join("\n");
  }

  function exportWrong() {
    if (!items.length) {
      setToast("暂无可导出的错题");
      setTimeout(() => setToast(""), 1800);
      return;
    }
    triggerDownload(`错题本_${stamp()}.md`, wrongToMarkdown());
    setToast("已导出错题本（Markdown）");
    setTimeout(() => setToast(""), 1800);
  }

  async function copyWrong() {
    if (!items.length) {
      setToast("暂无可复制的错题");
      setTimeout(() => setToast(""), 1800);
      return;
    }
    const ok = await copyText(wrongToMarkdown());
    setToast(ok ? "已复制错题本内容" : "复制失败");
    setTimeout(() => setToast(""), 1800);
  }

  return (
    <section>
      <h2 className="page-title">错题本</h2>
      <div className="card card--hint">
        把做错的题在这里重练，<b>答对即移出错题本</b>——这正是对抗「错题复错率」的核心闭环。
      </div>
      <div className="export-bar">
        <button className="btn btn--sm btn--ghost" disabled={busy} onClick={exportWrong}>
          导出错题本
        </button>
        <button className="btn btn--sm btn--ghost" disabled={busy} onClick={copyWrong}>
          复制全文
        </button>
        <span className="text-3 export-bar__hint">导出 Markdown，可分享或打印成 PDF</span>
      </div>
      {err && <div className="err-text">{err}</div>}
      {toast && <div className="ok-text ok-text--float">{toast}</div>}
      {loading && <div className="muted" style={{ marginTop: 16 }}>加载中…</div>}

      {!loading && items.length === 0 && (
        <div className="muted" style={{ marginTop: 16 }}>
          暂无待复盘错题。多做「刷题」和「模考」，这里会自动收集你的错答。
        </div>
      )}

      {items.length > 0 && overview && (
        <div className="card wrong-overview" style={{ marginTop: 12 }}>
          <div className="wrong-overview__stats">
            <div className="ov-stat">
              <div className="ov-stat__num">{overview.total}</div>
              <div className="ov-stat__label">待复盘</div>
            </div>
            <div className={"ov-stat " + (overview.highRisk > 0 ? "ov-stat--bad" : "")}>
              <div className="ov-stat__num">{overview.highRisk}</div>
              <div className="ov-stat__label">高危复错(≥60%)</div>
            </div>
            <div className="ov-stat">
              <div className="ov-stat__num">{Math.round(overview.avgRate * 100)}%</div>
              <div className="ov-stat__label">平均复错率</div>
            </div>
          </div>
          <div className="wrong-overview__subj">
            <div className="wrong-overview__title">按科目（复错风险降序，优先啃硬骨头）</div>
            {overview.subjRows.map((r) => (
              <div key={r.subj} className="ov-subj">
                <div className="ov-subj__head">
                  <span className="tag tag--brand">{r.subj}</span>
                  <span className="text-3">{r.count} 题 · 复错 {Math.round(r.avg * 100)}%</span>
                </div>
                <div className="ov-bar">
                  <div
                    className={
                      "ov-bar__fill " +
                      (r.avg >= 0.6 ? "ov-bar__fill--bad" : r.avg >= 0.3 ? "ov-bar__fill--warn" : "ov-bar__fill--ok")
                    }
                    style={{ width: `${Math.max(6, Math.round(r.avg * 100))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div className="chip-row" style={{ marginBottom: 10, marginTop: 12 }}>
          {wSubjects.map((s) => (
            <button key={s} className={"chip " + (wf === s ? "chip--on" : "")} onClick={() => setWf(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      {items.length > 0 && (
        <div className="chip-row" style={{ marginBottom: 10 }}>
          <button className={"chip " + (sortBy === "risk" ? "chip--on" : "")} onClick={() => setSortBy("risk")}>复错风险↓</button>
          <button className={"chip " + (sortBy === "attempts" ? "chip--on" : "")} onClick={() => setSortBy("attempts")}>练习次数↓</button>
        </div>
      )}
      {items.length > 0 && visible.length === 0 && (
        <div className="muted" style={{ marginTop: 12 }}>
          该科目暂无错题。
        </div>
      )}

      {sorted.map((it) => {
        const q = it.question;
        const st = s(q.id);
        return (
          <div key={q.id} className="card" style={{ marginTop: 12 }}>
            <div className="wrong-item__top">
              <div className="q-item__meta">
                <span className="tag tag--bad">错 {it.wrong_count} 次</span>
                <span className="tag tag--brand">{q.subject}</span>
                {it.recurrence_rate !== null && it.recurrence_rate !== undefined && (
                  <span className={"tag " + (it.recurrence_rate >= 0.6 ? "tag--bad" : it.recurrence_rate >= 0.3 ? "tag--warn" : "tag--ok")}>
                    复错率 {Math.round(it.recurrence_rate * 100)}%
                  </span>
                )}
                {it.attempts > 0 && <span className="text-3">共答 {it.attempts} 次</span>}
                <span>{q.knowledge_point}</span>
              </div>
              <MasteryBadge value={1 - (it.recurrence_rate ?? 0)} size={56} />
            </div>
            <div className="q-item__stem" style={{ marginTop: 6 }}>{q.stem}</div>

            {!st.open ? (
              <div className="row" style={{ marginTop: 8, gap: 8 }}>
                <button className="btn btn--primary" style={{ flex: 1 }} onClick={() => patch(q.id, { open: true })}>
                  重练这题
                </button>
                <button className="btn btn--ghost" style={{ flex: 1 }} disabled={busy} onClick={() => askTutor(q.id)}>
                  AI 讲解
                </button>
              </div>
            ) : (
              <div style={{ marginTop: 8 }}>
                {q.options.map((o) => (
                  <label key={o.id} className={"opt" + (st.selected === o.label ? " opt--selected" : "")}>
                    <input
                      type="radio"
                      name={`w${q.id}`}
                      checked={st.selected === o.label}
                      onChange={() => patch(q.id, { selected: o.label })}
                    />
                    <b>{o.label}.</b> <span>{o.content}</span>
                  </label>
                ))}
                <div className="row" style={{ marginTop: 8, gap: 8 }}>
                  <button className="btn btn--primary" style={{ flex: 1 }} disabled={busy || !st.selected} onClick={() => submit(q.id)}>
                    提交重练
                  </button>
                  <button className="btn btn--ghost" style={{ flex: 1 }} onClick={() => markReviewed(q.id)}>
                    标记已掌握
                  </button>
                </div>
                {st.result && (
                  <div className={"result " + (st.result.is_correct ? "result--ok" : "result--bad")}>
                    <b>                    {st.result.is_correct ? "✔ 答对，已移出错题本" : `✘ 还是错了，正确答案：${st.result.correct_answer}`}</b>
                    {st.result.explanation && <div style={{ marginTop: 6 }}><Markdown>{st.result.explanation}</Markdown></div>}
                  </div>
                )}
              </div>
            )}

            {st.explain && (
              <div className="tutor-box" style={{ marginTop: 8 }}>
                <div className="tutor-box__title">AI 私教讲解</div>
                <div className="tutor-box__body"><Markdown>{st.explain}</Markdown></div>
                {st.cites.length > 0 && <div className="tutor-box__cite">来源：{st.cites.join("；")}</div>}
              </div>
            )}

            <div className="row row--between" style={{ marginTop: 8 }}>
              <span className="text-3" style={{ fontSize: 12 }}>
                上次作答：{it.last_selected || "—"}
              </span>
              <button className="link-btn" onClick={() => nav(`/practice?q=${q.id}`)}>
                到刷题页单练 →
              </button>
            </div>
          </div>
        );
      })}
    </section>
  );
}

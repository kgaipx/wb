import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  api,
  AssessmentPaperItem,
  AssessmentReport,
  AssessmentRecordOut,
  AssessmentDim,
} from "../api/client";
import { LineChart } from "../components/LineChart";
import { triggerDownload, shareOrCopy, stamp } from "../utils/exportUtils";
import EmptyState from "../components/EmptyState";

type Phase = "setup" | "doing" | "report" | "history" | "historyDetail";

/** 能力雷达图：各知识点掌握度多边形（内联 SVG，不依赖图表库）。 */
function RadarChart({ dims }: { dims: AssessmentDim[] }) {
  const size = 300;
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - 46;
  const n = dims.length;
  if (n < 3) {
    return (
      <div className="muted" style={{ textAlign: "center", padding: 24 }}>
        本次测评覆盖维度较少，暂无法绘制雷达图（需 ≥3 个知识点）。
      </div>
    );
  }
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt = (i: number, r: number): [number, number] => [
    cx + r * Math.cos(angle(i)),
    cy + r * Math.sin(angle(i)),
  ];
  const rings = [0.25, 0.5, 0.75, 1].map((f) =>
    dims.map((_, i) => pt(i, R * f).join(",")).join(" ")
  );
  const dataPts = dims.map((d, i) => pt(i, R * Math.max(0.04, d.mastery)));
  const dataPoly = dataPts.map((p) => p.join(",")).join(" ");
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      style={{ maxWidth: 320, display: "block", margin: "0 auto" }}
    >
      {rings.map((ring, i) => (
        <polygon key={i} points={ring} fill="none" style={{ stroke: "var(--border)" }} strokeWidth={1} />
      ))}
      {dims.map((_, i) => {
        const [x, y] = pt(i, R);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} style={{ stroke: "var(--border)" }} strokeWidth={1} />;
      })}
      <polygon points={dataPoly} style={{ fill: "rgba(var(--brand-rgb),0.22)", stroke: "var(--brand)" }} strokeWidth={2} />
      {dataPts.map((p, i) => (
        <circle
          key={i}
          cx={p[0]}
          cy={p[1]}
          r={3.5}
          style={{ fill: dims[i].mastery < 0.6 ? "var(--danger)" : "var(--brand)" }}
        />
      ))}
      {dims.map((d, i) => {
        const [x, y] = pt(i, R + 22);
        return (
          <text
            key={i}
            x={x}
            y={y}
            fontSize={11}
            textAnchor="middle"
            dominantBaseline="middle"
            style={{ fill: d.mastery < 0.6 ? "var(--danger)" : "var(--text-2)" }}
          >
            {d.knowledge_point}
          </text>
        );
      })}
    </svg>
  );
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}-${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

export default function Assessment() {
  const nav = useNavigate();
  const [phase, setPhase] = useState<Phase>("setup");
  const [paper, setPaper] = useState<AssessmentPaperItem[]>([]);
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState("");
  const [report, setReport] = useState<AssessmentReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [history, setHistory] = useState<AssessmentRecordOut[]>([]);
  const [detail, setDetail] = useState<AssessmentRecordOut | null>(null);
  const [prevOverall, setPrevOverall] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [toast, setToast] = useState("");

  const cur = paper[idx];
  const answeredCount = paper.filter((q) => answers[q.id]).length;

  async function start() {
    setBusy(true);
    setErr("");
    try {
      const p = await api.assessmentPaper();
      if (!p.length) {
        setErr("题库暂无可用题目，请先完善题库");
        return;
      }
      setPaper(p);
      setAnswers({});
      setIdx(0);
      setSelected("");
      setReport(null);
      setPhase("doing");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  function next() {
    if (!selected) return;
    const q = paper[idx];
    setAnswers((a) => ({ ...a, [q.id]: selected }));
    if (idx + 1 < paper.length) {
      setIdx(idx + 1);
      setSelected("");
    } else {
      submitAll();
    }
  }

  async function submitAll() {
    setBusy(true);
    setErr("");
    try {
      const ans = paper.map((q) => ({ question_id: q.id, selected: answers[q.id] || "" }));
      const r = await api.assessmentSubmit(ans);
      setReport(r);
      setPhase("report");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const HIS_PAGE = 20;
  const [hisOffset, setHisOffset] = useState(0);
  const [hisLoading, setHisLoading] = useState(false);
  const [hisLoadingMore, setHisLoadingMore] = useState(false);
  const [hisHasMore, setHisHasMore] = useState(false);

  async function loadHistory(reset = true) {
    const off = reset ? 0 : hisOffset;
    if (reset) setHisLoading(true);
    try {
      const data = await api.assessmentHistory(HIS_PAGE, off);
      if (reset) {
        setHistory(data);
        setHisOffset(HIS_PAGE);
      } else {
        setHistory((prev) => [...prev, ...data]);
        setHisOffset(off + HIS_PAGE);
      }
      setHisHasMore(data.length === HIS_PAGE);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      if (reset) setHisLoading(false);
    }
  }

  async function loadMoreHistory() {
    if (hisLoadingMore || !hisHasMore) return;
    setHisLoadingMore(true);
    try {
      await loadHistory(false);
    } finally {
      setHisLoadingMore(false);
    }
  }
  useEffect(() => {
    if (phase === "history") loadHistory();
  }, [phase]);

  // 做题阶段键盘快捷键（与刷题/模考一致）：A–D/1–4 选当前题、Enter 下一题/交卷、Esc 取消
  useEffect(() => {
    if (phase !== "doing" || !cur) return;
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement as HTMLElement | null;
      const tag = (el?.tagName || "").toUpperCase();
      const isText = tag === "TEXTAREA" || (tag === "INPUT" && (el as HTMLInputElement).type === "text");
      if (isText) return;
      const k = e.key.toLowerCase();
      const map: Record<string, string> = { a: "A", b: "B", c: "C", d: "D", e: "E", "1": "A", "2": "B", "3": "C", "4": "D", "5": "E" };
      if (map[k]) {
        e.preventDefault();
        setSelected(map[k]);
        return;
      }
      if (k === "enter") {
        if (tag === "BUTTON") return; // 让按钮原生回车生效，避免重复触发
        e.preventDefault();
        if (selected && !busy) next();
        return;
      }
      if (k === "escape") {
        e.preventDefault();
        setSelected("");
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, cur, selected, busy, next]);

  async function openDetail(id: number) {
    setBusy(true);
    setErr("");
    try {
      const d = await api.assessmentHistoryDetail(id);
      setDetail(d);
      // 历史按时间倒序：当前记录的下一条即「上一次」测评
      const idx = history.findIndex((h) => h.id === id);
      const prev = idx >= 0 && idx + 1 < history.length ? history[idx + 1].overall : null;
      setPrevOverall(prev);
      setPhase("historyDetail");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  function renderReport(rep: AssessmentReport | AssessmentRecordOut, prevOverall?: number | null) {
    const r = rep as any;
    const overall = Math.round((r.overall || 0) * 100);
    const tone = overall >= 70 ? "rate--good" : overall >= 50 ? "rate--mid" : "rate--bad";
    const dims: AssessmentDim[] = r.dimensions || [];
    const total = r.total ?? r.questions_total;
    const correct = typeof r.correct === "number" ? r.correct : null;
    const prevPct = prevOverall != null ? Math.round(prevOverall * 100) : null;
    const diff = prevPct != null ? overall - prevPct : null;
    const trendCls = diff == null ? "" : diff > 0 ? "rate-trend--up" : diff < 0 ? "rate-trend--down" : "rate-trend--flat";
    const trendArrow = diff == null ? "" : diff > 0 ? "▲" : diff < 0 ? "▼" : "—";
    return (
      <>
        <div className="card report-hero">
          <div className={"big-rate " + tone}>{overall}<span>%</span></div>
          <div className="muted">
            总体掌握度 · {correct !== null ? `答对 ${correct} / ${total} 题` : `共 ${total} 题`}
            {diff !== null && (
              <span className={"rate-trend " + trendCls}>
                {trendArrow} {diff > 0 ? "+" : ""}{diff} 较上次
              </span>
            )}
          </div>
        </div>

        <div className="card" style={{ marginTop: 12 }}>
          <strong style={{ display: "block", marginBottom: 6 }}>能力雷达图（各知识点掌握度）</strong>
          <RadarChart dims={dims} />
          {dims.length > 0 && (
            <>
              <div className="muted" style={{ fontSize: 12, margin: "12px 0 6px" }}>各维度掌握度（升序，先补最弱）</div>
              <div style={{ marginTop: 4 }}>
                {[...dims]
                  .sort((a, b) => a.mastery - b.mastery)
                  .map((d) => {
                    const mv = Math.round(d.mastery * 100);
                    const color =
                      d.mastery >= 0.7 ? "var(--success)" : d.mastery >= 0.4 ? "var(--warning)" : "var(--danger)";
                    return (
                      <div className="kp-row" key={d.knowledge_point}>
                        <div className="kp-row__name">{d.knowledge_point}</div>
                        <div className="kp-row__bar">
                          <div className="progress">
                            <div className="progress__bar" style={{ width: `${mv}%`, background: color }} />
                          </div>
                        </div>
                        <div className="kp-row__val">{mv}%</div>
                      </div>
                    );
                  })}
              </div>
            </>
          )}
        </div>

        {r.weak_points?.length > 0 && (
          <div className="card card--warning" style={{ marginTop: 12 }}>
            <strong>薄弱知识点（诊断）</strong>
            <div className="chip-row" style={{ marginTop: 8 }}>
              {r.weak_points.map((w: string) => (
                <span
                  key={w}
                  className="chip chip--warn chip--click"
                  onClick={() => nav(`/practice?kp=${encodeURIComponent(w)}`)}
                  title="点击去专项练习"
                >
                  {w}
                </span>
              ))}
            </div>
            <button
              className="btn btn--primary btn--block"
              style={{ marginTop: 10 }}
              onClick={() => nav(`/practice?kp=${encodeURIComponent(r.weak_points.join(","))}`)}
            >
              一键混合薄弱点练习包（{r.weak_points.length} 个）→
            </button>
            <button
              className="btn btn--ghost btn--block"
              style={{ marginTop: 8 }}
              onClick={() =>
                nav(
                  `/chat?q=${encodeURIComponent(
                    `帮我针对薄弱点（${r.weak_points.join("、")}）制定一份优先提分计划，每个点给一道配套例题与口诀`
                  )}`
                )
              }
            >
              问 AI 私教：薄弱点怎么破 →
            </button>
          </div>
        )}

        {r.suggestions?.length > 0 && (
          <div className="card" style={{ marginTop: 12 }}>
            <strong style={{ display: "block", marginBottom: 6 }}>提升建议</strong>
            {r.suggestions.map((s: string, i: number) => (
              <div key={i} style={{ fontSize: 14, margin: "4px 0", color: "var(--text-2)" }}>
                · {s}
              </div>
            ))}
          </div>
        )}

        {(() => {
          const t = computeTrend(overall);
          if (!t) return null;
          const diffCls =
            t.diff > 0 ? "rate-trend--up" : t.diff < 0 ? "rate-trend--down" : "rate-trend--flat";
          const arrow = t.diff > 0 ? "▲" : t.diff < 0 ? "▼" : "—";
          const verdict =
            t.diff > 0
              ? "持续进步，保持节奏！"
              : t.diff < 0
              ? "略有回落，针对性补强即可追平。"
              : "稳住了基线，向更高分冲刺。";
          return (
            <div className="card card--soft" style={{ marginTop: 12 }}>
              <strong style={{ display: "block", marginBottom: 4 }}>成长趋势小结</strong>
              <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
                基于 {t.count} 次历史测评的整体轨迹
              </div>
              <div className="trend-grid">
                <div className="trend-cell">
                  <div className="trend-cell__val">{t.firstPct}%</div>
                  <div className="trend-cell__label">首次</div>
                </div>
                <div className="trend-cell">
                  <div className="trend-cell__val">{t.bestPct}%</div>
                  <div className="trend-cell__label">最佳</div>
                </div>
                <div className="trend-cell">
                  <div className="trend-cell__val">{t.avgPct}%</div>
                  <div className="trend-cell__label">平均</div>
                </div>
              </div>
              <div className="trend-summary" style={{ marginTop: 10 }}>
                本次较首次
                <span className={"rate-trend " + diffCls}>
                  {arrow} {t.diff > 0 ? "+" : ""}
                  {t.diff} 个百分点
                </span>
                {verdict}
              </div>
            </div>
          );
        })()}

        {r.details?.length > 0 && (
          <>
            <h3 className="section-title" style={{ marginTop: 16 }}>逐题回顾</h3>
            {r.details.map((d: any, i: number) => {
              const opts: Array<{ label: string; content: string; is_correct: boolean }> = d.options || [];
              const userLabels = new Set((d.selected || "").split("").filter(Boolean));
              return (
                <div className="card adetail" key={d.question_id} style={{ marginTop: 12 }}>
                  <div className="row row--between">
                    <span className="text-3">
                      第 {i + 1} 题{d.knowledge_point ? ` · ${d.knowledge_point}` : ""}
                    </span>
                    <span className={d.is_correct ? "text-success" : "text-danger"}>
                      {d.is_correct ? "✔ 答对" : "✘ 答错"}
                    </span>
                  </div>
                  <div className="q-item__stem" style={{ marginTop: 4 }}>{d.stem}</div>
                  {opts.length > 0 ? (
                    <div className="adetail-opts">
                      {opts.map((o) => {
                        const isUser = userLabels.has(o.label);
                        const cls =
                          o.is_correct
                            ? " adopt--correct"
                            : isUser
                            ? " adopt--wrong"
                            : "";
                        return (
                          <div key={o.label} className={"adopt" + cls}>
                            <b>{o.label}.</b> <span>{o.content}</span>
                            {o.is_correct && <span className="adopt__mark">正确答案</span>}
                            {isUser && !o.is_correct && (
                              <span className="adopt__mark adopt__mark--wrong">你的作答</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                      正确答案：<b className="text-brand">{d.correct_answer}</b>
                      {d.selected ? `（你的作答：${d.selected}）` : ""}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </>
    );
  }

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
  }

  // 成长趋势：基于历史测评记录计算首次/最佳/平均与本次对比（导出与内联展示共用）
  function computeTrend(overallPct: number) {
    if (history.length === 0) return null;
    const asc = [...history].reverse(); // 时间升序（history 最新在前）
    const firstPct = Math.round((asc[0].overall || 0) * 100);
    const bestPct = Math.max(...history.map((h) => Math.round((h.overall || 0) * 100)));
    const avgPct = Math.round((history.reduce((a, h) => a + (h.overall || 0), 0) / history.length) * 100);
    const diff = overallPct - firstPct; // 本次较首次，单位百分点
    return { count: history.length, firstPct, bestPct, avgPct, diff };
  }

  function reportToMarkdown(rep: AssessmentReport | AssessmentRecordOut): string {
    const r = rep as any;
    const overall = Math.round((r.overall || 0) * 100);
    const total = r.total ?? r.questions_total;
    const correct = r.correct ?? r.questions_total;
    const lines: string[] = [
      "# 能力测评报告",
      "",
      `> ${fmtDate(r.created_at)} · 总体掌握度 **${overall}%**（答对 ${correct}/${total}）`,
      "",
      "## 能力雷达（各知识点掌握度）",
    ];
    (r.dimensions || []).forEach((d: AssessmentDim) => {
      lines.push(`- ${d.knowledge_point}：${Math.round(d.mastery * 100)}%`);
    });
    if (r.weak_points?.length) {
      lines.push("", "## 薄弱知识点");
      r.weak_points.forEach((w: string) => lines.push(`- ${w}`));
    }
    if (r.suggestions?.length) {
      lines.push("", "## 提升建议");
      r.suggestions.forEach((s: string) => lines.push(`- ${s}`));
    }
    if (r.details?.length) {
      lines.push("", "## 逐题回顾");
      r.details.forEach((d: any, i: number) => {
        lines.push(
          "",
          `**第 ${i + 1} 题**${d.knowledge_point ? ` · ${d.knowledge_point}` : ""}：${
            d.is_correct ? "✔ 答对" : "✘ 答错"
          }`
        );
        lines.push(d.stem);
        if (!d.is_correct)
          lines.push(`正确答案：${d.correct_answer}${d.selected ? `（你的作答：${d.selected}）` : ""}`);
      });
    }
    // 成长趋势说明（基于历史测评记录，复用 computeTrend）
    lines.push("", "## 成长趋势");
    const t = computeTrend(overall);
    if (t) {
      lines.push(`- 历史测评次数：${t.count} 次`);
      lines.push(`- 首次测评掌握度：${t.firstPct}%`);
      lines.push(`- 历史最佳掌握度：${t.bestPct}%`);
      lines.push(`- 历史平均掌握度：${t.avgPct}%`);
      lines.push(`- 本次较首次：${t.diff >= 0 ? "▲ 提升" : "▼ 下降"} ${Math.abs(t.diff)} 个百分点`);
    } else {
      lines.push("- 这是你的首次测评，已建立能力基线；完成后续测评即可对比成长轨迹。");
    }

    return lines.join("\n");
  }

  function exportReport(rep: AssessmentReport | AssessmentRecordOut) {
    triggerDownload(`能力测评报告_${stamp()}.md`, reportToMarkdown(rep));
    flash("已导出测评报告（Markdown）");
  }

  async function shareReport(rep: AssessmentReport | AssessmentRecordOut) {
    const res = await shareOrCopy("我的公考能力测评报告", reportToMarkdown(rep));
    flash(res === "shared" ? "已唤起分享" : res === "copied" ? "已复制报告内容" : "分享已取消");
  }

  return (
    <section>
      <h2 className="page-title">能力测评</h2>
      {err && <div className="err-text">{err}</div>}
      {toast && <div className="ok-text ok-text--float">{toast}</div>}

      {phase === "setup" && (
        <div className="card">
          <p className="muted" style={{ marginTop: 0 }}>
            系统性诊断你的公考能力短板：覆盖各知识点的均衡诊断卷，完成后生成
            <b>能力雷达图</b>、薄弱点清单与针对性提升建议，并自动存入成长轨迹。
          </p>
          <div className="card card--warning" style={{ fontSize: 13 }}>
            与「在线模考」区别：模考看分数排名，能力测评聚焦
            <b>知识点维度的掌握度画像</b>，是制定学习计划的依据。
          </div>
          <button className="btn btn--primary btn--block" style={{ marginTop: 14 }} disabled={busy} onClick={start}>
            {busy ? "组卷中…" : "开始能力测评"}
          </button>
          <button
            className="btn btn--ghost btn--block"
            style={{ marginTop: 8 }}
            disabled={busy}
            onClick={() => setPhase("history")}
          >
            查看测评历史 →
          </button>
        </div>
      )}

      {phase === "doing" && cur && (
        <>
          <div className="exam-bar">
            <span className="tag tag--brand">{cur.knowledge_point}</span>
            <span className="text-3">第 {idx + 1}/{paper.length} 题</span>
            <span className="text-3">已答 {answeredCount}/{paper.length}</span>
          </div>
          <div className="progress" style={{ marginTop: 8, height: 6 }}>
            <div className="progress__bar" style={{ width: `${Math.round((answeredCount / paper.length) * 100)}%` }} />
          </div>
          <div className="card" style={{ marginTop: 12 }}>
            <div className="q-item__meta" style={{ marginBottom: 4 }}>
              <span className="tag tag--brand">{cur.subject}</span>
              <span>· 难度 {cur.difficulty}</span>
              {!cur.is_verified && <span className="tag">待核实</span>}
            </div>
            <div style={{ fontSize: 15, lineHeight: 1.5 }}>{cur.stem}</div>
            {cur.options.map((o) => (
              <label key={o.id} className={"opt" + (selected === o.label ? " opt--selected" : "")}>
                <input
                  type="radio"
                  name={`a-${cur.id}`}
                  checked={selected === o.label}
                  onChange={() => setSelected(o.label)}
                />
                <b>{o.label}.</b> <span>{o.content}</span>
              </label>
            ))}
            <button
              className="btn btn--primary btn--block"
              style={{ marginTop: 12 }}
              disabled={!selected || busy}
              onClick={next}
            >
              {busy ? "提交中…" : idx + 1 < paper.length ? "下一题 →" : "交卷并生成报告"}
            </button>
            <div className="muted" style={{ fontSize: 12, marginTop: 8, textAlign: "center" }}>
              ⌨ A–D / 1–4 选择 · Enter 下一题 · Esc 取消选择
            </div>
          </div>
        </>
      )}

      {phase === "report" && report && (
        <>
          {renderReport(report)}
          <div className="export-bar" style={{ marginTop: 16 }}>
            <button className="btn btn--sm btn--ghost" disabled={busy} onClick={() => exportReport(report)}>
              导出报告
            </button>
            <button className="btn btn--sm btn--ghost" disabled={busy} onClick={() => shareReport(report)}>
              分享成绩
            </button>
          </div>
          <div className="row" style={{ marginTop: 12, gap: 8 }}>
            <button className="btn btn--primary" style={{ flex: 1 }} disabled={busy} onClick={start}>
              重新测评
            </button>
            <button
              className="btn btn--ghost"
              style={{ flex: 1 }}
              disabled={busy}
              onClick={() => setPhase("history")}
            >
              测评历史
            </button>
          </div>
          <button className="btn btn--ghost btn--block" style={{ marginTop: 8 }} onClick={() => nav("/plan")}>
            生成专属学习计划 →
          </button>
        </>
      )}

      {phase === "history" && (
        <div>
          {history.length >= 2 && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div className="row row--between">
                <strong>能力成长趋势</strong>
                <span className="muted" style={{ fontSize: 12 }}>总体掌握度</span>
              </div>
              <LineChart
                points={[...history]
                  .reverse()
                  .map((h) => ({
                    label: h.created_at.slice(5, 10),
                    value: Math.round((h.overall || 0) * 100),
                  }))}
                max={100}
                min={0}
                unit="%"
                color="var(--brand)"
              />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                每次测评的总体掌握度随时间走势；越往上说明能力画像越扎实。
              </div>
            </div>
          )}
          <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
            已加载 {history.length} 次测评记录（能力成长轨迹）
            {history.length < 2 && " · 再完成 1 次即可解锁成长趋势曲线"}
          </div>
          {history.length === 0 && !hisLoading && (
            <div className="card">
              <EmptyState tight icon="assess" title="还没有测评记录" desc="去完成一次能力测评，生成你的能力雷达图。" />
                <div className="empty__action">
                  <button className="btn btn--primary btn--sm" onClick={start}>
                    开始测评 →
                  </button>
                </div>
            </div>
          )}

          {hisLoading && history.length === 0 && (
            <>
              {[0, 1, 2].map((i) => (
                <div className="card" key={i} style={{ marginTop: 12 }}>
                  <div className="skeleton-line" style={{ width: "45%" }} />
                  <div className="skeleton-line" style={{ width: "80%", marginTop: 10 }} />
                  <div className="skeleton-line" style={{ width: "30%", marginTop: 10 }} />
                </div>
              ))}
            </>
          )}
          {history.map((h, idx) => {
            const rate = Math.round((h.overall || 0) * 100);
            const tone = rate >= 70 ? "rate--good" : rate >= 50 ? "rate--mid" : "rate--bad";
            // 历史按时间倒序：当前记录的下一条即「上一次」测评，据此计算成长标记
            const prev = idx + 1 < history.length ? Math.round((history[idx + 1].overall || 0) * 100) : null;
            const diff = prev !== null ? rate - prev : null;
            const trendCls = diff == null ? "" : diff > 0 ? "rate-trend--up" : diff < 0 ? "rate-trend--down" : "rate-trend--flat";
            const trendText =
              diff == null ? "" : diff > 0 ? `▲ +${diff} 较上次` : diff < 0 ? `▼ ${diff} 较上次` : "— 持平";
            return (
              <div
                key={h.id}
                className="q-item"
                role="button"
                tabIndex={0}
                onClick={() => openDetail(h.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openDetail(h.id);
                  }
                }}
              >
                <div className="q-item__meta">
                  <span className="text-3">{fmtDate(h.created_at)}</span>
                  <span className="text-3">· {h.questions_total} 题</span>
                </div>
                <div className="row row--between" style={{ marginTop: 4 }}>
                  <span>总体掌握度</span>
                  <span className={"big-rate " + tone} style={{ fontSize: 22 }}>
                    {rate}
                    <span>%</span>
                  </span>
                </div>
                {diff !== null && (
                  <div className="row row--between" style={{ marginTop: 2 }}>
                    <span className="text-3">较上次测评</span>
                    <span className={"rate-trend " + trendCls} style={{ fontSize: 13 }}>
                      {trendText}
                    </span>
                  </div>
                )}
                {h.weak_points.length > 0 && (
                  <div className="text-3" style={{ fontSize: 12, marginTop: 4 }}>
                    薄弱：{h.weak_points.slice(0, 3).join("、")}
                  </div>
                )}
              </div>
            );
          })}
          {hisHasMore && (
            <button className="btn btn--ghost btn--block" style={{ marginTop: 14 }} disabled={hisLoadingMore} onClick={loadMoreHistory}>
              {hisLoadingMore ? "加载中…" : "加载更多测评记录"}
            </button>
          )}
          <button className="btn btn--primary btn--block" style={{ marginTop: 14 }} disabled={busy} onClick={start}>
            开始新测评
          </button>
        </div>
      )}

      {phase === "historyDetail" && detail && (
        <>
          <button className="back-link" onClick={() => setPhase("history")}>
            ← 返回历史列表
          </button>
          {renderReport(detail, prevOverall)}
          <div className="export-bar" style={{ marginTop: 12 }}>
            <button className="btn btn--sm btn--ghost" disabled={busy} onClick={() => exportReport(detail)}>
              导出报告
            </button>
            <button className="btn btn--sm btn--ghost" disabled={busy} onClick={() => shareReport(detail)}>
              分享成绩
            </button>
          </div>
          <button className="btn btn--ghost btn--block" style={{ marginTop: 12 }} onClick={() => setPhase("history")}>
            返回历史列表
          </button>
        </>
      )}
    </section>
  );
}

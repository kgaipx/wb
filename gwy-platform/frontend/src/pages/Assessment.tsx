import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  api,
  AssessmentPaperItem,
  AssessmentReport,
  AssessmentRecordOut,
  AssessmentDim,
} from "../api/client";
import { triggerDownload, shareOrCopy, stamp } from "../utils/exportUtils";

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
        <polygon key={i} points={ring} fill="none" stroke="#e6e9f0" strokeWidth={1} />
      ))}
      {dims.map((_, i) => {
        const [x, y] = pt(i, R);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#e6e9f0" strokeWidth={1} />;
      })}
      <polygon points={dataPoly} fill="rgba(59,111,224,0.22)" stroke="#3b6fe0" strokeWidth={2} />
      {dataPts.map((p, i) => (
        <circle
          key={i}
          cx={p[0]}
          cy={p[1]}
          r={3.5}
          fill={dims[i].mastery < 0.6 ? "#e0533b" : "#3b6fe0"}
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
            fill={d.mastery < 0.6 ? "#e0533b" : "#4a5160"}
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
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [toast, setToast] = useState("");

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
  const [hisLoadingMore, setHisLoadingMore] = useState(false);
  const [hisHasMore, setHisHasMore] = useState(false);

  async function loadHistory(reset = true) {
    const off = reset ? 0 : hisOffset;
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

  async function openDetail(id: number) {
    setBusy(true);
    setErr("");
    try {
      setDetail(await api.assessmentHistoryDetail(id));
      setPhase("historyDetail");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const cur = paper[idx];
  const answeredCount = paper.filter((q) => answers[q.id]).length;

  function renderReport(rep: AssessmentReport | AssessmentRecordOut) {
    const r = rep as any;
    const overall = Math.round((r.overall || 0) * 100);
    const tone = overall >= 70 ? "rate--good" : overall >= 50 ? "rate--mid" : "rate--bad";
    const dims: AssessmentDim[] = r.dimensions || [];
    const total = r.total ?? r.questions_total;
    const correct = r.correct ?? r.questions_total;
    return (
      <>
        <div className="card report-hero">
          <div className={"big-rate " + tone}>{overall}<span>%</span></div>
          <div className="muted">总体掌握度 · 答对 {correct} / {total} 题</div>
        </div>

        <div className="card" style={{ marginTop: 12 }}>
          <strong style={{ display: "block", marginBottom: 6 }}>能力雷达图（各知识点掌握度）</strong>
          <RadarChart dims={dims} />
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
              onClick={() => nav(`/practice?kp=${encodeURIComponent(r.weak_points[0])}`)}
            >
              针对薄弱点去专项练习 →
            </button>
          </div>
        )}

        {r.suggestions?.length > 0 && (
          <div className="card" style={{ marginTop: 12 }}>
            <strong style={{ display: "block", marginBottom: 6 }}>提升建议</strong>
            {r.suggestions.map((s: string, i: number) => (
              <div key={i} style={{ fontSize: 14, margin: "4px 0", color: "#374151" }}>
                · {s}
              </div>
            ))}
          </div>
        )}

        {r.details?.length > 0 && (
          <>
            <h3 className="section-title" style={{ marginTop: 16 }}>逐题回顾</h3>
            {r.details.map((d: any, i: number) => (
              <div className="card" key={d.question_id} style={{ marginTop: 12 }}>
                <div className="row row--between">
                  <span className="text-3">
                    第 {i + 1} 题{d.knowledge_point ? ` · ${d.knowledge_point}` : ""}
                  </span>
                  <span className={d.is_correct ? "text-success" : "text-danger"}>
                    {d.is_correct ? "✔ 答对" : "✘ 答错"}
                  </span>
                </div>
                <div className="q-item__stem" style={{ marginTop: 4 }}>{d.stem}</div>
                {!d.is_correct && (
                  <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                    正确答案：<b className="text-brand">{d.correct_answer}</b>
                    {d.selected ? `（你的作答：${d.selected}）` : ""}
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </>
    );
  }

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
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
          <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
            已加载 {history.length} 次测评记录（能力成长轨迹）
          </div>
          {history.length === 0 && (
            <div className="card">
              <div className="muted">还没有测评记录，去完成一次能力测评吧。</div>
              <button className="btn btn--primary btn--sm" style={{ marginTop: 10 }} onClick={start}>
                开始测评 →
              </button>
            </div>
          )}
          {history.map((h) => {
            const rate = Math.round((h.overall || 0) * 100);
            const tone = rate >= 70 ? "rate--good" : rate >= 50 ? "rate--mid" : "rate--bad";
            return (
              <button key={h.id} className="q-item" onClick={() => openDetail(h.id)}>
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
                {h.weak_points.length > 0 && (
                  <div className="text-3" style={{ fontSize: 12, marginTop: 4 }}>
                    薄弱：{h.weak_points.slice(0, 3).join("、")}
                  </div>
                )}
              </button>
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
          {renderReport(detail)}
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

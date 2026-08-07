import { useEffect, useState } from "react";
import { api } from "../api/client";

interface PaperQ {
  id: number;
  subject: string;
  category: string;
  qtype: string;
  stem: string;
  difficulty: number;
  knowledge_point: string;
  options: { id: number; label: string; content: string }[];
}
type Phase = "setup" | "doing" | "report" | "history" | "historyDetail";

// 模考为限时客观题组卷（自动评分）；申论属主观题需 AI 批改，不纳入自动模考，请到「申论批改」专项训练
const SUBJECTS = [
  { v: "", label: "全部科目" },
  { v: "行测", label: "行测" },
];

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}-${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function Exam() {
  const [tab, setTab] = useState<"exam" | "history">("exam");
  const [phase, setPhase] = useState<Phase>("setup");
  const [subject, setSubject] = useState("");
  const [count, setCount] = useState(20);
  const [paper, setPaper] = useState<PaperQ[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [report, setReport] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  const [history, setHistory] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);

  async function loadHistory() {
    try {
      setHistory(await api.examHistory(30));
    } catch (e: any) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    if (tab === "history") loadHistory();
  }, [tab]);

  async function start() {
    setBusy(true);
    setErr("");
    setInfo("");
    try {
      const r = await api.examStart(subject || undefined, count);
      if (r.count < r.requested) {
        setInfo(`「${r.subject}」题库当前共 ${r.count} 题，已按实际题量组卷（你选择的 ${r.requested} 题超出可用题量）。`);
      }
      setPaper(r.paper);
      setAnswers({});
      setPhase("doing");
    } catch (e: any) {
      if (e.status === 404) {
        setErr("该科目暂无可组卷题目，请尝试「全部科目」或选择其他科目。");
      } else {
        setErr(e.message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setBusy(true);
    setErr("");
    try {
      const ans = paper.map((q) => ({ question_id: q.id, selected: answers[q.id] || "" }));
      const r = await api.examSubmit(ans);
      setReport(r);
      setPhase("report");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function openDetail(id: number) {
    setBusy(true);
    setErr("");
    try {
      setDetail(await api.examHistoryDetail(id));
      setPhase("historyDetail");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const answered = paper.filter((q) => answers[q.id]).length;
  const byId = new Map(paper.map((q) => [q.id, q]));

  function renderReport(rep: any, getStem: (d: any) => string | undefined) {
    const rate = Math.round((rep.correct_rate || 0) * 100);
    const tone = rate >= 70 ? "rate--good" : rate >= 50 ? "rate--mid" : "rate--bad";
    return (
      <>
        <div className="card report-hero">
          <div className={"big-rate " + tone}>{rate}<span>%</span></div>
          <div className="muted">正确率 · 答对 {rep.correct}/{rep.total} 题</div>
        </div>
        <div className="card card--warning" style={{ marginTop: 12 }}>
          <strong>薄弱知识点（AI 诊断）</strong>
          <div className="chip-row" style={{ marginTop: 8 }}>
            {rep.weak_points.length ? (
              rep.weak_points.map((w: string) => <span key={w} className="chip chip--warn">{w}</span>)
            ) : (
              <span className="muted">无明显薄弱点，保持节奏 👍</span>
            )}
          </div>
        </div>
        <h3 className="section-title" style={{ marginTop: 16 }}>逐题回顾</h3>
        {rep.details.map((d: any, i: number) => (
          <div className="card" key={d.question_id} style={{ marginTop: 12 }}>
            <div className="row row--between">
              <span className="text-3">第 {i + 1} 题{d.knowledge_point ? ` · ${d.knowledge_point}` : ""}</span>
              <span className={d.is_correct ? "text-success" : "text-danger"}>
                {d.is_correct ? "✔ 答对" : "✘ 答错"}
              </span>
            </div>
            {getStem(d) && <div className="q-item__stem" style={{ marginTop: 4 }}>{getStem(d)}</div>}
            {!d.is_correct && (
              <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                正确答案：<b className="text-brand">{d.correct_answer}</b>
                {d.selected ? `（你的作答：${d.selected}）` : ""}
              </div>
            )}
          </div>
        ))}
      </>
    );
  }

  return (
    <section>
      <h2 className="page-title">在线模考</h2>
      <div className="chip-row" style={{ marginBottom: 12 }}>
        <button className={"chip" + (tab === "exam" ? " chip--on" : "")} onClick={() => setTab("exam")}>模考</button>
        <button className={"chip" + (tab === "history" ? " chip--on" : "")} onClick={() => setTab("history")}>历史</button>
      </div>
      {err && <div className="err-text">{err}</div>}
      {info && <div className="info-text">{info}</div>}

      {tab === "exam" && phase === "setup" && (
        <div className="card">
          <p className="muted" style={{ marginTop: 0 }}>
            还原真实考场节奏：限时组卷、隐藏答案，交卷后生成「提分报告」（正确率 + 薄弱知识点），并自动存入历史可随时复盘。
          </p>
          <div className="field-label">选择科目</div>
          <div className="chip-row">
            {SUBJECTS.map((s) => (
              <button key={s.v} className={"chip" + (subject === s.v ? " chip--on" : "")} onClick={() => setSubject(s.v)}>
                {s.label}
              </button>
            ))}
          </div>
          <div className="field-label" style={{ marginTop: 12 }}>题量</div>
          <div className="chip-row">
            {[10, 20, 30].map((n) => (
              <button key={n} className={"chip" + (count === n ? " chip--on" : "")} onClick={() => setCount(n)}>
                {n} 题
              </button>
            ))}
          </div>
          <button className="btn btn--primary btn--block" style={{ marginTop: 16 }} disabled={busy} onClick={start}>
            {busy ? "组卷中…" : "开始模考"}
          </button>
        </div>
      )}

      {tab === "exam" && phase === "doing" && (
        <>
          {info && <div className="info-text" style={{ marginBottom: 10 }}>{info}</div>}
          <div className="exam-bar">
            <span className="tag tag--brand">{subject || "全部"}</span>
            <span className="text-3">已答 {answered}/{paper.length}</span>
            <button className="btn btn--primary btn--sm" disabled={busy} onClick={submit}>
              {busy ? "阅卷中…" : "交卷"}
            </button>
          </div>
          {paper.map((q, i) => (
            <div className="card" key={q.id} style={{ marginTop: 12 }}>
              <div className="q-item__meta" style={{ marginBottom: 4 }}>
                <span className="text-3">第 {i + 1} 题</span>
                <span className="tag tag--brand">{q.knowledge_point}</span>
                <span>· 难度 {q.difficulty}</span>
              </div>
              <div style={{ fontSize: 15, lineHeight: 1.5 }}>{q.stem}</div>
              {q.options.map((o) => (
                <label key={o.id} className={"opt" + (answers[q.id] === o.label ? " opt--selected" : "")}>
                  <input
                    type="radio"
                    name={`q-${q.id}`}
                    checked={answers[q.id] === o.label}
                    onChange={() => setAnswers((s) => ({ ...s, [q.id]: o.label }))}
                  />
                  <b>{o.label}.</b> <span>{o.content}</span>
                </label>
              ))}
            </div>
          ))}
          <button className="btn btn--primary btn--block" style={{ marginTop: 14 }} disabled={busy} onClick={submit}>
            {busy ? "阅卷中…" : `交卷（已答 ${answered}/${paper.length}）`}
          </button>
        </>
      )}

      {tab === "exam" && phase === "report" && (
        <>
          {renderReport(report, (d) => byId.get(d.question_id)?.stem)}
          <button className="btn btn--ghost btn--block" style={{ marginTop: 16 }} onClick={() => { setPhase("setup"); setTab("history"); }}>
            查看模考历史 →
          </button>
        </>
      )}

      {tab === "history" && phase !== "historyDetail" && (
        <div>
          <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>共 {history.length} 次模考记录</div>
          {history.length === 0 && (
            <div className="card">
              <div className="muted">还没有模考记录，去「模考」完成一次吧。</div>
              <button className="btn btn--primary btn--sm" style={{ marginTop: 10 }} onClick={() => setTab("exam")}>去模考 →</button>
            </div>
          )}
          {history.map((h) => {
            const rate = Math.round((h.correct_rate || 0) * 100);
            const tone = rate >= 70 ? "rate--good" : rate >= 50 ? "rate--mid" : "rate--bad";
            return (
              <button key={h.id} className="q-item" onClick={() => openDetail(h.id)}>
                <div className="q-item__meta">
                  <span className="tag tag--brand">{h.subject}</span>
                  <span className="text-3">{fmtDate(h.created_at)}</span>
                </div>
                <div className="row row--between" style={{ marginTop: 4 }}>
                  <span>答对 {h.correct}/{h.total}</span>
                  <span className={"big-rate " + tone} style={{ fontSize: 22 }}>{rate}<span>%</span></span>
                </div>
                {h.weak_points.length > 0 && (
                  <div className="text-3" style={{ fontSize: 12, marginTop: 4 }}>薄弱：{h.weak_points.slice(0, 3).join("、")}</div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {tab === "history" && phase === "historyDetail" && detail && (
        <>
          <button className="back-link" onClick={() => setPhase("history")}>← 返回历史列表</button>
          {renderReport(detail, (d) => d.stem)}
          <button className="btn btn--ghost btn--block" style={{ marginTop: 16 }} onClick={() => setPhase("history")}>
            返回历史列表
          </button>
        </>
      )}
    </section>
  );
}

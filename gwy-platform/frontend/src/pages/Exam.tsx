import { useState } from "react";
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
type Phase = "setup" | "doing" | "report";

const SUBJECTS = [
  { v: "", label: "全部科目" },
  { v: "行测", label: "行测" },
  { v: "申论", label: "申论" },
];

export default function Exam() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [subject, setSubject] = useState("");
  const [count, setCount] = useState(20);
  const [paper, setPaper] = useState<PaperQ[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [report, setReport] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function start() {
    setBusy(true);
    setErr("");
    try {
      const r = await api.examStart(subject || undefined, count);
      setPaper(r.paper);
      setAnswers({});
      setPhase("doing");
    } catch (e: any) {
      setErr(e.message);
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

  const answered = paper.filter((q) => answers[q.id]).length;
  const byId = new Map(paper.map((q) => [q.id, q]));

  if (phase === "setup") {
    return (
      <section>
        <h2 className="page-title">在线模考</h2>
        <div className="card">
          <p className="muted" style={{ marginTop: 0 }}>
            还原真实考场节奏：限时组卷、隐藏答案，交卷后生成「提分报告」（正确率 + 薄弱知识点）。
          </p>
          <div className="field-label">选择科目</div>
          <div className="chip-row">
            {SUBJECTS.map((s) => (
              <button
                key={s.v}
                className={"chip" + (subject === s.v ? " chip--on" : "")}
                onClick={() => setSubject(s.v)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="field-label" style={{ marginTop: 12 }}>题量</div>
          <div className="chip-row">
            {[10, 20, 30].map((n) => (
              <button
                key={n}
                className={"chip" + (count === n ? " chip--on" : "")}
                onClick={() => setCount(n)}
              >
                {n} 题
              </button>
            ))}
          </div>
          {err && <div className="err-text">{err}</div>}
          <button className="btn btn--primary btn--block" style={{ marginTop: 16 }} disabled={busy} onClick={start}>
            {busy ? "组卷中…" : "开始模考"}
          </button>
        </div>
      </section>
    );
  }

  if (phase === "doing") {
    return (
      <section>
        <h2 className="page-title">模考进行中</h2>
        <div className="exam-bar">
          <span className="tag tag--brand">{subject || "全部"}</span>
          <span className="text-3">已答 {answered}/{paper.length}</span>
          <button className="btn btn--primary btn--sm" disabled={busy} onClick={submit}>
            {busy ? "阅卷中…" : "交卷"}
          </button>
        </div>
        {err && <div className="err-text">{err}</div>}
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
      </section>
    );
  }

  // report
  const rate = Math.round((report.correct_rate || 0) * 100);
  const tone = rate >= 70 ? "rate--good" : rate >= 50 ? "rate--mid" : "rate--bad";
  return (
    <section>
      <h2 className="page-title">提分报告</h2>
      <div className="card report-hero">
        <div className={"big-rate " + tone}>{rate}<span>%</span></div>
        <div className="muted">正确率 · 答对 {report.correct}/{report.total} 题</div>
      </div>

      <div className="card card--warning" style={{ marginTop: 12 }}>
        <strong>薄弱知识点（AI 诊断）</strong>
        <div className="chip-row" style={{ marginTop: 8 }}>
          {report.weak_points.length ? (
            report.weak_points.map((w: string) => (
              <span key={w} className="chip chip--warn">{w}</span>
            ))
          ) : (
            <span className="muted">无明显薄弱点，保持节奏 👍</span>
          )}
        </div>
      </div>

      <h3 className="section-title" style={{ marginTop: 16 }}>逐题回顾</h3>
      {report.details.map((d: any, i: number) => {
        const q = byId.get(d.question_id);
        return (
          <div className="card" key={d.question_id} style={{ marginTop: 12 }}>
            <div className="row row--between">
              <span className="text-3">第 {i + 1} 题{q ? ` · ${q.knowledge_point}` : ""}</span>
              <span className={d.is_correct ? "text-success" : "text-danger"}>
                {d.is_correct ? "✔ 答对" : "✘ 答错"}
              </span>
            </div>
            {q && <div className="q-item__stem" style={{ marginTop: 4 }}>{q.stem}</div>}
            {!d.is_correct && (
              <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                正确答案：<b className="text-brand">{d.correct_answer}</b>
              </div>
            )}
          </div>
        );
      })}

      <button className="btn btn--ghost btn--block" style={{ marginTop: 16 }} onClick={() => setPhase("setup")}>
        再来一套
      </button>
    </section>
  );
}

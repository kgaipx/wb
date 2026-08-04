import { useEffect, useState } from "react";
import { api, Question } from "../api/client";

export default function Practice() {
  const [list, setList] = useState<Question[]>([]);
  const [active, setActive] = useState<Question | null>(null);
  const [selected, setSelected] = useState("");
  const [result, setResult] = useState<any>(null);
  const [explain, setExplain] = useState<string>("");
  const [cites, setCites] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.bankList({ limit: 50 })
      .then(setList)
      .catch((e) => setErr(e.message));
  }, []);

  async function submit() {
    if (!active || !selected) return;
    setBusy(true);
    setErr("");
    try {
      const r = await api.practice(active.id, selected);
      setResult(r);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function askTutor() {
    if (!active) return;
    setBusy(true);
    try {
      const r = await api.explain(active.id, selected || undefined);
      setExplain(r.explanation);
      setCites(r.citations);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2>刷题</h2>
      {err && <div style={{ color: "#dc2626", fontSize: 13 }}>{err}</div>}

      {!active && (
        <div style={{ display: "grid", gap: 8 }}>
          {list.map((q) => (
            <button key={q.id} style={itemCard} onClick={() => { setActive(q); setSelected(""); setResult(null); setExplain(""); }}>
              <div style={{ fontSize: 13, color: "#888" }}>{q.subject} · {q.knowledge_point} · 难度{q.difficulty}</div>
              <div style={{ fontSize: 15, marginTop: 2 }}>{q.stem}</div>
            </button>
          ))}
          {list.length === 0 && <div style={{ color: "#888" }}>题库加载中…</div>}
        </div>
      )}

      {active && (
        <div style={card}>
          <button style={{ background: "none", border: "none", color: "#2563eb", padding: 0, marginBottom: 8 }} onClick={() => setActive(null)}>← 返回题库</button>
          <div style={{ fontSize: 13, color: "#888" }}>{active.subject} · {active.knowledge_point}</div>
          <div style={{ fontSize: 16, margin: "6px 0 12px" }}>{active.stem}</div>

          {active.options.map((o) => (
            <label key={o.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 10px", border: "1px solid #eee", borderRadius: 8, marginBottom: 6, cursor: "pointer", background: selected === o.label ? "#eef4ff" : "#fff" }}>
              <input type="radio" name="opt" checked={selected === o.label} onChange={() => setSelected(o.label)} />
              <b>{o.label}.</b> <span>{o.content}</span>
            </label>
          ))}

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button style={btn} disabled={busy || !selected} onClick={submit}>提交</button>
            <button style={btnGhost} disabled={busy} onClick={askTutor}>AI 私教讲解</button>
          </div>

          {result && (
            <div style={{ marginTop: 12, padding: 12, background: result.is_correct ? "#f0fdf4" : "#fef2f2", borderRadius: 8 }}>
              <b>{result.is_correct ? "✔ 答对" : `✘ 答错，正确答案：${result.correct_answer}`}</b>
              {result.explanation && <div style={{ marginTop: 6, fontSize: 14 }}>{result.explanation}</div>}
              <div style={{ marginTop: 6, fontSize: 12, color: "#888" }}>当前掌握度：{result.mastery}</div>
            </div>
          )}

          {explain && (
            <div style={{ marginTop: 12, padding: 12, background: "#f5f8ff", borderRadius: 8 }}>
              <b>AI 私教讲解</b>
              <div style={{ marginTop: 6, fontSize: 14, whiteSpace: "pre-wrap" }}>{explain}</div>
              {cites.length > 0 && <div style={{ marginTop: 6, fontSize: 12, color: "#888" }}>来源：{cites.join("；")}</div>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

const card: React.CSSProperties = { padding: 16, background: "#fff", borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const itemCard: React.CSSProperties = { textAlign: "left", padding: 12, background: "#fff", border: "1px solid #eee", borderRadius: 10, cursor: "pointer" };
const btn: React.CSSProperties = { flex: 1, padding: "10px 0", background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, fontSize: 15 };
const btnGhost: React.CSSProperties = { flex: 1, padding: "10px 0", background: "#fff", color: "#2563eb", border: "1px solid #2563eb", borderRadius: 8, fontSize: 15 };

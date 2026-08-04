import { useEffect, useState } from "react";
import { api, Dashboard } from "../api/client";

export default function Learn() {
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [rec, setRec] = useState<any>(null);
  const [explain, setExplain] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function load() {
    try {
      const [d, r] = await Promise.all([api.dashboard(), api.recommend(10)]);
      setDash(d);
      setRec(r);
    } catch (e: any) {
      setErr(e.message);
    }
  }
  useEffect(() => { load(); }, []);

  async function tutor(qid: number) {
    setBusy(true);
    try {
      const r = await api.explain(qid);
      setExplain((s) => ({ ...s, [qid]: r.explanation }));
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (err) return <section><h2>学习中心</h2><div style={{ color: "#dc2626" }}>{err}</div></section>;
  if (!dash) return <section><h2>学习中心</h2><div style={{ color: "#888" }}>加载中…（需先登录）</div></section>;

  return (
    <section>
      <h2>学习中心</h2>
      <div style={card}>
        <strong>学情概览</strong>
        <div style={{ fontSize: 14, color: "#555", marginTop: 4 }}>
          累计答题 {dash.total_answers} 次 · 正确率 {Math.round(dash.correct_rate * 100)}%
        </div>
        {dash.ability.map((a) => (
          <div key={a.knowledge_point} style={{ marginTop: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span>{a.knowledge_point}</span><span style={{ color: "#888" }}>{Math.round(a.mastery * 100)}%</span>
            </div>
            <div style={{ height: 6, background: "#eee", borderRadius: 4, marginTop: 2 }}>
              <div style={{ width: `${Math.round(a.mastery * 100)}%`, height: "100%", background: "#2563eb", borderRadius: 4 }} />
            </div>
          </div>
        ))}
      </div>

      <div style={{ ...card, marginTop: 12, background: "#fff7ed" }}>
        <strong>薄弱知识点（AI 诊断）</strong>
        <div style={{ fontSize: 14, marginTop: 4 }}>
          {rec && rec.knowledge_points.length ? rec.knowledge_points.join("、") : "暂无明显薄弱点，继续保持 👍"}
        </div>
      </div>

      <h3 style={{ fontSize: 15 }}>为你推荐练习</h3>
      {rec && rec.questions.map((q: any) => (
        <div key={q.id} style={itemCard}>
          <div style={{ fontSize: 13, color: "#888" }}>{q.subject} · {q.knowledge_point}</div>
          <div style={{ fontSize: 15, marginTop: 2 }}>{q.stem}</div>
          <button style={{ ...btnGhost, marginTop: 6, padding: "6px 10px", fontSize: 13 }} disabled={busy} onClick={() => tutor(q.id)}>AI 私教讲解</button>
          {explain[q.id] && <div style={{ marginTop: 8, fontSize: 14, whiteSpace: "pre-wrap", background: "#f5f8ff", padding: 10, borderRadius: 8 }}>{explain[q.id]}</div>}
        </div>
      ))}
    </section>
  );
}

const card: React.CSSProperties = { padding: 16, background: "#fff", borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const itemCard: React.CSSProperties = { textAlign: "left", padding: 12, background: "#fff", border: "1px solid #eee", borderRadius: 10, marginBottom: 8 };
const btnGhost: React.CSSProperties = { background: "#fff", color: "#2563eb", border: "1px solid #2563eb", borderRadius: 8 };

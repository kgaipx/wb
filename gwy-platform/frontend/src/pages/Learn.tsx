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
  useEffect(() => {
    load();
  }, []);

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

  if (err) return <section><h2 className="page-title">学习中心</h2><div className="err-text">{err}</div></section>;
  if (!dash) return <section><h2 className="page-title">学习中心</h2><div className="muted">加载中…（需先登录）</div></section>;

  return (
    <section>
      <h2 className="page-title">学习中心</h2>
      <div className="card">
        <strong>学情概览</strong>
        <div className="muted" style={{ marginTop: 4 }}>
          累计答题 {dash.total_answers} 次 · 正确率 {Math.round(dash.correct_rate * 100)}%
        </div>
        {dash.ability.map((a) => {
          const pct = Math.round(a.mastery * 100);
          const tone = pct >= 60 ? "progress--success" : pct >= 35 ? "" : "progress--warn";
          return (
            <div key={a.knowledge_point} style={{ marginTop: 8 }}>
              <div className="row row--between" style={{ fontSize: 13 }}>
                <span>{a.knowledge_point}</span>
                <span className="text-3">{pct}%</span>
              </div>
              <div className={"progress " + tone}>
                <div className="progress__bar" style={{ width: pct + "%" }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="card card--warning" style={{ marginTop: 12 }}>
        <strong>薄弱知识点（AI 诊断）</strong>
        <div style={{ marginTop: 4 }}>
          {rec && rec.knowledge_points.length ? rec.knowledge_points.join("、") : "暂无明显薄弱点，继续保持 👍"}
        </div>
      </div>

      <h3 className="section-title" style={{ marginTop: 16 }}>
        为你推荐练习
      </h3>
      {rec &&
        rec.questions.map((q: any) => (
          <div key={q.id} className="q-item">
            <div className="q-item__meta">
              <span className="tag tag--brand">{q.subject}</span>
              <span>{q.knowledge_point}</span>
            </div>
            <div className="q-item__stem">{q.stem}</div>
            <button className="btn btn--ghost btn--sm" style={{ marginTop: 8 }} disabled={busy} onClick={() => tutor(q.id)}>
              AI 私教讲解
            </button>
            {explain[q.id] && (
              <div className="tutor-box" style={{ marginTop: 8 }}>
                <div className="tutor-box__title">AI 私教讲解</div>
                <div className="tutor-box__body">{explain[q.id]}</div>
              </div>
            )}
          </div>
        ))}
    </section>
  );
}

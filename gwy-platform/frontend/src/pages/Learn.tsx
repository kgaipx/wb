import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, Dashboard } from "../api/client";

/** 能力图谱雷达：把知识点掌握度（0~1）可视化为自适应诊断。最多 8 个轴，超出截断。 */
function AbilityRadar({ data }: { data: { label: string; value: number }[] }) {
  const size = 240;
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - 34;
  const n = data.length;
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i: number, r: number): [number, number] => {
    const a = angle(i);
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const rings = [0.25, 0.5, 0.75, 1];
  const vPts = data.map((d, i) => pt(i, R * Math.max(0.05, Math.min(1, d.value))));
  const vPoly = vPts.map((p) => p.join(",")).join(" ");
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="radar" role="img" aria-label="能力图谱雷达">
      {rings.map((rr) => (
        <polygon key={rr} points={data.map((_, i) => pt(i, R * rr).join(",")).join(" ")} className="radar__ring" />
      ))}
      {data.map((_, i) => {
        const [x, y] = pt(i, R);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} className="radar__axis" />;
      })}
      <polygon points={vPoly} className="radar__area" />
      {vPts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={3} className="radar__dot" />
      ))}
      {data.map((d, i) => {
        const [x, y] = pt(i, R + 15);
        return (
          <text key={i} x={x} y={y} className="radar__label" textAnchor="middle" dominantBaseline="middle">
            {d.label}
          </text>
        );
      })}
    </svg>
  );
}

export default function Learn() {
  const nav = useNavigate();
  const REC_PAGE = 10;
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [rec, setRec] = useState<any>(null);
  const [explain, setExplain] = useState<Record<number, string>>({});
  const [upgradeFor, setUpgradeFor] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [recTopN, setRecTopN] = useState(REC_PAGE);
  const [recLoadingMore, setRecLoadingMore] = useState(false);
  const [recHasMore, setRecHasMore] = useState(false);

  async function load() {
    try {
      const [d, r] = await Promise.all([api.dashboard(), api.recommend(REC_PAGE)]);
      setDash(d);
      setRec(r);
      setRecTopN(REC_PAGE);
      setRecHasMore(r.questions.length === REC_PAGE);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  async function loadMoreRec() {
    if (recLoadingMore || !recHasMore || !rec) return;
    setRecLoadingMore(true);
    try {
      const next = recTopN + REC_PAGE;
      const r = await api.recommend(next);
      setRec((prev: any) => {
        const seen = new Set(prev.questions.map((q: any) => q.id));
        const added = r.questions.filter((q: any) => !seen.has(q.id));
        return { ...r, questions: [...prev.questions, ...added] };
      });
      setRecTopN(next);
      setRecHasMore(r.questions.length === next);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setRecLoadingMore(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function tutor(qid: number) {
    setBusy(true);
    setErr("");
    try {
      const r = await api.explain(qid);
      setExplain((s) => ({ ...s, [qid]: r.explanation }));
      setUpgradeFor(null);
    } catch (e: any) {
      if (e.status === 402) setUpgradeFor(qid);
      else setErr(e.message);
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
        {dash.ability.length > 0 ? (
          <div className="radar-wrap">
            <AbilityRadar
              data={dash.ability
                .slice(0, 8)
                .map((a) => ({ label: a.knowledge_point, value: a.mastery }))}
            />
            {dash.ability.length > 8 && (
              <div className="muted" style={{ fontSize: 12, textAlign: "center" }}>
                仅展示掌握度最低的 8 个知识点
              </div>
            )}
          </div>
        ) : (
          <div className="muted" style={{ marginTop: 10 }}>
            尚未产生作答数据，去「刷题」或「模考」后这里会生成你的能力图谱。
          </div>
        )}
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
        <button className="link-btn" style={{ marginTop: 6 }} onClick={() => nav("/wrong")}>
          去错题本针对性重练 →
        </button>
      </div>

      <div className="card card--soft" style={{ marginTop: 12 }}>
        <div className="row row--between">
          <strong>AI 周学习计划</strong>
          <span className="badge badge--soft">私教大脑</span>
        </div>
        <div className="muted" style={{ marginTop: 4 }}>
          把诊断、错题、收藏串成可执行日程，每天该练什么一目了然。
        </div>
        <button className="btn btn--primary btn--sm" style={{ marginTop: 10 }} onClick={() => nav("/plan")}>
          生成我的学习计划 →
        </button>
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
            {upgradeFor === q.id && (
              <div className="card card--warning" style={{ marginTop: 8 }}>
                <div className="muted" style={{ fontSize: 13 }}>
                  免费版今日 AI 讲解额度已用完，升级会员解锁无限次讲解。
                </div>
                <button className="btn btn--primary btn--sm" style={{ marginTop: 6 }} onClick={() => nav("/membership")}>
                  去升级 →
                </button>
              </div>
            )}
            {explain[q.id] && (
              <div className="tutor-box" style={{ marginTop: 8 }}>
                <div className="tutor-box__title">AI 私教讲解</div>
                <div className="tutor-box__body">{explain[q.id]}</div>
              </div>
            )}
          </div>
        ))}
        {rec && recHasMore && (
          <button className="btn btn--ghost btn--block" style={{ marginTop: 14 }} disabled={recLoadingMore} onClick={loadMoreRec}>
            {recLoadingMore ? "加载中…" : "加载更多推荐练习"}
          </button>
        )}
    </section>
  );
}

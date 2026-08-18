import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, Dashboard, KpHeatmap } from "../api/client";
import Markdown from "../components/Markdown";
import { RadarChart } from "../components/RadarChart";
import KpHeatmapView from "../components/KpHeatmap";
import EmptyState from "../components/EmptyState";

export default function Learn() {
  const nav = useNavigate();
  const REC_PAGE = 10;
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [rec, setRec] = useState<any>(null);
  const [heat, setHeat] = useState<KpHeatmap | null>(null);
  const [explain, setExplain] = useState<Record<number, string>>({});
  const [upgradeFor, setUpgradeFor] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [recTopN, setRecTopN] = useState(REC_PAGE);
  const [recLoadingMore, setRecLoadingMore] = useState(false);
  const [recHasMore, setRecHasMore] = useState(false);
  const [recRefreshing, setRecRefreshing] = useState(false);

  async function load() {
    // 三个接口独立兜底：推荐/热力图任一超时失败，不应拖垮整页「学习中心」
    const [dR, rR, hR] = await Promise.allSettled([
      api.dashboard(),
      api.recommend(REC_PAGE),
      api.kpHeatmap(),
    ]);
    if (dR.status === "fulfilled") setDash(dR.value);
    else {
      setDash(null);
      setErr("学情概览加载失败，请重试");
    }
    if (rR.status === "fulfilled") {
      const r = rR.value;
      setRec(r);
      setRecTopN(REC_PAGE);
      setRecHasMore(r.questions.length === REC_PAGE);
    } else {
      setRec(null);
    }
    if (hR.status === "fulfilled") setHeat(hR.value);
    else setHeat(null);
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

  async function refreshRec() {
    if (recRefreshing) return;
    setRecRefreshing(true);
    setErr("");
    try {
      // 随机种子驱动后端在「薄弱优先」基础上重排候选池，给出不同题目
      const seed = Math.floor(Math.random() * 1_000_000);
      const r = await api.recommend(REC_PAGE, seed);
      setRec(r);
      setRecTopN(REC_PAGE);
      setRecHasMore(r.questions.length === REC_PAGE);
      setExplain({}); // 清空已展开的讲解，避免与新题错位
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setRecRefreshing(false);
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
            <RadarChart
              series={[
                {
                  name: "当前掌握度",
                  color: "var(--brand)",
                  data: [...dash.ability]
                    .sort((a, b) => a.mastery - b.mastery)
                    .slice(0, 8)
                    .map((a) => ({
                      label: a.knowledge_point,
                      value: a.mastery,
                      meta: `${a.attempts} 次作答`,
                    })),
                },
              ]}
              target={0.85}
              targetLabel="目标 85%"
              onAxisClick={(kp) => nav(`/practice?kp=${encodeURIComponent(kp)}`)}
            />
            <div className="muted" style={{ fontSize: 12, textAlign: "center" }}>
              雷达越“瘪”越薄弱；虚线为你应达到的目标掌握度 85%
            </div>
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
        {/* 强项 / 最弱 速览（点击直达针对性练习） */}
        <div style={{ marginTop: 12 }}>
          <div className="muted" style={{ fontSize: 12 }}>强项</div>
          <div className="chip-row" style={{ marginTop: 4 }}>
            {[...dash.ability]
              .sort((a, b) => b.mastery - a.mastery)
              .slice(0, 3)
              .map((a) => (
                <button
                  key={a.knowledge_point}
                  className="chip"
                  onClick={() => nav(`/practice?kp=${encodeURIComponent(a.knowledge_point)}`)}
                >
                  {a.knowledge_point} {Math.round(a.mastery * 100)}%
                </button>
              ))}
          </div>
        </div>
        <div style={{ marginTop: 8 }}>
          <div className="muted" style={{ fontSize: 12 }}>最弱（优先补）</div>
          <div className="chip-row" style={{ marginTop: 4 }}>
            {[...dash.ability]
              .sort((a, b) => a.mastery - b.mastery)
              .slice(0, 3)
              .map((a) => (
                <button
                  key={a.knowledge_point}
                  className="chip chip--on"
                  onClick={() => nav(`/practice?kp=${encodeURIComponent(a.knowledge_point)}`)}
                >
                  {a.knowledge_point} {Math.round(a.mastery * 100)}%
                </button>
              ))}
          </div>
        </div>
        {/* 分科掌握度热力图（紧凑版，无图例/薄弱数） */}
        {heat && heat.subjects.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 2 }}>分科掌握度速览</div>
            <KpHeatmapView
              subjects={heat.subjects}
              onSelect={(kp) => nav("/practice?kp=" + encodeURIComponent(kp))}
              compact
            />
          </div>
        )}
      </div>

      <div className="card card--warning" style={{ marginTop: 12 }}>
        <strong>薄弱知识点（AI 诊断）</strong>
        <div style={{ marginTop: 4 }}>
          {rec && rec.knowledge_points.length ? rec.knowledge_points.join("、") : "暂无明显薄弱点，继续保持 👍"}
        </div>
        <button className="link-btn" style={{ marginTop: 6 }} onClick={() => nav("/wrong")}>
          去错题本针对性重练 →
        </button>
        {rec && rec.knowledge_points.length > 0 && (
          <button
            className="btn btn--primary btn--sm"
            style={{ marginTop: 8 }}
            onClick={() => nav(`/practice?kp=${encodeURIComponent(rec.knowledge_points[0])}`)}
            title="按最弱知识点专项刷题"
          >
            🎯 针对薄弱点练习 →
          </button>
        )}
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

      <div className="row row--between" style={{ marginTop: 16 }}>
        <h3 className="section-title" style={{ marginTop: 0 }}>为你推荐练习</h3>
        <button className="btn btn--ghost btn--sm" disabled={recRefreshing} onClick={refreshRec}>
          {recRefreshing ? "换题中…" : "🔄 换一批"}
        </button>
      </div>
      {rec && rec.questions.length === 0 && (
        <EmptyState tight icon="compass" title="暂无可推荐题目" desc="去「刷题」或「模考」积累数据后再回来。" />
      )}
      {rec &&
        rec.questions.map((q: any) => (
          <div key={q.id} className="q-item">
            <div className="q-item__meta">
              <span className="tag tag--brand">{q.subject}</span>
              <span>{q.knowledge_point}</span>
              {typeof q.difficulty === "number" && (
                <span className="text-3" style={{ fontSize: 12 }}>难度 {q.difficulty}</span>
              )}
            </div>
            <div className="q-item__stem">{q.stem}</div>
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => tutor(q.id)}>
                AI 私教讲解
              </button>
              <button className="btn btn--ghost btn--sm" onClick={() => nav(`/practice?q=${q.id}`)}>
                去练习
              </button>
            </div>
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
                <div className="tutor-box__body"><Markdown>{explain[q.id]}</Markdown></div>
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

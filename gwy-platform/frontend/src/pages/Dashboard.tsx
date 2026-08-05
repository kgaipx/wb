import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, StudentStats } from "../api/client";

function pct(v: number) {
  return Math.round(v * 100);
}

/** 复错率配色：越低越好。 */
function recurColor(rate: number) {
  if (rate <= 0.3) return "var(--success)";
  if (rate <= 0.6) return "var(--brand)";
  return "var(--danger)";
}

function MasteryRow({ name, mastery }: { name: string; mastery: number }) {
  const color = mastery >= 0.8 ? "var(--success)" : mastery >= 0.5 ? "var(--brand)" : "var(--warning)";
  return (
    <div className="kp-row">
      <div className="kp-row__name">{name}</div>
      <div className="kp-row__bar">
        <div className="progress">
          <div className="progress__bar" style={{ width: `${pct(mastery)}%`, background: color }} />
        </div>
      </div>
      <div className="kp-row__val">{pct(mastery)}%</div>
    </div>
  );
}

export default function Dashboard() {
  const nav = useNavigate();
  const [stats, setStats] = useState<StudentStats | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api
      .studentStats()
      .then(setStats)
      .catch((e) => setErr(e?.message || "加载失败"));
  }, []);

  if (err) {
    return (
      <section>
        <div className="page-title">学习数据中心</div>
        <div className="card card--warning" style={{ marginTop: 12 }}>{err}</div>
      </section>
    );
  }
  if (!stats) {
    return (
      <section>
        <div className="page-title">学习数据中心</div>
        <div className="splash">加载中…</div>
      </section>
    );
  }

  const maxAns = Math.max(1, ...stats.last_7_days.map((d) => d.answers));
  const recColor = recurColor(stats.recurrence_rate);

  return (
    <section>
      <div className="page-title">学习数据中心</div>
      <div className="muted" style={{ marginTop: -8, marginBottom: 12, fontSize: 13 }}>
        追踪你的提分信号 · 复错率越低，说明复盘越有效
      </div>

      {/* 核心指标 */}
      <div className="grid-2" style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <div className="metric">
          <div className="metric__num">{stats.total_answers}</div>
          <div className="metric__label">累计答题</div>
        </div>
        <div className="metric">
          <div className="metric__num" style={{ color: "var(--brand)" }}>{pct(stats.correct_rate)}%</div>
          <div className="metric__label">客观正确率</div>
        </div>
        <div className="metric">
          <div className="metric__num" style={{ color: "var(--accent)" }}>{stats.streak_days}</div>
          <div className="metric__label">连续打卡(天)</div>
        </div>
      </div>

      {/* 复错率环形（P0 信号） */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="row row--between">
          <strong>错题复错率</strong>
          <span className="tag tag--brand">核心 P0 信号</span>
        </div>
        <div className="recur">
          <div
            className="recur__ring"
            style={{
              background: `conic-gradient(${recColor} ${pct(stats.recurrence_rate) * 3.6}deg, var(--surface-2) 0deg)`,
            }}
          >
            <div className="recur__inner">
              <div className="recur__val" style={{ color: recColor }}>{pct(stats.recurrence_rate)}%</div>
              <div className="recur__sub">复错率</div>
            </div>
          </div>
          <div className="recur__desc">
            <div>曾经做错、之后再次作答仍错的题目占比。</div>
            <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
              共 <b className="text-danger">{stats.wrong_distinct}</b> 道不同错题；已复盘掌握{" "}
              <b className="text-success">{stats.reviewed_distinct}</b> 道；已掌握知识点{" "}
              <b className="text-brand">{stats.mastered_kp}</b> 个。
            </div>
            <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
              复错率下降 = 复习有效。建议优先攻克下方弱项知识点。
            </div>
          </div>
        </div>
      </div>

      {/* 近 7 日趋势 */}
      <div className="card" style={{ marginTop: 12 }}>
        <strong>近 7 日练习趋势</strong>
        <div className="trend">
          {stats.last_7_days.map((d) => {
            const md = d.date.slice(5);
            const h = Math.round((d.answers / maxAns) * 100);
            return (
              <div className="trend__col" key={d.date}>
                <div className="trend__bar" style={{ height: `${Math.max(h, d.answers ? 6 : 2)}%` }}>
                  {d.answers > 0 && <span className="trend__num">{d.answers}</span>}
                </div>
                <div className="trend__date">{md}</div>
              </div>
            );
          })}
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          每根柱为当日客观题作答量；保持每日一练，复错率才会稳步下降。
        </div>
      </div>

      {/* 弱项知识点 */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="row row--between">
          <strong>弱项知识点</strong>
          <span className="muted" style={{ fontSize: 12 }}>掌握度升序</span>
        </div>
        {stats.ability.length === 0 ? (
          <div className="muted" style={{ fontSize: 13, marginTop: 10 }}>
            暂无作答记录，去刷几道题，这里会显示你的能力图谱。
          </div>
        ) : (
          <div style={{ marginTop: 10 }}>
            {stats.ability.map((a) => (
              <MasteryRow key={a.knowledge_point} name={a.knowledge_point} mastery={a.mastery} />
            ))}
          </div>
        )}
      </div>

      {/* 行动入口 */}
      <div className="row" style={{ gap: 10, marginTop: 14 }}>
        <button className="btn btn--primary" style={{ flex: 1 }} onClick={() => nav("/wrong")}>
          攻克错题本
        </button>
        <button
          className="btn btn--ghost"
          style={{ flex: 1 }}
          onClick={() => nav("/practice")}
        >
          继续刷题
        </button>
      </div>
    </section>
  );
}

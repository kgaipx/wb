import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, KpHeatmap, StudentStats } from "../api/client";
import { LineChart } from "../components/LineChart";
import { RadarChart } from "../components/RadarChart";
import KpHeatmapView from "../components/KpHeatmap";
import { ReportExport } from "../components/ReportExport";
import EmptyState from "../components/EmptyState";
import Reveal from "../components/Reveal";

function pct(v: number) {
  return Math.round(v * 100);
}

/** 复错率配色：越低越好。 */
function recurColor(rate: number) {
  if (rate <= 0.3) return "var(--success)";
  if (rate <= 0.6) return "var(--brand)";
  return "var(--danger)";
}

function MasteryRow({ name, mastery, onPractice }: { name: string; mastery: number; onPractice?: () => void }) {
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
      {onPractice && (
        <button
          className="btn btn--ghost btn--sm"
          style={{ marginLeft: 8, padding: "2px 10px", whiteSpace: "nowrap" }}
          onClick={onPractice}
        >
          去练
        </button>
      )}
    </div>
  );
}

export default function Dashboard() {
  const nav = useNavigate();
  const [stats, setStats] = useState<StudentStats | null>(null);
  const [heat, setHeat] = useState<KpHeatmap | null>(null);
  const dashRef = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api
      .studentStats()
      .then(setStats)
      .catch((e) => setErr(e?.message || "加载失败"));
    api.kpHeatmap().then(setHeat).catch(() => setHeat(null));
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
        <div className="sk-stack">
          <div className="sk-card">
            <div className="sk-head">
              <div className="sk sk-circle" style={{ width: 38, height: 38 }} />
              <div className="sk sk-line" style={{ width: "40%" }} />
            </div>
            <div className="sk-row">
              <div className="sk sk-circle" style={{ width: 64, height: 64 }} />
              <div style={{ flex: 1 }}>
                <div className="sk sk-line" style={{ width: "60%" }} />
                <div className="sk sk-line" style={{ width: "80%" }} />
              </div>
            </div>
          </div>
          <div className="sk-card">
            <div className="sk sk-line" style={{ width: "35%" }} />
            <div className="sk sk-line" style={{ width: "100%", height: 120 }} />
          </div>
        </div>
      </section>
    );
  }

  const maxAns = Math.max(1, ...(stats.last_7_days || []).map((d) => d.answers));
  const recColor = recurColor(stats.recurrence_rate);

  return (
    <section>
      <div className="page-title">学习数据中心</div>
      <div className="muted" style={{ marginTop: -8, marginBottom: 12, fontSize: 13 }}>
        追踪你的提分信号 · 复错率越低，说明复盘越有效
      </div>

      {/* 核心指标 */}
      <Reveal delay={0}><div className="grid-2" style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
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
      </Reveal>

      {/* 复错率环形（P0 信号） */}
      <Reveal delay={60}><div className="card" style={{ marginTop: 12 }}>
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
      </Reveal>

      <div className="row row--between" style={{ marginBottom: 4 }}>
        <strong className="section-title" style={{ marginTop: 0 }}>学习数据分析</strong>
        <ReportExport targetRef={dashRef} fileName={`学习分析_${new Date().toISOString().slice(0, 10)}`} />
      </div>
      <Reveal delay={140}><div ref={dashRef}>
      {/* 近 7 日趋势 */}
      <div className="card" style={{ marginTop: 12 }}>
        <strong>近 7 日练习趋势</strong>
        <div className="trend">
          {(stats.last_7_days || []).map((d) => {
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

      {/* 近 7 日正确率趋势 */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="row row--between">
          <strong>近 7 日正确率</strong>
          <span className="tag tag--brand">质量信号</span>
        </div>
        <LineChart
          points={stats.last_7_days.map((d) => ({
            label: d.date.slice(5),
            value: d.answers > 0 ? Math.round((d.correct / d.answers) * 100) : 0,
          }))}
          max={100}
          min={0}
          unit="%"
          color="var(--success)"
        />
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          折线为每日客观题正确率；正确率稳步上升 + 复错率下降 = 复习有效。
        </div>
      </div>

      {/* 知识点掌握度热力图（按科目分面，最弱科目/知识点排最前） */}
      {heat && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="row row--between">
            <strong>知识点掌握度热力图</strong>
            <span className="tag tag--brand">分科视图</span>
          </div>
          {heat.subjects.length === 0 ? (
            <EmptyState tight icon="chart" title="还没有练过的知识点" desc="去「刷题」后这里会生成分科热力图。" />
          ) : (
            <KpHeatmapView
              subjects={heat.subjects}
              onSelect={(kp) => nav("/practice?kp=" + encodeURIComponent(kp))}
            />
          )}
          <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            颜色越红越薄弱、越绿越扎实；点色块直达该知识点专项练习。
          </div>
        </div>
      )}

      {/* 弱项知识点 */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="row row--between">
          <strong>弱项知识点</strong>
          <span className="muted" style={{ fontSize: 12 }}>掌握度升序</span>
        </div>
        {stats.ability.length === 0 ? (
          <EmptyState tight icon="chart" title="暂无作答记录" desc="去刷几道题，这里会显示你的能力图谱。" />
        ) : (
          <div style={{ marginTop: 10 }}>
            <div className="radar-wrap">
              <RadarChart
                series={[
                  {
                    name: "当前掌握度",
                    color: "var(--brand)",
                    data: [...stats.ability]
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
                雷达越“瘪”说明该模块越薄弱，优先补最凹处
              </div>
            </div>
            {stats.ability.map((a) => (
              <MasteryRow
                key={a.knowledge_point}
                name={a.knowledge_point}
                mastery={a.mastery}
                onPractice={() => nav("/practice?kp=" + a.knowledge_point)}
              />
            ))}
            <button
              className="btn btn--primary"
              style={{ marginTop: 12, width: "100%" }}
              onClick={() => nav("/practice?kp=" + stats.ability.map((a) => a.knowledge_point).join(","))}
            >
              一键混合薄弱点练习包（{stats.ability.length}）→
            </button>
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              按掌握度自适应加权出题：优先练最弱、且尚未练熟的知识点
            </div>
          </div>
        )}
      </div>

      </div>
      </Reveal>

      {/* 行动入口 */}
      <Reveal delay={200}><div className="row" style={{ gap: 10, marginTop: 14 }}>
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
      </Reveal>
    </section>
  );
}

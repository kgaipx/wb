import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, PlanDay, PlanOut, PlanProgress, PlanTask } from "../api/client";
import { triggerDownload, stamp } from "../utils/exportUtils";

const KIND_LABEL: Record<string, string> = {
  practice: "刷题",
  review_wrong: "错题",
  favorite: "收藏",
  explain: "讲解",
  mock: "模考",
  read: "阅读",
};

/** 完成度环形进度 */
function Ring({ rate }: { rate: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const off = c * (1 - rate);
  return (
    <svg width="84" height="84" viewBox="0 0 84 84" className="plan-ring">
      <circle cx="42" cy="42" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="8" />
      <circle
        cx="42"
        cy="42"
        r={r}
        fill="none"
        stroke="var(--brand)"
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={off}
        transform="rotate(-90 42 42)"
        style={{ transition: "stroke-dashoffset .5s ease" }}
      />
      <text x="42" y="40" textAnchor="middle" fontSize="18" fontWeight="800" fill="var(--brand)">
        {Math.round(rate * 100)}
      </text>
      <text x="42" y="56" textAnchor="middle" fontSize="10" fill="var(--text-3)">
        完成度
      </text>
    </svg>
  );
}

export default function Plan() {
  const nav = useNavigate();
  const [plan, setPlan] = useState<PlanOut | null>(null);
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");

  const regenerate = useCallback(
    async (d: number) => {
      setBusy(true);
      setErr("");
      try {
        const p = await api.planGenerate(d);
        setPlan(p);
      } catch (e: any) {
        setErr(e.message);
      } finally {
        setBusy(false);
      }
    },
    []
  );

  // 初始化：有已保存计划则直接取用，否则生成
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBusy(true);
      setErr("");
      try {
        const existing = await api.planGet();
        if (cancelled) return;
        if (existing && existing.days === days) {
          setPlan(existing);
          return;
        }
        const p = await api.planGenerate(days);
        if (!cancelled) setPlan(p);
      } catch (e: any) {
        if (!cancelled) setErr(e.message);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [days]);

  function onTask(t: PlanTask) {
    if (t.kind === "mock") {
      nav("/exam");
      return;
    }
    if (t.ref_id) nav(`/practice?q=${t.ref_id}`);
  }

  async function onToggle(t: PlanTask) {
    // 乐观更新
    setPlan((prev) => applyTaskDone(prev, t.id, !t.done));
    try {
      const res = await api.planToggle(t.id);
      setPlan((prev) => applyProgress(prev, res.progress, t.id, res.task.done));
    } catch (e: any) {
      setErr(e.message);
      // 回滚
      setPlan((prev) => applyTaskDone(prev, t.id, t.done));
    }
  }

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
  }

  function planToMarkdown(): string {
    if (!plan) return "";
    const p = plan.progress;
    const lines: string[] = [
      `# AI 学习计划（${plan.days} 天）`,
      "",
      `> 总体完成率 **${Math.round(p.rate * 100)}%** · 连续打卡 ${p.streak_days} 天 · 累计 ${
        p.done_tasks
      }/${p.total_tasks} 项`,
      "",
    ];
    if (plan.summary) {
      lines.push(plan.summary, "");
    }
    plan.items.forEach((d) => {
      lines.push(`## 第 ${d.day} 天 · ${d.focus}`);
      if (d.summary) lines.push(d.summary);
      lines.push("");
      d.tasks.forEach((t) => {
        const mark = t.done ? "x" : " ";
        lines.push(`- [${mark}] ${KIND_LABEL[t.kind] || t.kind}：${t.title}`);
      });
      lines.push("");
    });
    return lines.join("\n");
  }

  function exportPlan() {
    if (!plan) {
      flash("计划尚未生成");
      return;
    }
    triggerDownload(`AI学习计划_${stamp()}.md`, planToMarkdown());
    flash("已导出学习计划（Markdown）");
  }

  return (
    <section>
      <h2 className="page-title">AI 学习计划</h2>
      {toast && <div className="ok-text ok-text--float">{toast}</div>}
      <div className="card card--soft">
        <div className="row row--between">
          <strong>你的私教大脑已就位</strong>
          <span className="badge badge--soft">诊断→计划→执行→复盘</span>
        </div>
        <div className="muted" style={{ marginTop: 4 }}>
          基于你的学情掌握度、错题本与收藏夹自动编排。完成打卡后，进度与连续打卡天数会实时更新。
        </div>
      </div>

      {plan && (
        <>
          {/* 进度总览 */}
          <div className="card plan-progress">
            <Ring rate={plan.progress.rate} />
            <div className="plan-progress__stats">
              <div className="stat">
                <b>🔥 {plan.progress.streak_days}</b>
                <span>连续打卡(天)</span>
              </div>
              <div className="stat">
                <b>
                  {plan.progress.today_done}/{plan.progress.today_total}
                </b>
                <span>今日待办</span>
              </div>
              <div className="stat">
                <b>
                  {plan.progress.done_tasks}/{plan.progress.total_tasks}
                </b>
                <span>累计完成</span>
              </div>
            </div>
            <div className="plan-progress__actions">
              <button className="btn btn--sm btn--ghost" disabled={busy} onClick={exportPlan}>
                导出计划
              </button>
            </div>
          </div>
          <div className="progress" style={{ marginTop: 8 }}>
            <div
              className="progress__bar"
              style={{ width: `${Math.round(plan.progress.rate * 100)}%` }}
            />
          </div>
        </>
      )}

      <div className="plan-controls">
        {[7, 14, 30].map((d) => (
          <button
            key={d}
            className={"btn btn--sm " + (d === days ? "btn--primary" : "btn--ghost")}
            disabled={busy}
            onClick={() => setDays(d)}
          >
            {d} 天
          </button>
        ))}
        <button
          className="btn btn--sm btn--ghost"
          disabled={busy}
          onClick={() => regenerate(days)}
          style={{ marginLeft: "auto" }}
        >
          {busy ? "生成中…" : "重新生成"}
        </button>
      </div>

      {err && <div className="err-text">{err}</div>}
      {!err && !plan && <div className="muted">加载中…（需先登录）</div>}

      {plan && (
        <>
          {plan.offline && (
            <div className="card card--warning" style={{ marginTop: 10 }}>
              <strong>离线模式</strong>
              <div className="muted" style={{ marginTop: 2 }}>
                AI 服务暂不可用，已用规则引擎生成计划；联网后将有更个性化的编排。
              </div>
            </div>
          )}
          {plan.summary && (
            <div className="card" style={{ marginTop: 10 }}>
              <div className="tutor-box__body">{plan.summary}</div>
            </div>
          )}

          {plan.items.map((day: PlanDay) => {
            const isToday = plan.today_index === day.day;
            return (
              <div
                key={day.day}
                className={"plan-day" + (isToday ? " plan-day--today" : "")}
              >
                <div className="plan-day__head">
                  <span className="plan-day__badge">第 {day.day} 天</span>
                  {isToday && <span className="plan-day__today">今日</span>}
                  <span className="plan-day__focus">{day.focus}</span>
                </div>
                <div className="plan-day__summary muted">{day.summary}</div>
                <div className="plan-day__tasks">
                  {day.tasks.map((t) => {
                    const clickable = t.kind === "mock" || !!t.ref_id;
                    return (
                      <div
                        key={t.id}
                        className={
                          "plan-task" +
                          (clickable ? " plan-task--link" : "") +
                          (t.done ? " plan-task--done" : "")
                        }
                      >
                        <button
                          className={"plan-check" + (t.done ? " plan-check--on" : "")}
                          onClick={() => onToggle(t)}
                          aria-label={t.done ? "取消打卡" : "打卡完成"}
                          title={t.done ? "取消打卡" : "打卡完成"}
                        >
                          {t.done ? "✓" : ""}
                        </button>
                        <span className={"plan-task__kind kind--" + t.kind}>
                          {KIND_LABEL[t.kind] || t.kind}
                        </span>
                        <span
                          className={"plan-task__title" + (clickable ? " plan-task__title--link" : "")}
                          onClick={clickable ? () => onTask(t) : undefined}
                        >
                          {t.title}
                        </span>
                        {clickable && <span className="plan-task__arrow">›</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}

function applyTaskDone(plan: PlanOut | null, id: number, done: boolean): PlanOut | null {
  if (!plan) return plan;
  return {
    ...plan,
    items: plan.items.map((d) => ({
      ...d,
      tasks: d.tasks.map((t) => (t.id === id ? { ...t, done } : t)),
    })),
  };
}

function applyProgress(
  plan: PlanOut | null,
  progress: PlanProgress,
  id: number,
  done: boolean
): PlanOut | null {
  if (!plan) return plan;
  return {
    ...plan,
    items: plan.items.map((d) => ({
      ...d,
      tasks: d.tasks.map((t) => (t.id === id ? { ...t, done } : t)),
    })),
    progress,
  };
}

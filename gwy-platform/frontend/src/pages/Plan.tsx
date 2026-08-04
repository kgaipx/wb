import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, PlanDay, PlanOut } from "../api/client";

const KIND_LABEL: Record<string, string> = {
  practice: "刷题",
  review_wrong: "错题",
  favorite: "收藏",
  explain: "讲解",
  mock: "模考",
  read: "阅读",
};

export default function Plan() {
  const nav = useNavigate();
  const [plan, setPlan] = useState<PlanOut | null>(null);
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(
    async (d: number) => {
      setBusy(true);
      setErr("");
      try {
        const p = await api.plan(d);
        setPlan(p);
      } catch (e: any) {
        setErr(e.message);
      } finally {
        setBusy(false);
      }
    },
    []
  );

  useEffect(() => {
    load(days);
  }, [load, days]);

  function onTask(t: PlanDay["tasks"][number]) {
    if (t.kind === "mock") {
      nav("/exam");
      return;
    }
    if (t.ref_id) {
      nav(`/practice?q=${t.ref_id}`);
    }
  }

  return (
    <section>
      <h2 className="page-title">AI 学习计划</h2>
      <div className="card card--soft">
        <div className="row row--between">
          <strong>你的私教大脑已就位</strong>
          <span className="badge badge--soft">诊断→计划→执行→复盘</span>
        </div>
        <div className="muted" style={{ marginTop: 4 }}>
          基于你的学情掌握度、错题本与收藏夹自动编排。切换天数可重新生成。
        </div>
      </div>

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
        <button className="btn btn--sm btn--ghost" disabled={busy} onClick={() => load(days)} style={{ marginLeft: "auto" }}>
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

          {plan.items.map((day) => (
            <div key={day.day} className="plan-day">
              <div className="plan-day__head">
                <span className="plan-day__badge">第 {day.day} 天</span>
                <span className="plan-day__focus">{day.focus}</span>
              </div>
              <div className="plan-day__summary muted">{day.summary}</div>
              <div className="plan-day__tasks">
                {day.tasks.map((t, i) => {
                  const clickable = t.kind === "mock" || !!t.ref_id;
                  return (
                    <button
                      key={i}
                      className={"plan-task" + (clickable ? " plan-task--link" : "")}
                      disabled={!clickable}
                      onClick={() => onTask(t)}
                    >
                      <span className={"plan-task__kind kind--" + t.kind}>{KIND_LABEL[t.kind] || t.kind}</span>
                      <span className="plan-task__title">{t.title}</span>
                      {clickable && <span className="plan-task__arrow">›</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}
    </section>
  );
}

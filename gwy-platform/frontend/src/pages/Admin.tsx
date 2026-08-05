import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, AdminOverview, AdminUserRow } from "../api/client";
import { useAuth } from "../auth";

function pct(v: number) {
  return Math.round(v * 100);
}
function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function planLabel(p: string) {
  return { free: "免费版", pro: "会员月", pro_year: "会员年" }[p] || p;
}

export default function Admin() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState<AdminOverview | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.adminOverview().then(setData).catch((e) => setErr(e?.message || "加载失败"));
  }, []);

  if (user && user.role !== "admin") {
    return (
      <section>
        <div className="page-title">运营后台</div>
        <div className="card card--warning" style={{ marginTop: 12 }}>
          该页面仅限管理员访问。当前账号角色：<b>{user.role}</b>
        </div>
      </section>
    );
  }

  if (err) {
    return (
      <section>
        <div className="page-title">运营后台</div>
        <div className="card card--warning" style={{ marginTop: 12 }}>{err}</div>
      </section>
    );
  }
  if (!data) {
    return (
      <section>
        <div className="page-title">运营后台</div>
        <div className="splash">加载中…</div>
      </section>
    );
  }

  const maxSubj = Math.max(1, ...data.question_subjects.map((s) => s.count));
  const maxPlan = Math.max(1, ...data.users_by_plan.map((p) => p.count));

  return (
    <section>
      <div className="page-title">运营后台</div>
      <div className="muted" style={{ marginTop: -8, marginBottom: 12, fontSize: 13 }}>
        平台健康度 · 增长 / 营收 / 内容可信 / 学习活跃
      </div>

      {/* 用户与营收 */}
      <div className="grid-2" style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <div className="metric">
          <div className="metric__num">{data.users_total}</div>
          <div className="metric__label">累计用户 ({data.users_new_7d} 近7日)</div>
        </div>
        <div className="metric">
          <div className="metric__num" style={{ color: "var(--brand)" }}>{data.pro_users}</div>
          <div className="metric__label">付费会员</div>
        </div>
        <div className="metric">
          <div className="metric__num" style={{ color: "var(--accent)" }}>¥{data.revenue_yuan.toLocaleString()}</div>
          <div className="metric__label">累计营收 ({data.paid_orders} 单)</div>
        </div>
      </div>

      {/* 学习活跃 */}
      <div className="card" style={{ marginTop: 12 }}>
        <strong>学习活跃</strong>
        <div className="grid-2" style={{ gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
          <div className="metric">
            <div className="metric__num">{data.answers_total}</div>
            <div className="metric__label">累计作答</div>
          </div>
          <div className="metric">
            <div className="metric__num" style={{ color: "var(--success)" }}>{pct(data.avg_correct_rate)}%</div>
            <div className="metric__label">全站正确率</div>
          </div>
          <div className="metric">
            <div className="metric__num">{data.mock_exams}</div>
            <div className="metric__label">在线模考次数</div>
          </div>
          <div className="metric">
            <div className="metric__num">{data.essays_graded}</div>
            <div className="metric__label">申论批改次数</div>
          </div>
        </div>
      </div>

      {/* 内容可信 / 题库核实 */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="row row--between">
          <strong>内容可信 · 题库核实</strong>
          <span className="tag tag--brand">信任保障</span>
        </div>
        <div className="grid-2" style={{ gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
          <div className="metric">
            <div className="metric__num">{data.questions_total}</div>
            <div className="metric__label">题库总量</div>
          </div>
          <div className="metric">
            <div className="metric__num text-success">{data.questions_verified}</div>
            <div className="metric__label">已双签核实</div>
          </div>
          <div className="metric">
            <div className="metric__num text-danger">{data.questions_pending}</div>
            <div className="metric__label">待核实</div>
          </div>
          <div className="metric">
            <div className="metric__num text-warning">{data.pending_reviews}</div>
            <div className="metric__label">内容审核待办</div>
          </div>
        </div>
        {data.question_subjects.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>题库科目分布</div>
            {data.question_subjects.map((s) => (
              <div className="kp-row" key={s.subject}>
                <div className="kp-row__name">{s.subject}</div>
                <div className="kp-row__bar">
                  <div className="progress">
                    <div className="progress__bar" style={{ width: `${Math.round((s.count / maxSubj) * 100)}%`, background: "var(--brand)" }} />
                  </div>
                </div>
                <div className="kp-row__val">{s.count}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 会员分布 */}
      <div className="card" style={{ marginTop: 12 }}>
        <strong>会员等级分布</strong>
        <div style={{ marginTop: 10 }}>
          {data.users_by_plan.map((p) => (
            <div className="kp-row" key={p.plan}>
              <div className="kp-row__name">{planLabel(p.plan)}</div>
              <div className="kp-row__bar">
                <div className="progress">
                  <div className="progress__bar" style={{ width: `${Math.round((p.count / maxPlan) * 100)}%`, background: "var(--accent)" }} />
                </div>
              </div>
              <div className="kp-row__val">{p.count}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 最近注册用户 */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="row row--between">
          <strong>最近注册用户</strong>
          <span className="muted" style={{ fontSize: 12 }}>近 10 位</span>
        </div>
        <div style={{ marginTop: 8 }}>
          {data.recent_users.map((u: AdminUserRow) => (
            <div className="usr-row" key={u.email}>
              <div className="usr-row__main">
                <div className="usr-row__name">{u.nickname || u.email}</div>
                <div className="usr-row__sub">{u.email} · {u.target_exam}</div>
              </div>
              <div className="usr-row__right">
                <span className={"role-chip role-chip--" + (u.role === "admin" ? "admin" : u.role === "reviewer" ? "rev" : "user")}>{u.role}</span>
                <span className="usr-row__date">{fmtDate(u.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 入口 */}
      <div className="row" style={{ gap: 10, marginTop: 14 }}>
        <button className="btn btn--ghost" style={{ flex: 1 }} onClick={() => nav("/review")}>
          进入双签审核台
        </button>
      </div>
    </section>
  );
}

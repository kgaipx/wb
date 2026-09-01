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

const C_BRAND = "var(--brand)";
const C_ACCENT = "var(--warning)";
const C_SUCCESS = "var(--success)";
const C_DANGER = "var(--danger)";
const C_INFO = "var(--info)";
const C_GRAY = "var(--text-3)";

// 零依赖 SVG 折线图（近 7 日趋势），preserveAspectRatio 默认保持圆形不畸变
function LineChart({
  data,
  color,
  height = 92,
  fmt,
  unit = "",
}: {
  data: { date: string; value: number }[];
  color: string;
  height?: number;
  fmt?: (v: number) => string;
  unit?: string;
}) {
  const W = 320;
  const H = height;
  const pad = 8;
  const max = Math.max(1, ...data.map((d) => d.value));
  const n = data.length;
  const step = n > 1 ? (W - pad * 2) / (n - 1) : 0;
  const pts = data.map((d, i) => {
    const x = pad + i * step;
    const y = H - pad - (d.value / max) * (H - pad * 2);
    return [x, y] as const;
  });
  const line = pts.map((p) => p.join(",")).join(" ");
  const area = `${pad},${H - pad} ${line} ${W - pad},${H - pad}`;
  const last = data[data.length - 1];
  return (
    <div className="adm-chart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="趋势图" style={{ color }}>
        <polygon points={area} fill="currentColor" opacity={0.1} />
        <polyline
          points={line}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {pts.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r={2.4} fill="currentColor" />
        ))}
      </svg>
      <div className="adm-chart__foot">
        <span>{data[0]?.date?.slice(5)}</span>
        <span className="adm-chart__last">
          {fmt ? fmt(last?.value ?? 0) : last?.value}
          {unit}
        </span>
        <span>{last?.date?.slice(5)}</span>
      </div>
    </div>
  );
}

// 零依赖 SVG 环形图（份额分布）
function Donut({
  segments,
  size = 132,
  centerMain,
  centerSub,
  style,
}: {
  segments: { label: string; value: number; color: string }[];
  size?: number;
  centerMain?: string;
  centerSub?: string;
  style?: React.CSSProperties;
}) {
  const cx = 60;
  const cy = 60;
  const r = 46;
  const C = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  let offset = 0;
  return (
    <div className="adm-donut" style={style}>
      <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label="分布环图">
        <circle cx={cx} cy={cy} r={r} fill="none" style={{ stroke: "var(--surface-2)" }} strokeWidth={14} />
        {segments.map((s, i) => {
          const len = (s.value / total) * C;
          const el = (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              style={{ stroke: s.color }}
              strokeWidth={14}
              strokeDasharray={`${len} ${C - len}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          );
          offset += len;
          return el;
        })}
        {centerMain !== undefined && (
          <text x={cx} y={cy - 2} textAnchor="middle" className="adm-donut__total">
            {centerMain}
          </text>
        )}
        {centerSub !== undefined && (
          <text x={cx} y={cy + 15} textAnchor="middle" className="adm-donut__sub">
            {centerSub}
          </text>
        )}
      </svg>
      <div className="adm-donut__legend">
        {segments.map((s, i) => (
          <div key={i} className="adm-legend__item">
            <span className="adm-legend__dot" style={{ background: s.color }} />
            <span>{s.label}</span>
            <b>{s.value}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Admin() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState<AdminOverview | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [refunds, setRefunds] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.adminOverview().then(setData).catch((e) => setErr(e?.message || "加载失败"));
    api.adminOrders().then(setOrders).catch(() => {});
    api.adminRefunds().then(setRefunds).catch(() => {});
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

  const maxSubj = Math.max(1, ...data.question_subjects.map((s) => s.count));

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

      {/* 近 7 日趋势 */}
      <div className="card" style={{ marginTop: 12 }}>
        <strong>近 7 日趋势</strong>
        <div className="adm-trend-grid">
          <div className="adm-trend">
            <div className="adm-trend__title">新增用户</div>
            <LineChart data={data.daily_new_users} color={C_BRAND} />
          </div>
          <div className="adm-trend">
            <div className="adm-trend__title">每日作答量</div>
            <LineChart data={data.daily_answers} color={C_INFO} />
          </div>
          <div className="adm-trend">
            <div className="adm-trend__title">每日营收</div>
            <LineChart
              data={data.daily_revenue}
              color={C_ACCENT}
              fmt={(v) => "¥" + v.toFixed(0)}
            />
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
        <Donut
          style={{ marginTop: 12 }}
          segments={[
            { label: "已核实", value: data.questions_verified, color: C_SUCCESS },
            { label: "待核实", value: data.questions_pending, color: C_DANGER },
          ]}
          centerMain={pct(data.questions_total ? data.questions_verified / data.questions_total : 0) + "%"}
          centerSub="核实率"
        />
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
        <Donut
          segments={data.users_by_plan.map((p) => ({
            label: planLabel(p.plan),
            value: p.count,
            color: p.plan === "pro_year" ? C_ACCENT : p.plan === "pro" ? C_BRAND : C_GRAY,
          }))}
          centerMain={String(data.pro_users)}
          centerSub="付费会员"
        />
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

      {/* 财务对账：订单与退费明细 */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="row row--between">
          <strong>财务对账 · 订单</strong>
          <span className="muted" style={{ fontSize: 12 }}>最近 {orders.length} 笔</span>
        </div>
        <div style={{ marginTop: 8 }}>
          {orders.length === 0 && <div className="muted" style={{ fontSize: 13 }}>暂无订单</div>}
          {orders.map((o: any) => (
            <div className="usr-row" key={o.id}>
              <div className="usr-row__main">
                <div className="usr-row__name">{planLabel(o.plan)} · #{o.id}</div>
                <div className="usr-row__sub">{fmtDate(o.created_at)}{o.paid_at ? ` · 支付 ${fmtDate(o.paid_at)}` : ""}</div>
              </div>
              <div className="usr-row__right">
                <span className="tag">¥{(o.amount / 100).toFixed(0)}</span>
                <span className={"status-pill " + (o.status === "paid" ? "status--approved" : o.status === "refunded" ? "status--rejected" : "")}>
                  {o.status === "paid" ? "已支付" : o.status === "pending" ? "待支付" : o.status === "refunding" ? "退费中" : o.status === "refunded" ? "已退费" : o.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="row row--between">
          <strong>财务对账 · 退费</strong>
          <span className="muted" style={{ fontSize: 12 }}>最近 {refunds.length} 笔</span>
        </div>
        <div style={{ marginTop: 8 }}>
          {refunds.length === 0 && <div className="muted" style={{ fontSize: 13 }}>暂无退费</div>}
          {refunds.map((r: any) => (
            <div className="usr-row" key={r.id}>
              <div className="usr-row__main">
                <div className="usr-row__name">退费 #{r.id} · 订单 #{r.order_id}</div>
                <div className="usr-row__sub">{fmtDate(r.requested_at)}{r.decided_at ? ` · 处理 ${fmtDate(r.decided_at)}` : ""}</div>
              </div>
              <div className="usr-row__right">
                <span className="tag tag--bad">-¥{(r.amount / 100).toFixed(0)}</span>
                <span className={"status-pill " + (r.status === "refunded" ? "status--approved" : r.status === "pending" ? "status--rejected" : "")}>
                  {r.status === "refunded" ? "已退费" : r.status === "pending" ? "退费中" : r.status === "rejected" ? "已驳回" : r.status}
                </span>
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

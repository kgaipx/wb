import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, AiQuota } from "../api/client";

interface Plan {
  id: string;
  name: string;
  price: number; // 分
  period: string;
  tagline: string;
  benefits: string[];
  highlight: boolean;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function Membership() {
  const nav = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [refundPolicy, setRefundPolicy] = useState("");
  const [me, setMe] = useState<{ plan: string; plan_expires_at: string | null; orders: any[]; refunds: any[] } | null>(null);
  const [quota, setQuota] = useState<AiQuota | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function refresh() {
    try {
      const [p, m, q] = await Promise.all([api.billingPlans(), api.myBilling(), api.quota()]);
      setPlans(p.plans);
      setRefundPolicy(p.refund_policy);
      setMe(m);
      setQuota(q);
    } catch (e: any) {
      setErr(e.message || "加载会员信息失败");
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const current = plans.find((p) => p.id === me?.plan);
  const paidOrder = me?.orders?.find((o) => o.status === "paid");
  const isFree = me?.plan === "free";
  const expired = me?.plan_expires_at ? new Date(me.plan_expires_at).getTime() < Date.now() : false;

  async function buy(planId: string) {
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      const o = await api.createOrder(planId);
      if (o.pay_url) {
        // 沙箱/演示：模拟支付成功（真实支付应跳转收银台 URL 完成支付）
        await api.paySandbox(o.id);
        setMsg(`已开通 ${planId}（订单 #${o.id}，¥${(o.amount / 100).toFixed(0)}）`);
      } else {
        setMsg(`订单 #${o.id} 已创建，请前往支付完成开通`);
      }
      await refresh();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function refund() {
    if (!paidOrder) {
      setMsg("当前没有可退费的订单");
      return;
    }
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      const r = await api.requestRefund(paidOrder.id, "不适合当前备考计划");
      setMsg(`退费申请 #${r.id}：¥${(r.amount / 100).toFixed(0)}，状态 ${r.status}（3 个工作日内到账）`);
      await refresh();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className="chat__head" style={{ margin: "0 calc(-1 * var(--sp-4)) 12px" }}>
        <button className="iconbtn" onClick={() => nav(-1)} aria-label="返回">
          ‹
        </button>
        <div className="chat__headinfo">
          <div className="chat__title">会员中心</div>
          <div className="chat__status">透明定价 · 无忧退费</div>
        </div>
      </div>

      {/* 当前会员状态 */}
      <div className="card card--tutor">
        <div className="card--tutor__txt">
          <div className="muted" style={{ fontSize: 13 }}>当前会员</div>
          <div style={{ fontSize: 18, fontWeight: 800 }} className="text-brand">
            {current ? current.name : "免费版"}
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            {isFree
              ? "升级解锁 AI 私教全流程陪伴"
              : expired
              ? `已于 ${fmtDate(me?.plan_expires_at || null)} 到期，可续费`
              : `有效期至 ${fmtDate(me?.plan_expires_at || null)}`}
          </div>
        </div>
        {!isFree && !expired && (
          <button className="btn btn--ghost btn--sm" disabled={busy || !paidOrder} onClick={refund}>
            无忧退费
          </button>
        )}
      </div>

      {/* 免费版每日额度 */}
      {isFree && quota && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="row row--between" style={{ fontSize: 13 }}>
            <span className="muted">今日 AI 讲解额度</span>
            <span className="emp">{quota.used} / {quota.limit}</span>
          </div>
          <div className="progress" style={{ marginTop: 6 }}>
            <div
              className="progress__bar"
              style={{ width: `${Math.min(100, (quota.used / quota.limit) * 100)}%`, background: quota.remaining > 0 ? "var(--brand)" : "var(--danger)" }}
            />
          </div>
          <div className="text-3" style={{ fontSize: 12, marginTop: 6 }}>
            {quota.remaining > 0 ? `剩余 ${quota.remaining} 次` : "今日已用完，升级会员解锁无限次"}
          </div>
        </div>
      )}

      {/* 套餐对比 */}
      <h3 className="section-title" style={{ marginTop: 16 }}>选择会员</h3>
      <div className="plans-grid">
        {plans.map((p) => {
          const isCurrent = me?.plan === p.id;
          return (
            <div
              key={p.id}
              className={"plan-card" + (isCurrent ? " plan-card--on" : "") + (p.highlight && !isCurrent ? " plan-card--hot" : "")}
            >
              {isCurrent && <div className="plan-card__badge">当前</div>}
              <div className="plan-card__name">{p.name}</div>
              <div className="plan-card__price">
                {p.price === 0 ? "¥0" : `¥${(p.price / 100).toFixed(0)}`}
                <span className="plan-card__period">/{p.period}</span>
              </div>
              <div className="plan-card__tagline">{p.tagline}</div>
              <ul className="plan-card__benefits">
                {p.benefits.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
              {p.id === "free" ? (
                <button className="btn btn--ghost btn--block btn--sm" disabled>
                  {isCurrent ? "使用中" : "默认"}
                </button>
              ) : (
                <button
                  className="btn btn--primary btn--block btn--sm"
                  disabled={busy || isCurrent}
                  onClick={() => buy(p.id)}
                >
                  {isCurrent ? (expired ? "续费" : "当前套餐") : me?.plan !== "free" ? "切换套餐" : "开通"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* 退费规则 */}
      <div className="card card--warning" style={{ marginTop: 14 }}>
        <strong>无忧退费承诺</strong>
        <div className="muted" style={{ fontSize: 13, marginTop: 6, lineHeight: 1.6 }}>
          {refundPolicy}
        </div>
      </div>

      {/* 账单记录 */}
      <h3 className="section-title" style={{ marginTop: 16 }}>账单记录</h3>
      <div className="card">
        {!me?.orders?.length && !me?.refunds?.length && <div className="muted">暂无订单记录</div>}
        {me?.orders?.map((o) => (
          <div key={o.id} className="bill-row">
            <div>
              <div className="emp">{o.plan}</div>
              <div className="muted" style={{ fontSize: 12 }}>
                #{o.id} · {new Date(o.created_at).toLocaleString("zh-CN", { hour12: false })}
              </div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <span className="tag">¥{(o.amount / 100).toFixed(0)}</span>
              <span className={"status-pill " + (o.status === "paid" ? "status--approved" : o.status === "refunding" ? "status--rejected" : "")}>
                {o.status === "paid" ? "已支付" : o.status === "pending" ? "待支付" : o.status === "refunding" ? "退费中" : o.status}
              </span>
            </div>
          </div>
        ))}
        {me?.refunds?.map((r) => (
          <div key={r.id} className="bill-row">
            <div>
              <div className="emp">退费 #{r.id}</div>
              <div className="muted" style={{ fontSize: 12 }}>
                订单 #{r.order_id} · {new Date(r.requested_at).toLocaleString("zh-CN", { hour12: false })}
              </div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <span className="tag tag--bad">-¥{(r.amount / 100).toFixed(0)}</span>
              <span className="status-pill status--approved">
                {r.status === "refunded" ? "已退费" : r.status === "pending" ? "退费中" : r.status === "rejected" ? "已驳回" : r.status}
              </span>
            </div>
          </div>
        ))}
      </div>

      {msg && <div className="ok-text" style={{ marginTop: 10 }}>{msg}</div>}
      {err && <div className="err-text" style={{ marginTop: 10 }}>{err}</div>}
    </section>
  );
}

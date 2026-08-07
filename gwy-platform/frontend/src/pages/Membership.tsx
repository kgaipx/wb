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
  const [sandbox, setSandbox] = useState(false); // 真实收银台未接入时为 true

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

  const freePlan = plans.find((p) => p.id === "free");
  const paidPlan = plans.find((p) => p.highlight) || plans.find((p) => p.id !== "free");

  async function buy(planId: string) {
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      const o = await api.createOrder(planId);
      // 真实收银台为绝对 http(s) 链接时跳转支付；沙箱返回的相对/空 pay_url 走模拟支付
      if (o.pay_url && /^https?:\/\//i.test(o.pay_url)) {
        window.location.href = o.pay_url;
        return;
      }
      // 沙箱/演示：模拟支付成功，即时开通（真实收银台待接入商户号后自动切换）
      setSandbox(true);
      await api.paySandbox(o.id);
      setMsg(`已开通 ${planId}（订单 #${o.id}，¥${(o.amount / 100).toFixed(0)}）`);
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

      {/* 价值引导 hero */}
      <div className="card mem-hero">
        <div className="mem-hero__title">升级会员，把 AI 私教装进口袋</div>
        <div className="mem-hero__subs">从「盲目刷题」到「精准提分」，AI 全程陪你走完备考每一步</div>
        <div className="mem-hero__props">
          <div className="mem-prop">
            <span className="mem-prop__ic">🎯</span>
            <b>精准提分</b>
            <span>学情诊断 + 个性化计划</span>
          </div>
          <div className="mem-prop">
            <span className="mem-prop__ic">✍️</span>
            <b>申论精批</b>
            <span>五维评分逐段批注</span>
          </div>
          <div className="mem-prop">
            <span className="mem-prop__ic">♾️</span>
            <b>无限畅学</b>
            <span>AI 讲解不再限次</span>
          </div>
        </div>
      </div>

      {/* 免费 vs 会员 能力对比 */}
      {paidPlan && (
        <div className="card mem-compare">
          <div className="mem-compare__col">
            <div className="mem-compare__h mem-compare__h--free">免费版</div>
            <ul>
              {(freePlan?.benefits || ["每日 AI 讲解额度", "基础申论批改", "学习计划", "题库刷题"]).map((b) => (
                <li key={b}>
                  <span className="mem-cmp-ic">✓</span>
                  {b}
                </li>
              ))}
            </ul>
          </div>
          <div className="mem-compare__col mem-compare__col--paid">
            <div className="mem-compare__h mem-compare__h--paid">会员版 · {paidPlan.name}</div>
            <ul>
              {paidPlan.benefits.map((b) => (
                <li key={b}>
                  <span className="mem-cmp-ic mem-cmp-ic--on">★</span>
                  {b}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* 升级三步引导 */}
      <div className="card mem-steps">
        <div className="mem-step">
          <b>1</b>
          <span>选套餐</span>
        </div>
        <div className="mem-step__arrow">→</div>
        <div className="mem-step">
          <b>2</b>
          <span>安全支付</span>
        </div>
        <div className="mem-step__arrow">→</div>
        <div className="mem-step">
          <b>3</b>
          <span>即时开通</span>
        </div>
      </div>

      {sandbox && (
        <div className="card card--warning" style={{ marginTop: 12, fontSize: 13 }}>
          当前为<strong>演示支付</strong>：尚未接入真实收银台（需支付商户号 + 网关，后端返回绝对 pay_url 后自动切换为跳转支付）。演示下单会即时开通会员，不产生真实扣款。
        </div>
      )}

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

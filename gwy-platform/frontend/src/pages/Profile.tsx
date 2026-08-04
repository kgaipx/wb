import { useEffect, useState } from "react";
import { api, Dashboard } from "../api/client";

export default function Profile() {
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [plan, setPlan] = useState("free");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  // 申论批改 demo
  const [essay, setEssay] = useState("");
  const [grade, setGrade] = useState<any>(null);

  // 退费 demo
  const [refundMsg, setRefundMsg] = useState("");

  useEffect(() => {
    api.dashboard().then((d) => { setDash(d); setPlan(d.user.plan); }).catch((e) => setErr(e.message));
  }, []);

  async function buy(plan: string) {
    setMsg("");
    try {
      const o = await api.createOrder(plan);
      setPlan(o.plan);
      setMsg(`已开通 ${plan}（订单 #${o.id}，¥${(o.amount / 100).toFixed(0)}）`);
    } catch (e: any) { setErr(e.message); }
  }
  async function refund() {
    setRefundMsg("");
    try {
      const b = await api.myBilling();
      if (!b.orders.length) { setRefundMsg("请先开通会员再申请退费"); return; }
      const r = await api.requestRefund(b.orders[0].id, "不适合当前备考计划");
      setPlan("free");
      setRefundMsg(`退费申请 #${r.id}：¥${(r.amount / 100).toFixed(0)}，状态 ${r.status}（3 个工作日内到账）`);
    } catch (e: any) { setRefundMsg(e.message); }
  }
  async function gradeEssay() {
    setGrade(null);
    try {
      setGrade(await api.essayGrade(essay, "请围绕给定主题写一篇短文", 100));
    } catch (e: any) { setErr(e.message); }
  }

  if (err) return <section><h2>我的</h2><div style={{ color: "#dc2626" }}>{err}</div></section>;
  if (!dash) return <section><h2>我的</h2><div style={{ color: "#888" }}>加载中…（需先登录）</div></section>;

  return (
    <section>
      <h2>我的</h2>
      <div style={card}>
        <strong>{dash.user.nickname || dash.user.email}</strong>
        <div style={{ fontSize: 14, color: "#555", marginTop: 4 }}>
          {dash.user.target_exam} · 会员：<b>{plan}</b>
        </div>
        <div style={{ fontSize: 13, color: "#888", marginTop: 2 }}>
          累计答题 {dash.total_answers} · 正确率 {Math.round(dash.correct_rate * 100)}%
        </div>
      </div>

      {/* 透明定价 / 会员（WBS 7.1） */}
      <div style={{ ...card, marginTop: 12 }}>
        <strong>会员与透明定价</strong>
        <div style={{ fontSize: 13, color: "#666", margin: "6px 0" }}>
          会员 ¥99/月 · 年卡 ¥990/年 · <b>7 日内全额退、30 日内退 50%、超期转人工</b>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={btn} disabled={plan !== "free"} onClick={() => buy("pro")}>开通会员 ¥99</button>
          <button style={btnGhost} disabled={plan === "free"} onClick={refund}>无忧退费</button>
        </div>
        {msg && <div style={{ color: "#16a34a", fontSize: 13, marginTop: 6 }}>{msg}</div>}
        {refundMsg && <div style={{ color: "#16a34a", fontSize: 13, marginTop: 6 }}>{refundMsg}</div>}
      </div>

      {/* 申论批改（WBS 4.1） */}
      <div style={{ ...card, marginTop: 12 }}>
        <strong>申论 AI 批改</strong>
        <textarea style={{ ...input, height: 80, marginTop: 6 }} placeholder="粘贴你的申论作答…" value={essay} onChange={(e) => setEssay(e.target.value)} />
        <button style={btn} disabled={!essay} onClick={gradeEssay}>批改（满分 100）</button>
        {grade && (
          <div style={{ marginTop: 8, padding: 10, background: "#f5f8ff", borderRadius: 8 }}>
            <div><b>总分：{grade.total}</b> {grade.needs_human_review && <span style={{ color: "#d97706" }}>（已转人工复核）</span>}</div>
            <div style={{ fontSize: 13, color: "#555" }}>
              {Object.entries(grade.dimensions).map(([k, v]) => `${k} ${v}`).join(" · ")}
            </div>
            {grade.rationale && <div style={{ fontSize: 13, marginTop: 4 }}>{grade.rationale}</div>}
          </div>
        )}
      </div>
    </section>
  );
}

const card: React.CSSProperties = { padding: 16, background: "#fff", borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const input: React.CSSProperties = { width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: 8, boxSizing: "border-box", fontFamily: "inherit" };
const btn: React.CSSProperties = { width: "100%", padding: "10px 0", background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, fontSize: 15 };
const btnGhost: React.CSSProperties = { flex: 1, padding: "10px 0", background: "#fff", color: "#2563eb", border: "1px solid #2563eb", borderRadius: 8, fontSize: 15 };

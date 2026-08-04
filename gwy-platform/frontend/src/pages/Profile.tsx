import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, Dashboard } from "../api/client";

export default function Profile() {
  const nav = useNavigate();
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [plan, setPlan] = useState("free");
  const [wrongCount, setWrongCount] = useState(0);
  const [favCount, setFavCount] = useState(0);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const [essay, setEssay] = useState("");
  const [grade, setGrade] = useState<any>(null);
  const [refundMsg, setRefundMsg] = useState("");

  useEffect(() => {
    api.dashboard().then((d) => {
      setDash(d);
      setPlan(d.user.plan);
    }).catch((e) => setErr(e.message));
    api.wrongList().then((w) => setWrongCount(w.length)).catch(() => {});
    api.favoriteList().then((f) => setFavCount(f.length)).catch(() => {});
  }, []);

  async function buy(p: string) {
    setMsg("");
    try {
      const o = await api.createOrder(p);
      setPlan(o.plan);
      setMsg(`已开通 ${p}（订单 #${o.id}，¥${(o.amount / 100).toFixed(0)}）`);
    } catch (e: any) {
      setErr(e.message);
    }
  }
  async function refund() {
    setRefundMsg("");
    try {
      const b = await api.myBilling();
      if (!b.orders.length) {
        setRefundMsg("请先开通会员再申请退费");
        return;
      }
      const r = await api.requestRefund(b.orders[0].id, "不适合当前备考计划");
      setPlan("free");
      setRefundMsg(`退费申请 #${r.id}：¥${(r.amount / 100).toFixed(0)}，状态 ${r.status}（3 个工作日内到账）`);
    } catch (e: any) {
      setRefundMsg(e.message);
    }
  }
  async function gradeEssay() {
    setGrade(null);
    try {
      setGrade(await api.essayGrade(essay, "请围绕给定主题写一篇短文", 100));
    } catch (e: any) {
      setErr(e.message);
    }
  }

  if (err) return <section><h2 className="page-title">我的</h2><div className="err-text">{err}</div></section>;
  if (!dash) return <section><h2 className="page-title">我的</h2><div className="muted">加载中…（需先登录）</div></section>;

  return (
    <section>
      <h2 className="page-title">我的</h2>
      <div className="card">
        <strong>{dash.user.nickname || dash.user.email}</strong>
        <div className="muted" style={{ marginTop: 4 }}>
          {dash.user.target_exam} · 会员：<b className="text-brand">{plan}</b>
        </div>
        <div className="text-3" style={{ marginTop: 2, fontSize: 13 }}>
          累计答题 {dash.total_answers} · 正确率 {Math.round(dash.correct_rate * 100)}%
        </div>
      </div>

      {/* 透明定价 / 会员（WBS 7.1） */}
      <div className="card" style={{ marginTop: 12 }}>
        <strong>学习管理</strong>
        <div className="row" style={{ gap: 8, marginTop: 8 }}>
          <button className="manage-card" onClick={() => nav("/wrong")}>
            <span className="manage-card__num">{wrongCount}</span>
            <span className="manage-card__label">待复盘错题</span>
          </button>
          <button className="manage-card" onClick={() => nav("/favorites")}>
            <span className="manage-card__num">{favCount}</span>
            <span className="manage-card__label">我的收藏</span>
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <strong>会员与透明定价</strong>
        <div className="price-note">
          会员 ¥99/月 · 年卡 ¥990/年 · <b className="text-accent">7 日内全额退、30 日内退 50%、超期转人工</b>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn--primary" style={{ flex: 1 }} disabled={plan !== "free"} onClick={() => buy("pro")}>
            开通会员 ¥99
          </button>
          <button className="btn btn--ghost" style={{ flex: 1 }} disabled={plan === "free"} onClick={refund}>
            无忧退费
          </button>
        </div>
        {msg && <div className="ok-text">{msg}</div>}
        {refundMsg && <div className="ok-text">{refundMsg}</div>}
      </div>

      {/* 内容可信 / 双签审核台（WBS 5.2 信任保障） */}
      <div className="card card--soft" style={{ marginTop: 12 }}>
        <div className="row row--between">
          <strong>内容可信 · 双签审核台</strong>
          <span className="badge badge--soft">运营后台</span>
        </div>
        <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          AI 生成内容须经两名审核员复核通过方可发布，版本留痕、可溯可纠。
        </div>
        <button className="btn btn--ghost btn--sm" style={{ marginTop: 10 }} onClick={() => nav("/review")}>
          进入审核台 →
        </button>
      </div>

      {/* 申论批改（WBS 4.1） */}
      <div className="card" style={{ marginTop: 12 }}>
        <strong>申论 AI 批改</strong>
        <textarea
          className="textarea"
          style={{ marginTop: 6 }}
          placeholder="粘贴你的申论作答…"
          value={essay}
          onChange={(e) => setEssay(e.target.value)}
        />
        <button className="btn btn--primary btn--block" style={{ marginTop: 8 }} disabled={!essay} onClick={gradeEssay}>
          批改（满分 100）
        </button>
        {grade && (
          <div className="tutor-box" style={{ marginTop: 8 }}>
            <div>
              <b>总分：{grade.total}</b>{" "}
              {grade.needs_human_review && <span className="text-warning">（已转人工复核）</span>}
            </div>
            <div className="muted" style={{ fontSize: 13 }}>
              {Object.entries(grade.dimensions).map(([k, v]) => `${k} ${v}`).join(" · ")}
            </div>
            {grade.rationale && <div style={{ fontSize: 13, marginTop: 4 }}>{grade.rationale}</div>}
          </div>
        )}
      </div>
    </section>
  );
}
